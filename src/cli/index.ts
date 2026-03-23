#!/usr/bin/env bun
import { Command } from "commander";
import chalk from "chalk";
import { getDatabase, resolvePartialId } from "../db/database.js";
import { listProviders, getProvider, getProviderByName, deleteProvider, ensureProvider } from "../db/providers.js";
import { createCardRecord, listCards, getCard, updateCard } from "../db/cards.js";
import { listTransactions } from "../db/transactions.js";
import { registerAgent, listAgents } from "../db/agents.js";
import { getProviderInstance } from "../providers/index.js";
import { loadConfig, saveConfig, setProviderConfig, removeProviderConfig, getProviderConfig } from "../lib/config.js";
import { runDoctor } from "../lib/doctor.js";
import { formatCard, formatProvider, formatTransaction } from "../lib/format.js";
import type { Card } from "../types/index.js";
import { readFileSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

function getVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(import.meta.dir, "../../package.json"), "utf-8"));
    return pkg.version || "0.1.0";
  } catch {
    return "0.1.0";
  }
}

function resolveId(partialId: string, table = "cards"): string {
  const db = getDatabase();
  const id = resolvePartialId(db, table, partialId);
  if (!id) {
    console.error(chalk.red(`Could not resolve ID: ${partialId}`));
    process.exit(1);
  }
  return id;
}

const statusColors: Record<string, (s: string) => string> = {
  active: chalk.green,
  pending: chalk.yellow,
  frozen: chalk.blue,
  closed: chalk.gray,
  inactive: chalk.gray,
  error: chalk.red,
};

function colorStatus(status: string): string {
  const fn = statusColors[status] || chalk.white;
  return fn(status);
}

const program = new Command();

program
  .name("wallets")
  .description("Universal wallet management for AI agents - multi-provider virtual cards")
  .version(getVersion())
  .option("--json", "Output as JSON");

// ── Provider commands ──────────────────────────────────────────────────────

const providerCmd = program.command("provider").description("Manage wallet providers");

providerCmd
  .command("add <type>")
  .description("Register a wallet provider (e.g., agentcard)")
  .option("-n, --name <name>", "Provider display name")
  .option("--jwt <token>", "JWT/API token for authentication")
  .option("--api-key <key>", "API key for authentication")
  .option("--base-url <url>", "Custom API base URL")
  .option("--default", "Set as default provider")
  .action((type: string, opts: { name?: string; jwt?: string; apiKey?: string; baseUrl?: string; default?: boolean }) => {
    const name = opts.name || type;
    const config: Record<string, unknown> = {};

    if (opts.jwt) config["jwt"] = opts.jwt;
    if (opts.apiKey) config["api_key"] = opts.apiKey;
    if (opts.baseUrl) config["baseUrl"] = opts.baseUrl;

    const provider = ensureProvider(name, type, config);
    setProviderConfig(name, config);

    if (opts.default) {
      const cfg = loadConfig();
      cfg.default_provider = name;
      saveConfig(cfg);
    }

    const globalOpts = program.opts();
    if (globalOpts["json"]) {
      console.log(JSON.stringify(provider, null, 2));
    } else {
      console.log(chalk.green(`Provider registered: ${formatProvider(provider)}`));
      if (opts.default) console.log(chalk.dim(`  Set as default provider`));
    }
  });

providerCmd
  .command("list")
  .description("List registered providers")
  .action(() => {
    const providers = listProviders();
    const globalOpts = program.opts();

    if (globalOpts["json"]) {
      console.log(JSON.stringify(providers, null, 2));
      return;
    }

    if (providers.length === 0) {
      console.log(chalk.yellow("No providers registered. Use 'wallets provider add <type>' to add one."));
      return;
    }

    const config = loadConfig();
    console.log(chalk.bold("Providers:"));
    for (const p of providers) {
      const isDefault = config.default_provider === p.name;
      const defaultTag = isDefault ? chalk.cyan(" (default)") : "";
      console.log(`  ${chalk.dim(p.id.slice(0, 8))} ${colorStatus(p.status).padEnd(18)} ${p.type.padEnd(12)} ${p.name}${defaultTag}`);
    }
  });

