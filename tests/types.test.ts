import { describe, it, expect } from "bun:test";
import {
  CARD_STATUSES,
  TRANSACTION_TYPES,
  TRANSACTION_STATUSES,
  PROVIDER_STATUSES,
  CURRENCIES,
  WalletError,
  ProviderNotFoundError,
  CardNotFoundError,
  ProviderError,
  InsufficientFundsError,
  ConfigError,
  AgentNotFoundError,
} from "../src/types/index";

describe("enums", () => {
  it("CARD_STATUSES has correct values", () => {
    expect(CARD_STATUSES).toEqual(["active", "frozen", "closed", "pending"]);
  });

  it("TRANSACTION_TYPES has correct values", () => {
    expect(TRANSACTION_TYPES).toEqual(["purchase", "refund", "load", "withdrawal", "fee"]);
  });

  it("TRANSACTION_STATUSES has correct values", () => {
    expect(TRANSACTION_STATUSES).toEqual(["pending", "completed", "failed", "reversed"]);
  });

  it("PROVIDER_STATUSES has correct values", () => {
    expect(PROVIDER_STATUSES).toEqual(["active", "inactive", "error"]);
  });

  it("CURRENCIES has correct values", () => {
    expect(CURRENCIES).toEqual(["USD", "EUR", "GBP", "CAD", "AUD"]);
  });
});

describe("error classes", () => {
  it("WalletError has code and suggestion", () => {
    const err = new WalletError("test");
    expect(err.message).toBe("test");
    expect(err.name).toBe("WalletError");
    expect(WalletError.code).toBe("WALLET_ERROR");
    expect(WalletError.suggestion).toBeTruthy();
  });

  it("ProviderNotFoundError includes id", () => {
    const err = new ProviderNotFoundError("abc");
    expect(err.message).toContain("abc");
    expect(err.name).toBe("ProviderNotFoundError");
    expect(ProviderNotFoundError.code).toBe("PROVIDER_NOT_FOUND");
    expect(ProviderNotFoundError.suggestion).toBeTruthy();
  });

  it("CardNotFoundError includes id", () => {
    const err = new CardNotFoundError("card-1");
    expect(err.message).toContain("card-1");
    expect(err.name).toBe("CardNotFoundError");
    expect(CardNotFoundError.code).toBe("CARD_NOT_FOUND");
  });

  it("ProviderError includes provider and message", () => {
    const err = new ProviderError("agentcard", "connection failed");
    expect(err.message).toContain("agentcard");
    expect(err.message).toContain("connection failed");
    expect(err.name).toBe("ProviderError");
    expect(ProviderError.code).toBe("PROVIDER_ERROR");
  });

  it("InsufficientFundsError includes amounts", () => {
    const err = new InsufficientFundsError("card-1", 100, 50);
    expect(err.message).toContain("100");
    expect(err.message).toContain("50");
    expect(err.name).toBe("InsufficientFundsError");
    expect(InsufficientFundsError.code).toBe("INSUFFICIENT_FUNDS");
  });

  it("ConfigError has message", () => {
    const err = new ConfigError("missing key");
    expect(err.message).toBe("missing key");
    expect(err.name).toBe("ConfigError");
    expect(ConfigError.code).toBe("CONFIG_ERROR");
  });

  it("AgentNotFoundError includes id", () => {
    const err = new AgentNotFoundError("ag-1");
    expect(err.message).toContain("ag-1");
    expect(err.name).toBe("AgentNotFoundError");
    expect(AgentNotFoundError.code).toBe("AGENT_NOT_FOUND");
  });

  it("all errors are instanceof Error", () => {
    expect(new WalletError("x")).toBeInstanceOf(Error);
    expect(new ProviderNotFoundError("x")).toBeInstanceOf(Error);
    expect(new CardNotFoundError("x")).toBeInstanceOf(Error);
    expect(new ProviderError("x", "y")).toBeInstanceOf(Error);
    expect(new InsufficientFundsError("x", 1, 0)).toBeInstanceOf(Error);
    expect(new ConfigError("x")).toBeInstanceOf(Error);
    expect(new AgentNotFoundError("x")).toBeInstanceOf(Error);
  });
});
