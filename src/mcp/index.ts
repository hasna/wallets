#!/usr/bin/env bun
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getDatabase, resolvePartialId } from "../db/database.js";
import { listProviders, getProvider, getProviderByName, ensureProvider } from "../db/providers.js";
import { createCardRecord, listCards, getCard, updateCard, updateCardBalance } from "../db/cards.js";
import { listTransactions } from "../db/transactions.js";
import { registerAgent, listAgents } from "../db/agents.js";
import { getProviderInstance } from "../providers/index.js";
import { loadConfig, saveConfig, getProviderConfig, setProviderConfig } from "../lib/config.js";
import { runDoctor } from "../lib/doctor.js";
import { formatCard, formatProvider, formatTransaction, formatDoctorCheck, formatError } from "../lib/format.js";

const server = new McpServer({
  name: "wallets",
  version: "0.1.0",
});

function resolveId(partialId: string, table = "cards"): string {
  const db = getDatabase();
  const id = resolvePartialId(db, table, partialId);
  if (!id) throw new Error(`Could not resolve ID: ${partialId}`);
  return id;
}

function getDefaultProvider(): { name: string; record: ReturnType<typeof getProvider> } | null {
  const config = loadConfig();
  if (!config.default_provider) return null;
  const record = getProviderByName(config.default_provider);
  if (!record) return null;
  return { name: config.default_provider, record };
}

// ── Tools ──────────────────────────────────────────────────────────────────