providerCmd
  .command("remove <name>")
  .description("Remove a provider")
  .action((name: string) => {
    const provider = getProviderByName(name);
    if (!provider) {
      console.error(chalk.red(`Provider not found: ${name}`));
      process.exit(1);
    }
    deleteProvider(provider.id);
    removeProviderConfig(name);

    const config = loadConfig();
    if (config.default_provider === name) {
      delete config.default_provider;
      saveConfig(config);
    }

    console.log(chalk.green(`Provider removed: ${name}`));
  });

// ── Card commands ──────────────────────────────────────────────────────────

const cardCmd = program.command("card").description("Manage virtual cards");

cardCmd
  .command("create")
  .description("Create a new funded virtual card")
  .requiredOption("-a, --amount <amount>", "Funding amount in dollars")
  .option("-n, --name <name>", "Card display name")
  .option("-p, --provider <name>", "Provider to use (default from config)")
  .option("-c, --currency <code>", "Currency code (default: USD)")
  .option("--agent <name>", "Assign card to an agent")
  .action(async (opts: { amount: string; name?: string; provider?: string; currency?: string; agent?: string }) => {
    const config = loadConfig();
    const providerName = opts.provider || config.default_provider;

    if (!providerName) {
      console.error(chalk.red("No provider specified and no default set. Use --provider or 'wallets provider add --default'."));
      process.exit(1);
    }

    const providerRecord = getProviderByName(providerName);
    if (!providerRecord) {
      console.error(chalk.red(`Provider not found: ${providerName}`));
      process.exit(1);
    }

    const providerConfig = { ...providerRecord.config, ...(getProviderConfig(providerName) || {}) };
    const instance = getProviderInstance(providerRecord.type, providerConfig);

    let agentId: string | null = null;
    if (opts.agent) {
      const agent = registerAgent({ name: opts.agent });
      agentId = agent.id;
    }

    try {
      const result = await instance.createCard({
        amount: parseFloat(opts.amount),
        name: opts.name,
        currency: (opts.currency as Card["currency"]) || "USD",
        agent_id: agentId ?? undefined,
      });

      const card = createCardRecord({
        provider_id: providerRecord.id,
        external_id: result.external_id || result.id,
        name: result.name,
        last_four: result.last_four,
        brand: result.brand,
        status: result.status,
        currency: result.currency,
        balance: result.balance,
        funded_amount: result.funded_amount,
        spending_limit: result.spending_limit,
        agent_id: agentId,
        metadata: result.funding_url ? { funding_url: result.funding_url } : {},
      });

      const globalOpts = program.opts();
      if (globalOpts["json"]) {
        console.log(JSON.stringify({ ...card, funding_url: result.funding_url }, null, 2));
      } else {
        console.log(chalk.green(`Card created: ${formatCard(card)}`));
        if (result.funding_url) {
          console.log(chalk.cyan(`  Fund at: ${result.funding_url}`));
        }
      }
    } catch (e) {
      console.error(chalk.red(`Failed to create card: ${e instanceof Error ? e.message : String(e)}`));
      process.exit(1);
    }
  });

cardCmd
  .command("list")
  .description("List all cards")
  .option("-s, --status <status>", "Filter by status")
  .option("-p, --provider <name>", "Filter by provider")
  .option("--agent <name>", "Filter by agent")
  .action((opts: { status?: string; provider?: string; agent?: string }) => {
    let providerId: string | undefined;
    if (opts.provider) {
      const p = getProviderByName(opts.provider);
      if (p) providerId = p.id;
    }

    const cards = listCards({
      status: opts.status as Card["status"],
      provider_id: providerId,
    });

    const globalOpts = program.opts();
    if (globalOpts["json"]) {
      console.log(JSON.stringify(cards, null, 2));
      return;
    }

    if (cards.length === 0) {
      console.log(chalk.yellow("No cards found. Use 'wallets card create' to create one."));
      return;
    }

    console.log(chalk.bold("Cards:"));
    for (const card of cards) {
      const last4 = card.last_four ? `*${card.last_four}` : "----";
      console.log(`  ${chalk.dim(card.id.slice(0, 8))} ${colorStatus(card.status).padEnd(18)} ${last4.padEnd(6)} $${card.balance.toFixed(2).padStart(10)} ${card.name}`);
    }
  });

