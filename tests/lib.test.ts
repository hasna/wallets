import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { loadConfig, saveConfig, getProviderConfig, setProviderConfig, removeProviderConfig, getConfigDir, getConfigPath } from "../src/lib/config";
import { formatCard, formatProvider, formatTransaction, formatDoctorCheck, formatError } from "../src/lib/format";
import { runDoctor } from "../src/lib/doctor";
import { getDatabase, closeDatabase, resetDatabase } from "../src/db/database";
import { createProvider } from "../src/db/providers";
import {
  WalletError,
  ProviderNotFoundError,
  CardNotFoundError,
  ProviderError,
  InsufficientFundsError,
  ConfigError,
  AgentNotFoundError,
} from "../src/types/index";
import type { Card, Provider, Transaction, DoctorCheck } from "../src/types/index";

// ── Config tests ───────────────────────────────────────────────────────────

describe("config", () => {
  let tmpDir: string;
  let origConfigDir: string | undefined;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "wallets-test-"));
    origConfigDir = process.env["WALLETS_CONFIG_DIR"];
    process.env["WALLETS_CONFIG_DIR"] = join(tmpDir, ".wallets");
  });

  afterEach(() => {
    if (origConfigDir) process.env["WALLETS_CONFIG_DIR"] = origConfigDir;
    else delete process.env["WALLETS_CONFIG_DIR"];
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("loadConfig returns empty object when no config", () => {
    const config = loadConfig();
    expect(config).toEqual({});
  });

  it("saveConfig and loadConfig roundtrip", () => {
    saveConfig({ default_provider: "agentcard", default_currency: "USD" });
    const loaded = loadConfig();
    expect(loaded.default_provider).toBe("agentcard");
    expect(loaded.default_currency).toBe("USD");
  });

  it("getConfigDir returns .wallets in home", () => {
    const dir = getConfigDir();
    expect(dir).toContain(".wallets");
  });

  it("getConfigPath returns config.json path", () => {
    const path = getConfigPath();
    expect(path).toContain("config.json");
  });

  it("setProviderConfig saves provider config", () => {
    setProviderConfig("agentcard", { jwt: "tok123" });
    const config = getProviderConfig("agentcard");
    expect(config).toEqual({ jwt: "tok123" });
  });

  it("removeProviderConfig removes config", () => {
    setProviderConfig("agentcard", { jwt: "tok" });
    removeProviderConfig("agentcard");
    const config = getProviderConfig("agentcard");
    expect(config).toBeUndefined();
  });

  it("getProviderConfig returns undefined for missing", () => {
    expect(getProviderConfig("nonexistent")).toBeUndefined();
  });
});

// ── Format tests ───────────────────────────────────────────────────────────

describe("format", () => {
  const mockCard: Card = {
    id: "12345678-abcd-efgh-1234-567890abcdef",
    provider_id: "prov-1",
    external_id: "ext-1",
    name: "Test Card",
    last_four: "4242",
    brand: "visa",
    status: "active",
    currency: "USD",
    balance: 50.25,
    funded_amount: 100,
    spending_limit: null,
    agent_id: null,
    metadata: {},
    expires_at: null,
    created_at: "2024-01-01",
    updated_at: "2024-01-01",
  };

  const mockProvider: Provider = {
    id: "abcdef12-xxxx-yyyy-zzzz-123456789abc",
    name: "agentcard",
    type: "agentcard",
    status: "active",
    config: {},
    metadata: {},
    created_at: "2024-01-01",
    updated_at: "2024-01-01",
  };

  const mockTransaction: Transaction = {
    id: "tx-12345678-abcd-efgh-1234-567890",
    card_id: "card-1",
    provider_id: "prov-1",
    external_id: null,
    type: "purchase",
    status: "completed",
    amount: 25.99,
    currency: "USD",
    merchant: "Amazon",
    description: null,
    metadata: {},
    created_at: "2024-01-01",
  };

  it("formatCard returns formatted string", () => {
    const result = formatCard(mockCard);
    expect(result).toContain("12345678");
    expect(result).toContain("active");
    expect(result).toContain("*4242");
    expect(result).toContain("50.25");
    expect(result).toContain("Test Card");
  });

  it("formatCard handles missing last_four", () => {
    const card = { ...mockCard, last_four: "" };
    const result = formatCard(card);
    expect(result).toContain("----");
  });

  it("formatProvider returns formatted string", () => {
    const result = formatProvider(mockProvider);
    expect(result).toContain("abcdef12");
    expect(result).toContain("active");
    expect(result).toContain("agentcard");
  });

  it("formatTransaction shows purchase with minus sign", () => {
    const result = formatTransaction(mockTransaction);
    expect(result).toContain("-$");
    expect(result).toContain("25.99");
    expect(result).toContain("Amazon");
  });

  it("formatTransaction shows refund with plus sign", () => {
    const tx = { ...mockTransaction, type: "refund" as const };
    const result = formatTransaction(tx);
    expect(result).toContain("+$");
  });

  it("formatTransaction shows load with plus sign", () => {
    const tx = { ...mockTransaction, type: "load" as const };
    const result = formatTransaction(tx);
    expect(result).toContain("+$");
  });

  it("formatDoctorCheck shows ok", () => {
    const check: DoctorCheck = { name: "DB", status: "ok", message: "Connected" };
    const result = formatDoctorCheck(check);
    expect(result).toContain("[ok]");
    expect(result).toContain("DB");
  });

  it("formatDoctorCheck shows warn", () => {
    const check: DoctorCheck = { name: "Config", status: "warn", message: "Missing" };
    const result = formatDoctorCheck(check);
    expect(result).toContain("[!!]");
  });

  it("formatDoctorCheck shows error", () => {
    const check: DoctorCheck = { name: "Provider", status: "error", message: "Failed" };
    const result = formatDoctorCheck(check);
    expect(result).toContain("[ERR]");
  });
});

