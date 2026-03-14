import type { WalletProvider } from "../types/index.js";
import { AgentCardProvider } from "./agentcard.js";
import { registerProviderFactory, createProviderInstance, listProviderTypes, getProviderFactory } from "./registry.js";

// Register built-in providers
registerProviderFactory("agentcard", () => {
  throw new Error("AgentCard requires config. Use createAgentCardProvider() instead.");
});

export function createAgentCardProvider(config: { jwt: string; baseUrl?: string }): AgentCardProvider {
  return new AgentCardProvider(config);
}

export function getProviderInstance(type: string, config: Record<string, unknown>): WalletProvider {
  switch (type) {
    case "agentcard":
      return new AgentCardProvider({ jwt: config["jwt"] as string, baseUrl: config["baseUrl"] as string | undefined });
    default:
      return createProviderInstance(type);
  }
}

export { registerProviderFactory, createProviderInstance, listProviderTypes, getProviderFactory };
export { AgentCardProvider } from "./agentcard.js";