cardCmd
  .command("details <id>")
  .description("Get full card details including PAN and CVV")
  .action(async (id: string) => {
    const cardId = resolveId(id, "cards");
    const card = getCard(cardId);
    if (!card) {
      console.error(chalk.red(`Card not found: ${id}`));
      process.exit(1);
    }

    const provider = getProvider(card.provider_id);
    if (!provider) {
      console.error(chalk.red(`Provider not found for card`));
      process.exit(1);
    }

    const providerConfig = { ...provider.config, ...(getProviderConfig(provider.name) || {}) };
    const instance = getProviderInstance(provider.type, providerConfig);

    try {
      const details = await instance.getCardDetails(card.external_id);
      const globalOpts = program.opts();

      if (globalOpts["json"]) {
        console.log(JSON.stringify(details, null, 2));
      } else {
        console.log(chalk.bold("Card Details:"));
        console.log(`  ID:      ${card.id}`);
        console.log(`  Name:    ${card.name}`);
        console.log(`  PAN:     ${details.pan}`);
        console.log(`  CVV:     ${details.cvv}`);
        console.log(`  Exp:     ${details.exp_month}/${details.exp_year}`);
        console.log(`  Status:  ${colorStatus(card.status)}`);
        console.log(`  Balance: $${details.balance.toFixed(2)}`);
      }
    } catch (e) {
      console.error(chalk.red(`Failed to get details: ${e instanceof Error ? e.message : String(e)}`));
      process.exit(1);
    }
  });

cardCmd
  .command("close <id>")
  .description("Close a card permanently")
  .action(async (id: string) => {
    const cardId = resolveId(id, "cards");
    const card = getCard(cardId);
    if (!card) {
      console.error(chalk.red(`Card not found: ${id}`));
      process.exit(1);
    }

    const provider = getProvider(card.provider_id);
    if (!provider) {
      console.error(chalk.red(`Provider not found for card`));
      process.exit(1);
    }

    const providerConfig = { ...provider.config, ...(getProviderConfig(provider.name) || {}) };
    const instance = getProviderInstance(provider.type, providerConfig);

    try {
      await instance.closeCard(card.external_id);
      updateCard(cardId, { status: "closed" });
      console.log(chalk.green(`Card closed: ${card.id.slice(0, 8)} ${card.name}`));
    } catch (e) {
      console.error(chalk.red(`Failed to close card: ${e instanceof Error ? e.message : String(e)}`));
      process.exit(1);
    }
  });

// ── Balance command ────────────────────────────────────────────────────────

