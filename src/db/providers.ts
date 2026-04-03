import { Database } from "bun:sqlite";
import { getDatabase, now, shortId } from "./database.js";
import type { Provider, ProviderRow, CreateProviderInput } from "../types/index.js";
import { cached, cacheClear } from "../lib/cache.js";

const PROVIDER_LIST_TTL = 30_000; // 30 seconds

function rowToProvider(row: ProviderRow): Provider {
  return {
    ...row,
    status: row.status as Provider["status"],
    config: JSON.parse(row.config || "{}"),
    metadata: JSON.parse(row.metadata || "{}"),
  };
}

export function createProvider(input: CreateProviderInput, db?: Database): Provider {
  const d = db || getDatabase();
  const id = shortId();

  d.run(
    `INSERT INTO providers (id, name, type, config, metadata) VALUES (?, ?, ?, ?, ?)`,
    [
      id,
      input.name,
      input.type,
      JSON.stringify(input.config || {}),
      JSON.stringify(input.metadata || {}),
    ]
  );
  cacheClear("providers:");

  return getProvider(id, d)!;
}

export function getProvider(id: string, db?: Database): Provider | null {
  const d = db || getDatabase();
  const row = d.query("SELECT * FROM providers WHERE id = ?").get(id) as ProviderRow | null;
  return row ? rowToProvider(row) : null;
}

export function getProviderByName(name: string, db?: Database): Provider | null {
  const d = db || getDatabase();
  const row = d.query("SELECT * FROM providers WHERE name = ?").get(name) as ProviderRow | null;
  return row ? rowToProvider(row) : null;
}

export function getProviderByType(type: string, db?: Database): Provider | null {
  const d = db || getDatabase();
  const row = d.query("SELECT * FROM providers WHERE type = ? AND status = 'active' LIMIT 1").get(type) as ProviderRow | null;
  return row ? rowToProvider(row) : null;
}

export function listProviders(db?: Database): Provider[] {
  return cached("providers:list", PROVIDER_LIST_TTL, () => {
    const d = db || getDatabase();
    const rows = d.query("SELECT * FROM providers ORDER BY created_at DESC").all() as ProviderRow[];
    return rows.map(rowToProvider);
  });
}

export function updateProvider(id: string, input: Partial<CreateProviderInput> & { status?: Provider["status"] }, db?: Database): Provider {
  const d = db || getDatabase();
  const provider = getProvider(id, d);
  if (!provider) throw new Error(`Provider not found: ${id}`);

  const sets: string[] = [];
  const params: (string | number | null)[] = [];

  if (input.name !== undefined) {
    sets.push("name = ?");
    params.push(input.name);
  }
  if (input.config !== undefined) {
    sets.push("config = ?");
    params.push(JSON.stringify(input.config));
  }
  if (input.metadata !== undefined) {
    sets.push("metadata = ?");
    params.push(JSON.stringify(input.metadata));
  }
  if (input.status !== undefined) {
    sets.push("status = ?");
    params.push(input.status);
  }

  if (sets.length > 0) {
    sets.push("updated_at = ?");
    params.push(now());
    params.push(id);
    d.run(`UPDATE providers SET ${sets.join(", ")} WHERE id = ?`, params);
    cacheClear("providers:");
  }

  return getProvider(id, d)!;
}

export function deleteProvider(id: string, db?: Database): boolean {
  const d = db || getDatabase();
  const result = d.run("DELETE FROM providers WHERE id = ?", [id]);
  if (result.changes > 0) cacheClear("providers:");
  return result.changes > 0;
}

export function ensureProvider(name: string, type: string, config?: Record<string, unknown>, db?: Database): Provider {
  const d = db || getDatabase();
  const existing = getProviderByName(name, d);
  if (existing) {
    if (config) {
      return updateProvider(existing.id, { config }, d);
    }
    d.run("UPDATE providers SET updated_at = ? WHERE id = ?", [now(), existing.id]);
    return getProvider(existing.id, d)!;
  }
  return createProvider({ name, type, config }, d);
}
