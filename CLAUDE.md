# open-wallets

Universal wallet management for AI agents — CLI + MCP server with multi-provider virtual card support.

## Commands

```bash
bun run build        # Build CLI, MCP server, and library
bun run typecheck    # Type-check without emitting
bun test             # Run all tests
bun run dev:cli      # Run CLI in development
bun run dev:mcp      # Run MCP server in development
```

## Architecture

```
┌──────────────────────────────────────────┐
│    CLI (Commander.js)    MCP Server      │
│    wallets               wallets-mcp     │
└──────────────┬───────────────────────────┘
               │
     src/lib/ (Config, Doctor, Format)
               │
     src/db/ (SQLite Data Layer)
               │
     src/providers/ (Provider Abstraction)
               │
  ┌────────────┴──────────────────┐
  │  Database (Singleton)          │
  │  WAL mode, FK enabled         │
  │  ~/.wallets/wallets.db        │
  └───────────────────────────────┘
```

## Data Model

- **Provider**: Wallet provider registration (agentcard, stripe-issuing, etc.)
- **Card**: Virtual card records with balance, status, provider link
- **Transaction**: Purchase/refund/load history per card
- **Agent**: AI agent registrations (idempotent by name)

## Key Patterns

- **Singleton DB** with WAL mode and foreign keys
- **Row types → Domain types** via conversion functions
- **Partial ID resolution** for CLI/MCP convenience
- **Provider abstraction** — WalletProvider interface for multi-provider support
- **Config at ~/.wallets/config.json** — provider credentials and defaults
- **Doctor command** — health checks for DB, config, providers, MCP

## Providers

| Provider | Type | Status |
|----------|------|--------|
| AgentCard | `agentcard` | Implemented |
| Stripe Issuing | `stripe` | Planned |
| Privacy.com | `privacy` | Planned |

## MCP Tools (10)

create_card, list_cards, get_card_details, get_balance, close_card, list_providers, register_provider, list_transactions, doctor, describe_tools

## Testing

97 tests using in-memory SQLite. Pattern:

```typescript
beforeEach(() => {
  process.env["WALLETS_DB_PATH"] = ":memory:";
  resetDatabase();
  db = getDatabase();
});
afterEach(() => {
  closeDatabase();
  delete process.env["WALLETS_DB_PATH"];
});
```

## File Layout

```
src/
├── types/index.ts       # All types, enums, error classes
├── db/
│   ├── database.ts      # Singleton, migrations, helpers
│   ├── providers.ts     # Provider CRUD
│   ├── cards.ts         # Card CRUD
│   ├── transactions.ts  # Transaction CRUD
│   └── agents.ts        # Agent registration
├── providers/
│   ├── registry.ts      # Provider factory registry
│   ├── agentcard.ts     # AgentCard provider implementation
│   └── index.ts         # Provider exports and instance creation
├── lib/
│   ├── config.ts        # ~/.wallets/config.json management
│   ├── doctor.ts        # Health check diagnostics
│   └── format.ts        # Output formatting and error formatting
├── cli/index.ts         # CLI entry point (Commander.js)
├── mcp/index.ts         # MCP server entry point
└── index.ts             # Library re-exports
```