describe("formatError", () => {
  it("formats ProviderNotFoundError", () => {
    const result = JSON.parse(formatError(new ProviderNotFoundError("x")));
    expect(result.code).toBe("PROVIDER_NOT_FOUND");
  });

  it("formats CardNotFoundError", () => {
    const result = JSON.parse(formatError(new CardNotFoundError("x")));
    expect(result.code).toBe("CARD_NOT_FOUND");
  });

  it("formats ProviderError", () => {
    const result = JSON.parse(formatError(new ProviderError("p", "m")));
    expect(result.code).toBe("PROVIDER_ERROR");
  });

  it("formats InsufficientFundsError", () => {
    const result = JSON.parse(formatError(new InsufficientFundsError("c", 1, 0)));
    expect(result.code).toBe("INSUFFICIENT_FUNDS");
  });

  it("formats ConfigError", () => {
    const result = JSON.parse(formatError(new ConfigError("m")));
    expect(result.code).toBe("CONFIG_ERROR");
  });

  it("formats AgentNotFoundError", () => {
    const result = JSON.parse(formatError(new AgentNotFoundError("x")));
    expect(result.code).toBe("AGENT_NOT_FOUND");
  });

  it("formats WalletError", () => {
    const result = JSON.parse(formatError(new WalletError("m")));
    expect(result.code).toBe("WALLET_ERROR");
  });

  it("formats generic Error", () => {
    const result = JSON.parse(formatError(new Error("oops")));
    expect(result.code).toBe("UNKNOWN_ERROR");
    expect(result.message).toBe("oops");
  });

  it("formats non-Error", () => {
    const result = JSON.parse(formatError("string error"));
    expect(result.code).toBe("UNKNOWN_ERROR");
    expect(result.message).toBe("string error");
  });
});

// ── Doctor tests ───────────────────────────────────────────────────────────

describe("doctor", () => {
  beforeEach(() => {
    process.env["WALLETS_DB_PATH"] = ":memory:";
    resetDatabase();
  });

  afterEach(() => {
    closeDatabase();
    delete process.env["WALLETS_DB_PATH"];
  });

  it("returns doctor result with checks", () => {
    const result = runDoctor();
    expect(result.checks).toBeDefined();
    expect(Array.isArray(result.checks)).toBe(true);
    expect(typeof result.healthy).toBe("boolean");
  });

  it("database check passes with in-memory db", () => {
    getDatabase();
    const result = runDoctor();
    const dbCheck = result.checks.find((c) => c.name === "Database");
    expect(dbCheck).toBeDefined();
    expect(dbCheck!.status).toBe("ok");
  });

  it("warns about no providers", () => {
    getDatabase();
    const result = runDoctor();
    const provCheck = result.checks.find((c) => c.name === "Providers");
    expect(provCheck).toBeDefined();
    expect(provCheck!.status).toBe("warn");
  });

  it("checks agentcard provider health", () => {
    const db = getDatabase();
    createProvider({ name: "ac", type: "agentcard", config: { jwt: "tok" } }, db);
    const result = runDoctor();
    const provCheck = result.checks.find((c) => c.name === "Provider: ac");
    expect(provCheck).toBeDefined();
    expect(provCheck!.status).toBe("ok");
  });

  it("flags agentcard without jwt as error", () => {
    const db = getDatabase();
    createProvider({ name: "ac-nojwt", type: "agentcard" }, db);
    const result = runDoctor();
    const provCheck = result.checks.find((c) => c.name === "Provider: ac-nojwt");
    expect(provCheck).toBeDefined();
    expect(provCheck!.status).toBe("error");
  });
});
