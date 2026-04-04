# Contributing to open-wallets

Thank you for your interest in contributing!

## Development Setup

```bash
# Clone the repository
git clone https://github.com/hasna/open-wallets.git
cd open-wallets

# Install dependencies
bun install

# Run development CLI
bun run dev:cli

# Run development MCP server
bun run dev:mcp

# Build for production
bun run build
```

## Scripts

| Script | Description |
|--------|-------------|
| `bun run build` | Build CLI, MCP server, and library |
| `bun run typecheck` | Type-check without emitting |
| `bun test` | Run all tests |
| `bun run lint` | Lint source files |
| `bun run lint:fix` | Auto-fix lint issues |
| `bun run dev:watch` | Run CLI with file watching |
| `bun run dev:mcp:watch` | Run MCP server with file watching |

## Testing

```bash
# Run all tests
bun test

# Run specific test file
bun test tests/db.test.ts
```

Tests use in-memory SQLite. Set `WALLETS_DB_PATH=:memory:` to override the database path.

## Code Style

We use [Biome](https://biomejs.dev/) for linting and formatting:

```bash
bun run lint      # Check for issues
bun run lint:fix # Auto-fix issues
```

## Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add new card freeze feature
fix: resolve idempotency key collision
chore: update dependencies
docs: clarify provider setup steps
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

## Pull Requests

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Make your changes
4. Run tests and lint: `bun test && bun run lint`
5. Commit with a clear message
6. Push and open a PR

## Project Structure

```
src/
├── cli/index.ts      # CLI entry (Commander.js)
├── mcp/index.ts     # MCP server entry
├── db/               # SQLite data layer
├── providers/        # Provider abstraction
├── lib/              # Config, doctor, format
└── types/            # TypeScript types and errors
```

## Getting Help

- Open an [issue](https://github.com/hasna/open-wallets/issues) for bugs or feature requests
- Join the discussion in GitHub Discussions