program
  .command("balance [card-id]")
  .description("Check balance of a card or all cards")
  .action(async (cardId?: string) => {
    if (cardId) {
      const resolved = resolveId(cardId, "cards");
      const card = getCard(resolved);
      if (!card) {
        console.error(chalk.red(`Card not found: ${cardId}`));
        process.exit(1);
      }

      const provider = getProvider(card.provider_id);
      if (!provider) {
        console.error(chalk.red(`Provider not found for card`));
        process.exit(1);
      }

      const providerConfig = { ...provider.config, ...(getProviderConfig(provider.name) || {}) };
      const instance = getProviderInstance(provider.type, providerConfig);

      try {
        const { balance, currency } = await instance.getBalance(card.external_id);
        const globalOpts = program.opts();
        if (globalOpts["json"]) {
          console.log(JSON.stringify({ card_id: card.id, balance, currency }, null, 2));
        } else {
          console.log(`${chalk.dim(card.id.slice(0, 8))} ${card.name}: ${chalk.green(`$${balance.toFixed(2)}`)} ${currency}`);
        }
      } catch (e) {
        console.error(chalk.red(`Failed to get balance: ${e instanceof Error ? e.message : String(e)}`));
        process.exit(1);
      }
    } else {
      const cards = listCards({ status: "active" });
      if (cards.length === 0) {
        console.log(chalk.yellow("No active cards."));
        return;
      }
      for (const card of cards) {
        console.log(`${chalk.dim(card.id.slice(0, 8))} ${card.name}: ${chalk.green(`$${card.balance.toFixed(2)}`)} ${card.currency}`);
      }
    }
  });

// ── Transactions command ───────────────────────────────────────────────────

program
  .command("transactions [card-id]")
  .description("List transactions")
  .option("-n, --limit <n>", "Limit results", "20")
  .action((cardId: string | undefined, opts: { limit: string }) => {
    let resolvedCardId: string | undefined;
    if (cardId) {
      resolvedCardId = resolveId(cardId, "cards");
    }

    const txns = listTransactions({
      card_id: resolvedCardId,
      limit: parseInt(opts.limit, 10),
    });

    const globalOpts = program.opts();
    if (globalOpts["json"]) {
      console.log(JSON.stringify(txns, null, 2));
      return;
    }

    if (txns.length === 0) {
      console.log(chalk.yellow("No transactions found."));
      return;
    }

    console.log(chalk.bold("Transactions:"));
    for (const tx of txns) {
      console.log(`  ${formatTransaction(tx)}`);
    }
  });

// ── Doctor command ─────────────────────────────────────────────────────────

program
  .command("doctor")
  .description("Run diagnostics and check wallet health")
  .action(() => {
    const result = runDoctor();
    const globalOpts = program.opts();

    if (globalOpts["json"]) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    console.log(chalk.bold("Wallet Health Check:"));
    console.log();
    for (const check of result.checks) {
      const icon = check.status === "ok" ? chalk.green("[ok]") : check.status === "warn" ? chalk.yellow("[!!]") : chalk.red("[ERR]");
      console.log(`  ${icon} ${chalk.bold(check.name)}: ${check.message}`);
    }
    console.log();
    if (result.healthy) {
      console.log(chalk.green("All checks passed."));
    } else {
      console.log(chalk.red("Some checks failed. Run 'wallets doctor' with --json for details."));
    }
  });

// ── MCP command ────────────────────────────────────────────────────────────

program
  .command("mcp")
  .description("Install/configure MCP server for AI agents")
  .option("--claude", "Install for Claude Code")
  .option("--codex", "Install for Codex")
  .option("--gemini", "Install for Gemini")
  .option("--all", "Install for all agents")
  .option("--uninstall", "Uninstall MCP server")
  .action((opts: { claude?: boolean; codex?: boolean; gemini?: boolean; all?: boolean; uninstall?: boolean }) => {
    const targets: string[] = [];
    if (opts.all) {
      targets.push("claude", "codex", "gemini");
    } else {
      if (opts.claude) targets.push("claude");
      if (opts.codex) targets.push("codex");
      if (opts.gemini) targets.push("gemini");
    }

    if (targets.length === 0) {
      targets.push("claude");
    }

    for (const target of targets) {
      try {
        if (target === "claude") {
          if (opts.uninstall) {
            execSync("claude mcp remove wallets", { encoding: "utf-8" });
            console.log(chalk.green("Removed wallets MCP from Claude Code"));
          } else {
            execSync("claude mcp add --transport stdio --scope user wallets -- wallets-mcp", { encoding: "utf-8" });
            console.log(chalk.green("Installed wallets MCP for Claude Code"));
          }
        } else if (target === "codex") {
          console.log(chalk.yellow(`Codex MCP setup: Add to ~/.codex/config.toml:`));
          console.log(chalk.dim(`  [mcp_servers.wallets]`));
          console.log(chalk.dim(`  command = "wallets-mcp"`));
          console.log(chalk.dim(`  args = []`));
        } else if (target === "gemini") {
          console.log(chalk.yellow(`Gemini MCP setup: Add to ~/.gemini/settings.json:`));
          console.log(chalk.dim(`  "wallets": { "command": "wallets-mcp", "args": [] }`));
        }
      } catch (e) {
        console.error(chalk.red(`Failed to setup MCP for ${target}: ${e instanceof Error ? e.message : String(e)}`));
      }
    }
  });

