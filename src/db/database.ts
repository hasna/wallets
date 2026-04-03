import { Database } from "bun:sqlite";
import { SqliteAdapter, ensureFeedbackTable, migrateDotfile } from "@hasna/cloud";
import { homedir } from "os";
import { join } from "path";
import { existsSync, mkdirSync } from "fs";

let _db: Database | null = null;
let _adapter: SqliteAdapter | null = null;

const MIGRATIONS: { id: number; sql: string }[] = [
  {
    id: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS providers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'error')),
        config TEXT DEFAULT '{}',
        metadata TEXT DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );

      CREATE TABLE IF NOT EXISTS cards (
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
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );

      CREATE TABLE IF NOT EXISTS transactions (
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
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );

      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );

      CREATE INDEX IF NOT EXISTS idx_cards_provider ON cards(provider_id);
      CREATE INDEX IF NOT EXISTS idx_cards_agent ON cards(agent_id);
      CREATE INDEX IF NOT EXISTS idx_cards_status ON cards(status);
      CREATE INDEX IF NOT EXISTS idx_transactions_card ON transactions(card_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_provider ON transactions(provider_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);

      CREATE TABLE IF NOT EXISTS _migrations (
        id INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
    `,
  },
  {
    id: 2,
    sql: `ALTER TABLE agents ADD COLUMN active_project_id TEXT;`,
  },
  {
    id: 3,
    sql: `ALTER TABLE cards ADD COLUMN idempotency_key TEXT; CREATE UNIQUE INDEX IF NOT EXISTS idx_cards_idempotency ON cards(idempotency_key) WHERE idempotency_key IS NOT NULL;`,
  },
  {
    id: 4,
    sql: `
      CREATE TABLE IF NOT EXISTS audit_log (
        id TEXT PRIMARY KEY,
        action TEXT NOT NULL CHECK(action IN ('create', 'update', 'delete')),
        entity_type TEXT NOT NULL CHECK(entity_type IN ('card', 'provider', 'transaction', 'agent')),
        entity_id TEXT NOT NULL,
        actor_id TEXT,
        actor_name TEXT,
        changes TEXT DEFAULT '{}',
        metadata TEXT DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
      CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);
      CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actor_id);
      CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
    `,
  },
];

function runMigrations(db: Database): void {
  db.run(`CREATE TABLE IF NOT EXISTS _migrations (
    id INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`);

  for (const migration of MIGRATIONS) {
    const applied = db.query("SELECT id FROM _migrations WHERE id = ?").get(migration.id);
    if (!applied) {
      db.run("BEGIN");
      try {
        db.run(migration.sql);
        db.run("INSERT INTO _migrations (id) VALUES (?)", [migration.id]);
        db.run("COMMIT");
      } catch (e) {
        db.run("ROLLBACK");
        throw e;
      }
    }
  }
}

function resolveDbPath(): string {
  if (process.env["HASNA_WALLETS_DB_PATH"]) return process.env["HASNA_WALLETS_DB_PATH"];
  if (process.env["WALLETS_DB_PATH"]) return process.env["WALLETS_DB_PATH"];

  const home = homedir();
  migrateDotfile("wallets");
  const newDir = join(home, ".hasna", "wallets");
  const newPath = join(newDir, "wallets.db");

  if (!existsSync(newDir)) {
    mkdirSync(newDir, { recursive: true });
  }
  return newPath;
}

export function getDatabase(dbPath?: string): Database {
  if (_db) return _db;

  const path = dbPath || resolveDbPath();
  _adapter = new SqliteAdapter(path);
  _db = _adapter.raw;

  _db.run("PRAGMA busy_timeout = 5000");

  runMigrations(_db);
  ensureFeedbackTable(_adapter);

  return _db;
}

export function closeDatabase(): void {
  if (_db) {
    _db.close();
    _db = null;
    _adapter = null;
  }
}

export function resetDatabase(): void {
  closeDatabase();
  _db = null;
  _adapter = null;
}

export function now(): string {
  return new Date().toISOString();
}

export function uuid(): string {
  return crypto.randomUUID();
}

export function shortId(): string {
  return crypto.randomUUID().slice(0, 8);
}

export function resolvePartialId(db: Database, table: string, partialId: string): string | null {
  const rows = db
    .query(`SELECT id FROM ${table} WHERE id LIKE ?`)
    .all(`${partialId}%`) as { id: string }[];
  if (rows.length === 1 && rows[0]) return rows[0].id;
  return null;
}

export function resolveCardId(db: Database, partialId: string): string | null {
  // 1. Try UUID prefix match
  const byId = db.query("SELECT id FROM cards WHERE id LIKE ?").all(`${partialId}%`) as { id: string }[];
  if (byId.length === 1 && byId[0]) return byId[0].id;
  if (byId.length > 1) return null; // ambiguous

  // 2. Try name match (case-insensitive, partial)
  const byName = db.query("SELECT id, name FROM cards WHERE LOWER(name) LIKE LOWER(?)").all(`%${partialId}%`) as { id: string; name: string }[];
  if (byName.length === 1 && byName[0]) return byName[0].id;
  if (byName.length > 1) return null; // ambiguous

  // 3. Try last_four match (exact)
  const byLast4 = db.query("SELECT id FROM cards WHERE last_four = ?").all(partialId) as { id: string }[];
  if (byLast4.length === 1 && byLast4[0]) return byLast4[0].id;

  return null;
}
