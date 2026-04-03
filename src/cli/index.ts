#!/usr/bin/env bun
import { Command } from "commander";
import chalk from "chalk";
import jmespath from "jmespath";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { getDatabase, resolvePartialId, resolveCardId } from "../db/database.js";
import { listProviders, getProvider, getProviderByName, deleteProvider, ensureProvider } from "../db/providers.js";
import { createCardRecord, listCards, getCard, updateCard, getCardByIdempotencyKey } from "../db/cards.js";
import { listTransactions } from "../db/transactions.js";
import { registerAgent, listAgents, getAgent } from "../db/agents.js";
import { listAuditLog, type AuditEntry } from "../db/audit.js";
import { getProviderInstance } from "../providers/index.js";
import { loadConfig, saveConfig, setProviderConfig, removeProviderConfig, getProviderConfig, getConfigDir, getConfigPath, type WalletsConfig } from "../lib/config.js";
import { runDoctor } from "../lib/doctor.js";
import { formatCard, formatProvider, formatTransaction } from "../lib/format.js";
import type { Card } from "../types/index.js";
import { EXIT_CODES } from "../types/index.js";
import { readFileSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

function exit(code: number, msg?: string): never {
  if (msg) console.error(msg);
  process.exit(code);
}

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
  let id: string | null = null;
  if (table === "cards") {
    id = resolveCardId(db, partialId);
  } else {
    id = resolvePartialId(db, table, partialId);
  }
  if (!id) {
    console.error(chalk.red(`Could not resolve ID: ${partialId}`));
    exit(EXIT_CODES.NOT_FOUND);
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
  .option("--json", "Output as JSON")
  .option("--filter <jmespath>", "JMESPath filter to apply to JSON output (e.g. 'cards[?status==`active`]')")
  .option("-q, --quiet", "Suppress all output except errors")
  .option("-s, --silent", "Same as --quiet");

// ── Output helpers ─────────────────────────────────────────────────────────

function shouldOutput(): boolean {
  const opts = program.opts();
  return !opts.quiet && !opts.silent;
}

function applyJsonFilter(data: unknown): unknown {
  const opts = program.opts();
  const filter = opts.filter as string | undefined;
  if (!filter) return data;
  try {
    return jmespath.search(data, filter);
  } catch (e) {
    console.error(chalk.yellow(`Filter error: ${e instanceof Error ? e.message : String(e)}`));
    return data;
  }
}

function printJson(data: unknown): void {
  console.log(JSON.stringify(applyJsonFilter(data), null, 2));
}

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
      printJson(provider);
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
      printJson(providers);
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
      exit(EXIT_CODES.ERROR);
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
  .option("--idempotency-key <key>", "Unique key to prevent duplicate cards on retry")
  .option("--dry-run", "Preview the action without executing")
  .action(async (opts: { amount: string; name?: string; provider?: string; currency?: string; agent?: string; idempotencyKey?: string; dryRun?: boolean }) => {
    // Check for existing card with same idempotency key
    if (opts.idempotencyKey) {
      const existing = getCardByIdempotencyKey(opts.idempotencyKey);
      if (existing) {
        const globalOpts = program.opts();
        if (globalOpts["json"]) {
          printJson({ ...existing, _note: "existing card returned for idempotency key" });
        } else {
          console.log(chalk.yellow(`Card already exists for idempotency key: ${existing.id.slice(0, 8)} ${existing.name}`));
        }
        return;
      }
    }

    const config = loadConfig();
    const providerName = opts.provider || config.default_provider;

    if (!providerName) {
      console.error(chalk.red("No provider specified and no default set. Use --provider or 'wallets provider add --default'."));
      exit(EXIT_CODES.VALIDATION);
    }

    const providerRecord = getProviderByName(providerName);
    if (!providerRecord) {
      console.error(chalk.red(`Provider not found: ${providerName}`));
      exit(EXIT_CODES.NOT_FOUND);
    }

    if (opts.dryRun) {
      console.log(chalk.yellow(`[dry-run] Would create card: amount=${opts.amount}, provider=${providerName}, name=${opts.name || "unnamed"}`));
      return;
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
        idempotency_key: opts.idempotencyKey ?? null,
      });

      const globalOpts = program.opts();
      if (globalOpts["json"]) {
        printJson({ ...card, funding_url: result.funding_url });
      } else if (shouldOutput()) {
        console.log(chalk.green(`Card created: ${formatCard(card)}`));
        if (result.funding_url) {
          console.log(chalk.cyan(`  Fund at: ${result.funding_url}`));
        }
      }
    } catch (e) {
      console.error(chalk.red(`Failed to create card: ${e instanceof Error ? e.message : String(e)}`));
      exit(EXIT_CODES.ERROR);
    }
  });

