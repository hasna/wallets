import { Database } from "bun:sqlite";
import { getDatabase, now, shortId } from "./database.js";
import type { Agent, AgentRow, RegisterAgentInput } from "../types/index.js";
import { cached, cacheClear } from "../lib/cache.js";

const AGENT_LIST_TTL = 30_000; // 30 seconds

function rowToAgent(row: AgentRow): Agent {
  return { ...row };
}

export function registerAgent(input: RegisterAgentInput, db?: Database): Agent {
  const d = db || getDatabase();
  const normalizedName = input.name.trim().toLowerCase();

  const existing = getAgentByName(normalizedName, d);
  if (existing) {
    d.run("UPDATE agents SET last_seen_at = ? WHERE id = ?", [now(), existing.id]);
    cacheClear("agents:");
    return getAgent(existing.id, d)!;
  }

  const id = shortId();
  d.run(
    "INSERT INTO agents (id, name, description) VALUES (?, ?, ?)",
    [id, normalizedName, input.description ?? null]
  );
  cacheClear("agents:");

  return getAgent(id, d)!;
}

export function getAgent(id: string, db?: Database): Agent | null {
  const d = db || getDatabase();
  const row = d.query("SELECT * FROM agents WHERE id = ?").get(id) as AgentRow | null;
  return row ? rowToAgent(row) : null;
}

export function getAgentByName(name: string, db?: Database): Agent | null {
  const d = db || getDatabase();
  const normalizedName = name.trim().toLowerCase();
  const row = d.query("SELECT * FROM agents WHERE name = ?").get(normalizedName) as AgentRow | null;
  return row ? rowToAgent(row) : null;
}

export function listAgents(db?: Database): Agent[] {
  return cached("agents:list", AGENT_LIST_TTL, () => {
    const d = db || getDatabase();
    const rows = d.query("SELECT * FROM agents ORDER BY last_seen_at DESC").all() as AgentRow[];
    return rows.map(rowToAgent);
  });
}

export function heartbeatAgent(idOrName: string, db?: Database): Agent | null {
  const d = db || getDatabase();
  const agent = getAgent(idOrName, d) ?? getAgentByName(idOrName, d);
  if (!agent) return null;
  d.run("UPDATE agents SET last_seen_at = ? WHERE id = ?", [now(), agent.id]);
  return getAgent(agent.id, d);
}

export function setAgentFocus(idOrName: string, projectId: string | null, db?: Database): Agent | null {
  const d = db || getDatabase();
  const agent = getAgent(idOrName, d) ?? getAgentByName(idOrName, d);
  if (!agent) return null;
  d.run("UPDATE agents SET active_project_id = ?, last_seen_at = ? WHERE id = ?", [projectId, now(), agent.id]);
  cacheClear("agents:");
  return getAgent(agent.id, d);
}

export function deleteAgent(id: string, db?: Database): boolean {
  const d = db || getDatabase();
  const result = d.run("DELETE FROM agents WHERE id = ?", [id]);
  if (result.changes > 0) cacheClear("agents:");
  return result.changes > 0;
}
