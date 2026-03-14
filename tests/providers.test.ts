import { describe, it, expect, beforeEach } from "bun:test";
import { AgentCardProvider } from "../src/providers/agentcard";
import { registerProviderFactory, listProviderTypes, createProviderInstance, getProviderFactory } from "../src/providers/registry";
import { getProviderInstance } from "../src/providers/index";

describe("provider registry", () => {
  it("registers and lists provider types", () => {
    registerProviderFactory("test-type", () => ({
      name: "test",
      type: "test-type",
      createCard: async () => ({} as any),
      listCards: async () => [],
      getCardDetails: async () => ({} as any),
      getBalance: async () => ({ balance: 0, currency: "USD" as const }),
      closeCard: async () => {},
    }));
    expect(listProviderTypes()).toContain("test-type");
  });

  it("getProviderFactory returns factory for registered type", () => {
    registerProviderFactory("registered-type", () => ({} as any));
    expect(getProviderFactory("registered-type")).toBeDefined();
  });

  it("getProviderFactory returns undefined for unknown type", () => {
    expect(getProviderFactory("unknown-type-xyz")).toBeUndefined();
  });

  it("createProviderInstance throws for unknown type", () => {
    expect(() => createProviderInstance("nonexistent-type")).toThrow("Unknown provider type");
  });
});

describe("AgentCardProvider", () => {
  let provider: AgentCardProvider;

  beforeEach(() => {
    provider = new AgentCardProvider({ jwt: "test-jwt", baseUrl: "https://mock.api" });
  });

  it("has correct name and type", () => {
    expect(provider.name).toBe("agentcard");
    expect(provider.type).toBe("agentcard");
  });

  it("uses default base URL when not provided", () => {
    const defaultProvider = new AgentCardProvider({ jwt: "test" });
    expect(defaultProvider.name).toBe("agentcard");
  });
});

describe("getProviderInstance", () => {
  it("creates AgentCardProvider for agentcard type", () => {
    const instance = getProviderInstance("agentcard", { jwt: "tok" });
    expect(instance).toBeInstanceOf(AgentCardProvider);
    expect(instance.name).toBe("agentcard");
  });

  it("throws for unknown type without factory", () => {
    expect(() => getProviderInstance("nonexistent", {})).toThrow();
  });
});