cardCmd
  .command("create-batch")
  .description("Create multiple cards at once")
  .requiredOption("-a, --amounts <amounts>", "Comma-separated funding amounts (e.g., 10,20,50)")
  .option("-n, --names <names>", "Comma-separated card names (optional)")
  .option("-p, --provider <name>", "Provider to use (default from config)")
  .option("-c, --currency <code>", "Currency code (default: USD)")
  .option("--agent <name>", "Assign cards to an agent")
  .option("--idempotency-key <key>", "Unique key prefix for preventing duplicates")
  .option("--dry-run", "Preview the action without executing")
  .action(async (opts: { amounts: string; names?: string; provider?: string; currency?: string; agent?: string; idempotencyKey?: string; dryRun?: boolean }) => {
    const config = loadConfig();
    const providerName = opts.provider || config.default_provider;

    if (!providerName) {
      console.error(chalk.red("No provider specified and no default set. Use --provider or 'wallets provider add --default'."));
      exit(EXIT_CODES.VALIDATION);
    }

    const providerRecord = getProviderByName(providerName);
    if (!providerRecord) {
      console.error(chalk.red(`Provider not found: ${providerName}`));
      exit(EXIT_CODES.NOT_FOUND);
    }

    const amounts = opts.amounts.split(",").map((a) => parseFloat(a.trim()));
    const names = opts.names ? opts.names.split(",").map((n) => n.trim()) : [];
    const currency = (opts.currency as Card["currency"]) || "USD";

    if (amounts.some(isNaN)) {
      console.error(chalk.red("Invalid amounts. Use comma-separated numbers (e.g., 10,20,50)"));
      exit(EXIT_CODES.VALIDATION);
    }

    if (opts.dryRun) {
      console.log(chalk.yellow(`[dry-run] Would create ${amounts.length} cards:`));
      amounts.forEach((amt, i) => {
        console.log(chalk.yellow(`  - amount=${amt}, name=${names[i] || "unnamed"}, provider=${providerName}`));
      });
      return;
    }

    const providerConfig = { ...providerRecord.config, ...(getProviderConfig(providerName) || {}) };
    const instance = getProviderInstance(providerRecord.type, providerConfig);

    let agentId: string | null = null;
    if (opts.agent) {
      const agent = registerAgent({ name: opts.agent });
      agentId = agent.id;
    }

    const results: Card[] = [];
    const errors: string[] = [];

    for (let i = 0; i < amounts.length; i++) {
      const amount = amounts[i]!;
      const name = names[i] || `Batch Card ${i + 1}`;
      const idempotencyKey = opts.idempotencyKey ? `${opts.idempotencyKey}-${i}` : undefined;

      try {
        // Check idempotency
        if (idempotencyKey) {
          const existing = getCardByIdempotencyKey(idempotencyKey);
          if (existing) {
            results.push(existing);
            continue;
          }
        }

        const result = await instance.createCard({
          amount,
          name,
          currency,
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
          idempotency_key: idempotencyKey ?? null,
        });
        results.push(card);
      } catch (e) {
        errors.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    const globalOpts = program.opts();
    if (globalOpts["json"]) {
      printJson({ cards: results, errors: errors.length > 0 ? errors : undefined });
    } else {
      if (shouldOutput()) {
        console.log(chalk.green(`Created ${results.length}/${amounts.length} cards:`));
        for (const card of results) {
          console.log(`  ${formatCard(card)}`);
        }
        if (errors.length > 0) {
          console.log(chalk.red(`\nFailed ${errors.length}:`));
          for (const err of errors) {
            console.log(chalk.red(`  ${err}`));
          }
        }
      }
    }
  });

cardCmd
  .command("list")
  .description("List all cards")
  .option("-s, --status <status>", "Filter by status")
  .option("-p, --provider <name>", "Filter by provider")
  .option("--agent <name>", "Filter by agent")
  .option("-f, --format <type>", "Output format: table, json, csv", "table")
  .action((opts: { status?: string; provider?: string; agent?: string; format?: string }) => {
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
    const format = opts.format || (globalOpts["json"] ? "json" : "table");

    if (format === "json") {
      printJson(cards);
      return;
    }

    if (format === "csv") {
      console.log("id,status,last_four,balance,currency,name,provider_id,created_at");
      for (const card of cards) {
        console.log(`${card.id},${card.status},${card.last_four || ""},${card.balance},${card.currency},"${card.name}",${card.provider_id},${card.created_at}`);
      }
      return;
    }

    if (cards.length === 0) {
      if (shouldOutput()) console.log(chalk.yellow("No cards found. Use 'wallets card create' to create one."));
      return;
    }

    if (shouldOutput()) {
      console.log(chalk.bold("Cards:"));
      for (const card of cards) {
        const last4 = card.last_four ? `*${card.last_four}` : "----";
        console.log(`  ${chalk.dim(card.id.slice(0, 8))} ${colorStatus(card.status).padEnd(18)} ${last4.padEnd(6)} $${card.balance.toFixed(2).padStart(10)} ${card.name}`);
      }
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
      exit(EXIT_CODES.ERROR);
    }

    const provider = getProvider(card.provider_id);
    if (!provider) {
      console.error(chalk.red(`Provider not found for card`));
      exit(EXIT_CODES.ERROR);
    }

    const providerConfig = { ...provider.config, ...(getProviderConfig(provider.name) || {}) };
    const instance = getProviderInstance(provider.type, providerConfig);

    try {
      const details = await instance.getCardDetails(card.external_id);
      const globalOpts = program.opts();

      if (globalOpts["json"]) {
        printJson(details);
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
      exit(EXIT_CODES.ERROR);
    }
  });

cardCmd
  .command("close <id>")
  .description("Close a card permanently")
  .option("--dry-run", "Preview the action without executing")
  .action(async (id: string, opts: { dryRun?: boolean }) => {
    const cardId = resolveId(id, "cards");
    const card = getCard(cardId);
    if (!card) {
      console.error(chalk.red(`Card not found: ${id}`));
      exit(EXIT_CODES.NOT_FOUND);
    }

    const provider = getProvider(card.provider_id);
    if (!provider) {
      console.error(chalk.red(`Provider not found for card`));
      exit(EXIT_CODES.ERROR);
    }

    if (opts.dryRun) {
      console.log(chalk.yellow(`[dry-run] Would close card: ${card.id.slice(0, 8)} ${card.name}`));
      return;
    }

    const providerConfig = { ...provider.config, ...(getProviderConfig(provider.name) || {}) };
    const instance = getProviderInstance(provider.type, providerConfig);

    try {
      await instance.closeCard(card.external_id);
      updateCard(cardId, { status: "closed" });
      console.log(chalk.green(`Card closed: ${card.id.slice(0, 8)} ${card.name}`));
    } catch (e) {
      console.error(chalk.red(`Failed to close card: ${e instanceof Error ? e.message : String(e)}`));
      exit(EXIT_CODES.ERROR);
    }
  });

cardCmd
  .command("freeze <id>")
  .description("Freeze a card temporarily")
  .option("--dry-run", "Preview the action without executing")
  .action(async (id: string, opts: { dryRun?: boolean }) => {
    const cardId = resolveId(id, "cards");
    const card = getCard(cardId);
    if (!card) {
      console.error(chalk.red(`Card not found: ${id}`));
      exit(EXIT_CODES.NOT_FOUND);
    }

    if (card.status !== "active") {
      console.error(chalk.red(`Card is not active: ${card.status}`));
      exit(EXIT_CODES.VALIDATION);
    }

    if (opts.dryRun) {
      console.log(chalk.yellow(`[dry-run] Would freeze card: ${card.id.slice(0, 8)} ${card.name}`));
      return;
    }

    const provider = getProvider(card.provider_id);
    if (!provider) {
      console.error(chalk.red(`Provider not found for card`));
      exit(EXIT_CODES.ERROR);
    }

    const providerConfig = { ...provider.config, ...(getProviderConfig(provider.name) || {}) };
    const instance = getProviderInstance(provider.type, providerConfig);

    try {
      if (instance.freezeCard) {
        await instance.freezeCard(card.external_id);
      }
      updateCard(cardId, { status: "frozen" });
      console.log(chalk.green(`Card frozen: ${card.id.slice(0, 8)} ${card.name}`));
    } catch (e) {
      console.error(chalk.red(`Failed to freeze card: ${e instanceof Error ? e.message : String(e)}`));
      exit(EXIT_CODES.ERROR);
    }
  });

cardCmd
  .command("unfreeze <id>")
  .description("Unfreeze a frozen card")
  .option("--dry-run", "Preview the action without executing")
  .action(async (id: string, opts: { dryRun?: boolean }) => {
    const cardId = resolveId(id, "cards");
    const card = getCard(cardId);
    if (!card) {
      console.error(chalk.red(`Card not found: ${id}`));
      exit(EXIT_CODES.NOT_FOUND);
    }

    if (card.status !== "frozen") {
      console.error(chalk.red(`Card is not frozen: ${card.status}`));
      exit(EXIT_CODES.VALIDATION);
    }

    if (opts.dryRun) {
      console.log(chalk.yellow(`[dry-run] Would unfreeze card: ${card.id.slice(0, 8)} ${card.name}`));
      return;
    }

    const provider = getProvider(card.provider_id);
    if (!provider) {
      console.error(chalk.red(`Provider not found for card`));
      exit(EXIT_CODES.ERROR);
    }

    const providerConfig = { ...provider.config, ...(getProviderConfig(provider.name) || {}) };
    const instance = getProviderInstance(provider.type, providerConfig);

    try {
      if (instance.unfreezeCard) {
        await instance.unfreezeCard(card.external_id);
      }
      updateCard(cardId, { status: "active" });
      console.log(chalk.green(`Card unfrozen: ${card.id.slice(0, 8)} ${card.name}`));
    } catch (e) {
      console.error(chalk.red(`Failed to unfreeze card: ${e instanceof Error ? e.message : String(e)}`));
      exit(EXIT_CODES.ERROR);
    }
  });

// ── Rename command ─────────────────────────────────────────────────────────

cardCmd
  .command("rename <id> <name>")
  .description("Rename a card")
  .action(async (id: string, name: string) => {
    const cardId = resolveId(id, "cards");
    const card = getCard(cardId);
    if (!card) {
      console.error(chalk.red(`Card not found: ${id}`));
      exit(EXIT_CODES.NOT_FOUND);
    }

    updateCard(cardId, { name });
    console.log(chalk.green(`Card renamed to "${name}"`));
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
        exit(EXIT_CODES.ERROR);
      }

      const provider = getProvider(card.provider_id);
      if (!provider) {
        console.error(chalk.red(`Provider not found for card`));
        exit(EXIT_CODES.ERROR);
      }

      const providerConfig = { ...provider.config, ...(getProviderConfig(provider.name) || {}) };
      const instance = getProviderInstance(provider.type, providerConfig);

      try {
        const { balance, currency } = await instance.getBalance(card.external_id);
        const globalOpts = program.opts();
        if (globalOpts["json"]) {
          printJson({ card_id: card.id, balance, currency });
        } else {
          console.log(`${chalk.dim(card.id.slice(0, 8))} ${card.name}: ${chalk.green(`$${balance.toFixed(2)}`)} ${currency}`);
        }
      } catch (e) {
        console.error(chalk.red(`Failed to get balance: ${e instanceof Error ? e.message : String(e)}`));
        exit(EXIT_CODES.ERROR);
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
  .option("-o, --offset <n>", "Offset for pagination", "0")
  .option("-f, --format <type>", "Output format: table, json, csv", "table")
  .action((cardId: string | undefined, opts: { limit: string; offset: string; format?: string }) => {
    let resolvedCardId: string | undefined;
    if (cardId) {
      resolvedCardId = resolveId(cardId, "cards");
    }

    const limit = parseInt(opts.limit, 10);
    const offset = parseInt(opts.offset, 10);

    const txns = listTransactions({
      card_id: resolvedCardId,
      limit,
      offset,
    });

    const globalOpts = program.opts();
    const format = opts.format || (globalOpts["json"] ? "json" : "table");

    if (format === "json") {
      printJson({ transactions: txns, limit, offset, count: txns.length });
      return;
    }

    if (format === "csv") {
      console.log("id,type,status,amount,card_id,merchant,description,created_at");
      for (const tx of txns) {
        console.log(`${tx.id},${tx.type},${tx.status},${tx.amount},${tx.card_id},"${tx.merchant || ""}","${tx.description || ""}",${tx.created_at}`);
      }
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
    if (offset > 0 || txns.length === limit) {
      console.log(chalk.dim(`  (offset: ${offset}, showing ${txns.length})`));
    }
  });

// ── Doctor command ─────────────────────────────────────────────────────────

program
  .command("doctor")
  .description("Run diagnostics and check wallet health")
  .option("--fix", "Automatically fix recoverable issues (create config dir/file)")
  .action((opts: { fix?: boolean }) => {
    const result = runDoctor(opts.fix);
    const globalOpts = program.opts();

    if (globalOpts["json"]) {
      printJson(result);
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


// ── Init command ───────────────────────────────────────────────────────────

import { createInterface } from "readline";

function prompt(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function promptSecret(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function runInit(): Promise<void> {
  const configDir = getConfigDir();
  const configPath = getConfigPath();

  console.log(chalk.bold("\n🔖 Wallets Init\n"));
  console.log(`Config directory: ${chalk.dim(configDir)}`);

  if (existsSync(configPath)) {
    const existing = loadConfig();
    if (existing.providers && Object.keys(existing.providers).length > 0) {
      console.log(chalk.yellow("\nWallets is already configured.\n"));
      const overwrite = await prompt("Overwrite existing config? (y/N): ");
      if (overwrite.toLowerCase() !== "y") {
        console.log(chalk.dim("Aborted."));
        return;
      }
    }
  }

  console.log(chalk.dim("\nAvailable providers: agentcard\n"));

  const providerType = await prompt("Provider type [agentcard]: ");
  const type = providerType.trim() || "agentcard";

  if (type !== "agentcard") {
    console.error(chalk.red(`Unknown provider type: ${type}`));
    exit(EXIT_CODES.ERROR);
    return;
  }

  const jwt = await promptSecret("AgentCard JWT token: ");
  if (!jwt) {
    console.error(chalk.red("JWT token is required."));
    exit(EXIT_CODES.VALIDATION);
    return;
  }

  const baseUrl = await prompt("AgentCard base URL [https://api.agentcard.sh]: ");
  const url = baseUrl.trim() || "https://api.agentcard.sh";

  const defaultCurrency = await prompt("Default currency [USD]: ");
  const currency = defaultCurrency.trim() || "USD";

  const config: WalletsConfig = {
    default_provider: type,
    default_currency: currency,
    providers: {
      [type]: {
        jwt,
        baseUrl: url,
      },
    },
  };

  try {
    mkdirSync(configDir, { recursive: true });
    saveConfig(config);
    console.log(chalk.green("\n✓ Configuration saved.\n"));
  } catch (e) {
    console.error(chalk.red(`Failed to save config: ${e instanceof Error ? e.message : String(e)}`));
    exit(EXIT_CODES.ERROR);
  }

  const result = runDoctor(true);
  if (result.healthy) {
    console.log(chalk.green("Setup complete! Run ") + chalk.bold("wallets doctor") + chalk.green(" to verify.\n"));
  } else {
    console.log(chalk.yellow("\nSetup complete, but some checks failed. Run ") + chalk.bold("wallets doctor --fix") + chalk.yellow(" for details.\n"));
  }
}

program
  .command("init")
  .description("Initialize wallets configuration (interactive wizard)")
  .action(async () => {
    try {
      await runInit();
    } catch (e) {
      console.error(chalk.red(`Init failed: ${e instanceof Error ? e.message : String(e)}`));
      exit(EXIT_CODES.ERROR);
    }
  });

// ── Ping command ───────────────────────────────────────────────────────────

program
  .command("ping")
  .description("Check if the CLI is responding (for health checks)")
  .action(() => {
    const globalOpts = program.opts();
    if (globalOpts["json"]) {
      printJson({ status: "ok", timestamp: new Date().toISOString() });
    } else {
      console.log(chalk.green("pong"));
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
      printJson(agents);
      return;
    }

    if (agents.length === 0) {
      console.log(chalk.yellow("No agents registered."));
      return;
    }

    for (const agent of agents) {
      const lastSeen = new Date(agent.last_seen_at).toLocaleString();
      console.log(`  ${chalk.bold(agent.name)} ${chalk.dim(agent.id)}`);
      if (agent.description) console.log(`    ${chalk.dim("desc:")} ${agent.description}`);
      console.log(`    ${chalk.dim("last seen:")} ${lastSeen}`);
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

agentCmd
  .command("info <id>")
  .description("Show agent details")
  .action((id: string) => {
    const agent = getAgent(id);
    if (!agent) {
      console.error(chalk.red(`Agent not found: ${id}`));
      exit(EXIT_CODES.NOT_FOUND);
    }
    const globalOpts = program.opts();
    if (globalOpts["json"]) {
      printJson(agent);
      return;
    }
    console.log(chalk.bold(`Agent: ${agent.name}`));
    console.log(`  ID:          ${agent.id}`);
    if (agent.description) console.log(`  Description: ${agent.description}`);
    console.log(`  Created:     ${new Date(agent.created_at).toLocaleString()}`);
    console.log(`  Last seen:   ${new Date(agent.last_seen_at).toLocaleString()}`);
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
            exit(EXIT_CODES.ERROR);
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
          if (!card) { console.error(chalk.red(`Card not found: ${name}`)); exit(EXIT_CODES.ERROR); }
          updateCard(cardId, { status: "closed" });
          console.log(chalk.green(`✓ Card ${cardId.slice(0, 8)} closed`));
          break;
        }
        default:
          console.error(chalk.red(`Unknown type: ${type}. Use: provider | card`));
          exit(EXIT_CODES.ERROR);
      }
    } catch (e) {
      console.error(chalk.red(`Failed: ${e instanceof Error ? e.message : String(e)}`));
      exit(EXIT_CODES.ERROR);
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
      exit(EXIT_CODES.ERROR);
    }
  });

// ── Shell completions ──────────────────────────────────────────────────────

const completionsCmd = program.command("completions").description("Generate shell completion scripts");

completionsCmd
  .command("bash", { isDefault: true })
  .description("Generate bash completion script")
  .action(() => {
    console.log(`# wallets bash completion
_wallets_completions()
{
  local cur prev opts
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"

  opts="provider card balance transactions doctor ping mcp agent feedback audit completions help version --json --quiet --silent"

  case "\${prev}" in
    provider)
      COMPREPLY=( $(compgen -W "add list remove" -- "\${cur}") )
      return 0
      ;;
    card)
      COMPREPLY=( $(compgen -W "create create-batch list details close freeze unfreeze rename" -- "\${cur}") )
      return 0
      ;;
    wallets)
      COMPREPLY=( $(compgen -W "\${opts}" -- "\${cur}") )
      return 0
      ;;
  esac

  COMPREPLY=( $(compgen -W "\${opts}" -- "\${cur}") )
  return 0
}
complete -F _wallets_completions wallets`);
  });

completionsCmd
  .command("zsh")
  .description("Generate zsh completion script")
  .action(() => {
    console.log(`# wallets zsh completion
_wallets() {
  local -a commands
  commands=(
    "provider:Manage wallet providers"
    "card:Manage virtual cards"
    "balance:Check card balance"
    "transactions:List transactions"
    "doctor:Run diagnostics"
    "ping:Health check"
    "mcp:Configure MCP server"
    "agent:Manage agents"
    "feedback:Send feedback"
    "audit:View audit log"
    "completions:Generate shell completions"
  )

  _describe 'commands' commands
  _describe 'global options' '--json --quiet --silent'

  return 0
}
compdef _wallets wallets`);
  });

completionsCmd
  .command("fish")
  .description("Generate fish completion script")
  .action(() => {
    console.log(`# wallets fish completion
complete -c wallets -f
complete -c wallets -s json -l json -d "Output as JSON"
complete -c wallets -s q -l quiet -d "Suppress output except errors"
complete -c wallets -s s -l silent -d "Suppress output except errors"
complete -c wallets -a provider -d "Manage wallet providers"
complete -c wallets -a card -d "Manage virtual cards"
complete -c wallets -a balance -d "Check card balance"
complete -c wallets -a transactions -d "List transactions"
complete -c wallets -a doctor -d "Run diagnostics"
complete -c wallets -a ping -d "Health check"
complete -c wallets -a mcp -d "Configure MCP server"
complete -c wallets -a agent -d "Manage agents"
complete -c wallets -a feedback -d "Send feedback"
complete -c wallets -a audit -d "View audit log"
complete -c wallets -a completions -d "Generate shell completions"
complete -c wallets -n "__fish_seen_subcommand_from card" -a "create create-batch list details close freeze unfreeze rename" -d "Card commands"`);
  });

// ── Audit command ───────────────────────────────────────────────────────────

program
  .command("audit")
  .description("View audit log of changes")
  .option("-e, --entity <type>", "Filter by entity type: card, provider, transaction, agent")
  .option("-i, --entity-id <id>", "Filter by entity ID")
  .option("-a, --actor <id>", "Filter by actor ID")
  .option("-n, --limit <n>", "Limit results", "50")
  .option("-o, --offset <n>", "Offset for pagination", "0")
  .option("-f, --format <type>", "Output format: table, json, csv", "table")
  .action((opts: { entity?: string; entityId?: string; actor?: string; limit: string; offset: string; format?: string }) => {
    const entries = listAuditLog({
      entity_type: opts.entity as AuditEntry["entity_type"],
      entity_id: opts.entityId,
      actor_id: opts.actor,
      limit: parseInt(opts.limit, 10),
      offset: parseInt(opts.offset, 10),
    });

    const globalOpts = program.opts();
    const format = opts.format || (globalOpts["json"] ? "json" : "table");

    if (format === "json") {
      printJson(entries);
      return;
    }

    if (entries.length === 0) {
      console.log(chalk.yellow("No audit entries found."));
      return;
    }

    if (format === "csv") {
      console.log("id,action,entity_type,entity_id,actor_id,actor_name,created_at");
      for (const entry of entries) {
        console.log(`${entry.id},${entry.action},${entry.entity_type},${entry.entity_id},${entry.actor_id || ""},${entry.actor_name || ""},${entry.created_at}`);
      }
      return;
    }

    console.log(chalk.bold("Audit Log:"));
    for (const entry of entries) {
      const actor = entry.actor_name || entry.actor_id || "system";
      console.log(`  ${chalk.dim(entry.created_at)} ${entry.action.padEnd(8)} ${entry.entity_type.padEnd(12)} ${entry.entity_id.slice(0, 8)} by ${actor}`);
    }
  });

// ── RC file support (~/.walletsrc) ─────────────────────────────────────────

function loadRcFile(): string[] {
  const rcPath = join(homedir(), ".walletsrc");
  if (!existsSync(rcPath)) return [];
  try {
    const content = readFileSync(rcPath, "utf-8");
    return content.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  } catch {
    return [];
  }
}

const rcArgs = loadRcFile();
if (rcArgs.length > 0) {
  process.argv = [...process.argv.slice(0, 2), ...rcArgs, ...process.argv.slice(2)];
}

program.parse();
