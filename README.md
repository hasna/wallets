# open-wallets

Universal wallet management for AI agents. Create and manage virtual cards across multiple providers via CLI or MCP server.

## Features

- **Multi-provider support** — AgentCard, Stripe Issuing (coming soon), and more
- **MCP server** — 10 tools for AI agents to manage wallets programmatically
- **CLI** — Full-featured command-line interface with `--json` output
- **Doctor command** — Diagnose configuration, provider health, and MCP setup
- **Agent tracking** — Assign cards to specific AI agents
- **Transaction history** — Track all card activity

## Installation

```bash
bun install -g @hasna/wallets
```

## Shell Completions

Add tab completion for `wallets` CLI:

**Bash** — add to `~/.bashrc`:
```bash
source /path/to/open-wallets/completions/wallets.bash
```

**Zsh** — add to `~/.zshrc`:
```bash
fpath=(/path/to/open-wallets/completions $fpath)
autoload -U compinit && compinit
```

## Quick Start

```bash
# Register a provider
wallets provider add agentcard --jwt YOUR_JWT_TOKEN --default

# Create a funded card
wallets card create --amount 50 --name "Shopping Card"

# List all cards
wallets card list

# Check balance
wallets balance <card-id>

# Get full card details (PAN, CVV, expiry)
wallets card details <card-id>

# Close a card
wallets card close <card-id>

# Run diagnostics
wallets doctor
```

## MCP Setup

```bash
# Install for Claude Code
wallets mcp --claude

# Install for all agents
wallets mcp --all

# Manual setup (add to MCP config):
# Command: wallets-mcp
```

### MCP Tools

| Tool | Description |
|------|-------------|
| `create_card` | Create a new funded virtual card |
| `list_cards` | List all virtual cards |
| `get_card_details` | Get full card details (PAN, CVV, expiry) |
| `get_balance` | Check card balance |
| `close_card` | Close a card permanently |
| `list_providers` | List registered wallet providers |
| `register_provider` | Register a wallet provider |
| `list_transactions` | List card transactions |
| `doctor` | Run wallet diagnostics |
| `describe_tools` | Get full schema for wallet tools |

## Providers

### AgentCard (agentcard.sh)

Prepaid virtual Visa cards for AI agents. Sign up at [agentcard.sh](https://agentcard.sh).

```bash
# Install AgentCard CLI
npm install -g agent-cards

# Sign up and get JWT
agent-cards signup

# Register with open-wallets
wallets provider add agentcard --jwt YOUR_JWT --default
```

### Coming Soon

- **Stripe Issuing** — Native virtual card issuing via Stripe
- **Privacy.com** — Virtual cards for online purchases

## Configuration

Config stored at `~/.wallets/config.json`:

```json
{
  "default_provider": "agentcard",
  "default_currency": "USD",
  "providers": {
    "agentcard": {
      "jwt": "your-jwt-token"
    }
  }
}
```

Database stored at `~/.wallets/wallets.db` (SQLite, WAL mode). Override with `WALLETS_DB_PATH` env var.

## Library Usage

```typescript
import { createCardRecord, listCards, getProviderInstance } from "@hasna/wallets";

// Create a provider instance
const provider = getProviderInstance("agentcard", { jwt: "your-jwt" });

// Create a card via the provider
const card = await provider.createCard({ amount: 50 });

// List all cards from the database
const cards = listCards({ status: "active" });
```

## Development

```bash
git clone https://github.com/hasna/open-wallets.git
cd open-wallets
bun install
bun test
bun run build
```

## License

Apache-2.0
