/**
 * PostgreSQL migrations for open-wallets cloud sync.
 *
 * Equivalent to the SQLite schema in database.ts, translated for PostgreSQL.
 */

export const PG_MIGRATIONS: string[] = [
  // Migration 1: providers table
  `CREATE TABLE IF NOT EXISTS providers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'error')),
    config TEXT DEFAULT '{}',
    metadata TEXT DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT NOW()::text,
    updated_at TEXT NOT NULL DEFAULT NOW()::text
  )`,

  // Migration 2: cards table
  `CREATE TABLE IF NOT EXISTS cards (
    id TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    external_id TEXT NOT NULL,
    name TEXT NOT NULL,
    last_four TEXT NOT NULL DEFAULT '',
    brand TEXT NOT NULL DEFAULT 'visa',
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('active', 'frozen', 'closed', 'pending')),
    currency TEXT NOT NULL DEFAULT 'USD',
    balance REAL NOT NULL DEFAULT 0,
    funded_amount REAL NOT NULL DEFAULT 0,
    spending_limit REAL,
    agent_id TEXT,
    metadata TEXT DEFAULT '{}',
    expires_at TEXT,
    created_at TEXT NOT NULL DEFAULT NOW()::text,
    updated_at TEXT NOT NULL DEFAULT NOW()::text
  )`,

  // Migration 3: transactions table
  `CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    external_id TEXT,
    type TEXT NOT NULL CHECK(type IN ('purchase', 'refund', 'load', 'withdrawal', 'fee')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'completed', 'failed', 'reversed')),
    amount REAL NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',
    merchant TEXT,
    description TEXT,
    metadata TEXT DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT NOW()::text
  )`,

  // Migration 4: agents table
  `CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    active_project_id TEXT,
    created_at TEXT NOT NULL DEFAULT NOW()::text,
    last_seen_at TEXT NOT NULL DEFAULT NOW()::text
  )`,

  // Migration 5: indexes
  `CREATE INDEX IF NOT EXISTS idx_cards_provider ON cards(provider_id)`,
  `CREATE INDEX IF NOT EXISTS idx_cards_agent ON cards(agent_id)`,
  `CREATE INDEX IF NOT EXISTS idx_cards_status ON cards(status)`,
  `CREATE INDEX IF NOT EXISTS idx_transactions_card ON transactions(card_id)`,
  `CREATE INDEX IF NOT EXISTS idx_transactions_provider ON transactions(provider_id)`,
  `CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type)`,

  // Migration 6: _migrations tracking
  `CREATE TABLE IF NOT EXISTS _migrations (
    id INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT NOW()::text
  )`,

  // Migration 7: feedback table
  `CREATE TABLE IF NOT EXISTS feedback (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    service TEXT NOT NULL,
    version TEXT DEFAULT '',
    message TEXT NOT NULL,
    email TEXT DEFAULT '',
    machine_id TEXT DEFAULT '',
    created_at TEXT DEFAULT NOW()::text
  )`,
];