// ── Agent commands ─────────────────────────────────────────────────────────

const agentCmd = program.command("agent").description("Manage agent registrations");

agentCmd
  .command("list")
  .description("List registered agents")
  .action(() => {
    const agents = listAgents();
    const globalOpts = program.opts();

    if (globalOpts["json"]) {
      console.log(JSON.stringify(agents, null, 2));
      return;
    }

    if (agents.length === 0) {
      console.log(chalk.yellow("No agents registered."));
      return;
    }

    for (const agent of agents) {
      console.log(`  ${chalk.dim(agent.id)} ${agent.name}${agent.description ? chalk.dim(` — ${agent.description}`) : ""}`);
    }
  });

agentCmd
  .command("register <name>")
  .description("Register an agent")
  .option("-d, --description <text>", "Agent description")
  .action((name: string, opts: { description?: string }) => {
    const agent = registerAgent({ name, description: opts.description });
    console.log(chalk.green(`Agent registered: ${agent.id} ${agent.name}`));
  });

// Top-level remove/uninstall — delegates to provider/card remove
program
  .command("remove <type> <name>")
  .alias("rm")
  .alias("uninstall")
  .description("Remove a record. Type: provider | card")
  .action((type: string, name: string) => {
    try {
      switch (type.toLowerCase()) {
        case "provider": {
          const provider = getProviderByName(name);
          if (!provider) {
            console.error(chalk.red(`Provider not found: ${name}`));
            process.exit(1);
          }
          deleteProvider(provider.id);
          removeProviderConfig(name);
          const config = loadConfig();
          if (config.default_provider === name) { delete config.default_provider; saveConfig(config); }
          console.log(chalk.green(`✓ Provider removed: ${name}`));
          break;
        }
        case "card": {
          const db = getDatabase();
          const cardId = resolvePartialId(db, "cards", name) ?? name;
          const card = getCard(cardId);
          if (!card) { console.error(chalk.red(`Card not found: ${name}`)); process.exit(1); }
          updateCard(cardId, { status: "closed" });
          console.log(chalk.green(`✓ Card ${cardId.slice(0, 8)} closed`));
          break;
        }
        default:
          console.error(chalk.red(`Unknown type: ${type}. Use: provider | card`));
          process.exit(1);
      }
    } catch (e) {
      console.error(chalk.red(`Failed: ${e instanceof Error ? e.message : String(e)}`));
      process.exit(1);
    }
  });

// ── feedback ──────────────────────────────────────────────────────────────────

program
  .command("feedback <message>")
  .description("Send feedback about this service")
  .option("-e, --email <email>", "Contact email")
  .option("-c, --category <cat>", "Category: bug, feature, general", "general")
  .action(async (message: string, opts: { email?: string; category?: string }) => {
    try {
      const db = getDatabase();
      const version = getVersion();
      db.run(
        "INSERT INTO feedback (message, email, category, version) VALUES (?, ?, ?, ?)",
        [message, opts.email || null, opts.category || "general", version]
      );
      console.log(chalk.green("✓") + " Feedback saved. Thank you!");
    } catch (e) {
      console.error(chalk.red(`Failed: ${e instanceof Error ? e.message : String(e)}`));
      process.exit(1);
    }
  });

program.parse();
