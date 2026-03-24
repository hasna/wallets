# @hasna/wallets

Universal wallet management for AI agents - CLI + MCP server with multi-provider support

[![npm](https://img.shields.io/npm/v/@hasna/wallets)](https://www.npmjs.com/package/@hasna/wallets)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)

## Install

```bash
npm install -g @hasna/wallets
```

## CLI Usage

```bash
wallets --help
```

- `wallets provider add`
- `wallets provider list`
- `wallets card create`
- `wallets card list`
- `wallets card details`
- `wallets balance`
- `wallets transactions`
- `wallets doctor`

## MCP Server

```bash
wallets-mcp
```

15 tools available.

## Cloud Sync

This package supports cloud sync via `@hasna/cloud`:

```bash
cloud setup
cloud sync push --service wallets
cloud sync pull --service wallets
```

## Data Directory

Data is stored in `~/.hasna/wallets/`.

## License

Apache-2.0 -- see [LICENSE](LICENSE)