server.tool(
  "create_card",
  "Create a new funded virtual card",
  {
    amount: z.number().describe("Funding amount in dollars"),
    name: z.string().optional().describe("Card display name"),
    provider: z.string().optional().describe("Provider name (uses default if omitted)"),
    currency: z.string().optional().describe("Currency code (default: USD)"),
    agent_id: z.string().optional().describe("Agent name to assign the card to"),
  },
  async (params) => {
    try {
      const providerName = params.provider || getDefaultProvider()?.name;
      if (!providerName) {
        return { content: [{ type: "text" as const, text: formatError(new Error("No provider specified and no default set. Use register_provider first.")) }], isError: true };
      }

      const providerRecord = getProviderByName(providerName);
      if (!providerRecord) {
        return { content: [{ type: "text" as const, text: formatError(new Error(`Provider not found: ${providerName}`)) }], isError: true };
      }

      const providerConfig = { ...providerRecord.config, ...(getProviderConfig(providerName) || {}) };
      const instance = getProviderInstance(providerRecord.type, providerConfig);

      let agentId: string | null = null;
      if (params.agent_id) {
        const agent = registerAgent({ name: params.agent_id });
        agentId = agent.id;
      }

      const result = await instance.createCard({
        amount: params.amount,
        name: params.name,
        currency: (params.currency || "USD") as "USD",
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

      let text = `created: ${formatCard(card)}`;
      if (result.funding_url) {
        text += `\nFunding URL: ${result.funding_url}`;
      }

      return { content: [{ type: "text" as const, text }] };
    } catch (e) {
      return { content: [{ type: "text" as const, text: formatError(e) }], isError: true };
    }
  }
);

server.tool(
  "list_cards",
  "List all virtual cards",
  {
    status: z.enum(["active", "frozen", "closed", "pending"]).optional().describe("Filter by status"),
    provider: z.string().optional().describe("Filter by provider name"),
    agent_id: z.string().optional().describe("Filter by agent"),
  },
  async (params) => {
    try {
      let providerId: string | undefined;
      if (params.provider) {
        const p = getProviderByName(params.provider);
        if (p) providerId = p.id;
      }

      const cards = listCards({
        status: params.status,
        provider_id: providerId,
      });

      if (cards.length === 0) {
        return { content: [{ type: "text" as const, text: "No cards found." }] };
      }

      const lines = cards.map(formatCard);
      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    } catch (e) {
      return { content: [{ type: "text" as const, text: formatError(e) }], isError: true };
    }
  }
);

server.tool(
  "get_card_details",
  "Get full card details (PAN, CVV, expiry)",
  {
    card_id: z.string().describe("Card ID (supports partial matching)"),
  },
  async (params) => {
    try {
      const cardId = resolveId(params.card_id, "cards");
      const card = getCard(cardId);
      if (!card) throw new Error(`Card not found: ${params.card_id}`);

      const provider = getProvider(card.provider_id);
      if (!provider) throw new Error("Provider not found for card");

      const providerConfig = { ...provider.config, ...(getProviderConfig(provider.name) || {}) };
      const instance = getProviderInstance(provider.type, providerConfig);
      const details = await instance.getCardDetails(card.external_id);

      return {
        content: [{
          type: "text" as const,
          text: [
            `ID: ${card.id}`,
            `Name: ${card.name}`,
            `PAN: ${details.pan}`,
            `CVV: ${details.cvv}`,
            `Exp: ${details.exp_month}/${details.exp_year}`,
            `Status: ${card.status}`,
            `Balance: $${details.balance.toFixed(2)}`,
          ].join("\n"),
        }],
      };
    } catch (e) {
      return { content: [{ type: "text" as const, text: formatError(e) }], isError: true };
    }
  }
);

server.tool(
  "get_balance",
  "Check card balance",
  {
    card_id: z.string().describe("Card ID"),
  },
  async (params) => {
    try {
      const cardId = resolveId(params.card_id, "cards");
      const card = getCard(cardId);
      if (!card) throw new Error(`Card not found: ${params.card_id}`);

      const provider = getProvider(card.provider_id);
      if (!provider) throw new Error("Provider not found for card");

      const providerConfig = { ...provider.config, ...(getProviderConfig(provider.name) || {}) };
      const instance = getProviderInstance(provider.type, providerConfig);
      const { balance, currency } = await instance.getBalance(card.external_id);

      updateCardBalance(cardId, balance);

      return {
        content: [{
          type: "text" as const,
          text: `${card.name}: $${balance.toFixed(2)} ${currency}`,
        }],
      };
    } catch (e) {
      return { content: [{ type: "text" as const, text: formatError(e) }], isError: true };
    }
  }
);

server.tool(
  "close_card",
  "Close a card permanently",
  {
    card_id: z.string().describe("Card ID"),
  },
  async (params) => {
    try {
      const cardId = resolveId(params.card_id, "cards");
      const card = getCard(cardId);
      if (!card) throw new Error(`Card not found: ${params.card_id}`);

      const provider = getProvider(card.provider_id);
      if (!provider) throw new Error("Provider not found for card");

      const providerConfig = { ...provider.config, ...(getProviderConfig(provider.name) || {}) };
      const instance = getProviderInstance(provider.type, providerConfig);
      await instance.closeCard(card.external_id);

      updateCard(cardId, { status: "closed" });

      return { content: [{ type: "text" as const, text: `Card closed: ${card.id.slice(0, 8)} ${card.name}` }] };
    } catch (e) {
      return { content: [{ type: "text" as const, text: formatError(e) }], isError: true };
    }
  }
);

server.tool(
  "list_providers",
  "List registered wallet providers",
  {},
  async () => {
    try {
      const providers = listProviders();
      if (providers.length === 0) {
        return { content: [{ type: "text" as const, text: "No providers registered. Use register_provider to add one." }] };
      }
      const lines = providers.map(formatProvider);
      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    } catch (e) {
      return { content: [{ type: "text" as const, text: formatError(e) }], isError: true };
    }
  }
);

server.tool(
  "register_provider",
  "Register a wallet provider",
  {
    type: z.string().describe("Provider type (e.g., agentcard)"),
    name: z.string().optional().describe("Display name"),
    jwt: z.string().optional().describe("JWT/API token"),
    api_key: z.string().optional().describe("API key"),
    base_url: z.string().optional().describe("Custom API base URL"),
    set_default: z.boolean().optional().describe("Set as default provider"),
  },
  async (params) => {
    try {
      const name = params.name || params.type;
      const config: Record<string, unknown> = {};
      if (params.jwt) config["jwt"] = params.jwt;
      if (params.api_key) config["api_key"] = params.api_key;
      if (params.base_url) config["baseUrl"] = params.base_url;

      const provider = ensureProvider(name, params.type, config);
      setProviderConfig(name, config);

      if (params.set_default) {
        const cfg = loadConfig();
        cfg.default_provider = name;
        saveConfig(cfg);
      }

      return { content: [{ type: "text" as const, text: `registered: ${formatProvider(provider)}` }] };
    } catch (e) {
      return { content: [{ type: "text" as const, text: formatError(e) }], isError: true };
    }
  }
);

server.tool(
  "list_transactions",
  "List card transactions",
  {
    card_id: z.string().optional().describe("Card ID to filter"),
    limit: z.number().optional().describe("Max results (default: 20)"),
  },
  async (params) => {
    try {
      let cardId: string | undefined;
      if (params.card_id) {
        cardId = resolveId(params.card_id, "cards");
      }

      const txns = listTransactions({
        card_id: cardId,
        limit: params.limit || 20,
      });

      if (txns.length === 0) {
        return { content: [{ type: "text" as const, text: "No transactions found." }] };
      }

      const lines = txns.map(formatTransaction);
      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    } catch (e) {
      return { content: [{ type: "text" as const, text: formatError(e) }], isError: true };
    }
  }
);

server.tool(
  "doctor",
  "Run wallet diagnostics",
  {},
  async () => {
    try {
      const result = runDoctor();
      const lines = result.checks.map(formatDoctorCheck);
      lines.push("");
      lines.push(result.healthy ? "All checks passed." : "Some checks failed.");
      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    } catch (e) {
      return { content: [{ type: "text" as const, text: formatError(e) }], isError: true };
    }
  }
);

server.tool(
  "describe_tools",
  "Get full schema for wallet tools",
  {
    name: z.string().optional().describe("Tool name to describe (omit for all)"),
  },
  async (params) => {
    const tools: Record<string, string> = {
      create_card: "Create a funded virtual card. Params: amount (required, number), name (string), provider (string), currency (string, default USD), agent_id (string).",
      list_cards: "List cards. Params: status (active|frozen|closed|pending), provider (string), agent_id (string).",
      get_card_details: "Get PAN, CVV, expiry. Params: card_id (required, string).",
      get_balance: "Check balance. Params: card_id (required, string).",
      close_card: "Close permanently. Params: card_id (required, string).",
      list_providers: "List all providers. No params.",
      register_provider: "Register provider. Params: type (required), name, jwt, api_key, base_url, set_default.",
      list_transactions: "List transactions. Params: card_id, limit.",
      doctor: "Run diagnostics. No params.",
    };

    if (params.name) {
      const desc = tools[params.name];
      if (!desc) return { content: [{ type: "text" as const, text: `Unknown tool: ${params.name}` }] };
      return { content: [{ type: "text" as const, text: `${params.name}: ${desc}` }] };
    }

    const lines = Object.entries(tools).map(([k, v]) => `${k}: ${v}`);
    return { content: [{ type: "text" as const, text: lines.join("\n") }] };
  }
);

// ── Resources ──────────────────────────────────────────────────────────────

server.resource("wallets://cards", "wallets://cards", async () => {
  const cards = listCards();
  return { contents: [{ uri: "wallets://cards", text: JSON.stringify(cards, null, 2), mimeType: "application/json" }] };
});

server.resource("wallets://providers", "wallets://providers", async () => {
  const providers = listProviders();
  return { contents: [{ uri: "wallets://providers", text: JSON.stringify(providers, null, 2), mimeType: "application/json" }] };
});

server.resource("wallets://agents", "wallets://agents", async () => {
  const agents = listAgents();
  return { contents: [{ uri: "wallets://agents", text: JSON.stringify(agents, null, 2), mimeType: "application/json" }] };
});

// ── Feedback ──────────────────────────────────────────────────────────────

server.tool(
  "send_feedback",
  "Send feedback about this service",
  {
    message: z.string().describe("Feedback message"),
    email: z.string().optional().describe("Contact email (optional)"),
    category: z.enum(["bug", "feature", "general"]).optional().describe("Feedback category"),
  },
  async (params) => {
    try {
      const db = getDatabase();
      const pkg = require("../../package.json");
      db.run(
        "INSERT INTO feedback (message, email, category, version) VALUES (?, ?, ?, ?)",
        [params.message, params.email || null, params.category || "general", pkg.version]
      );
      return { content: [{ type: "text" as const, text: "Feedback saved. Thank you!" }] };
    } catch (e) {
      return { content: [{ type: "text" as const, text: formatError(e) }], isError: true as const };
    }
  }
);

// ── Start ──────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
