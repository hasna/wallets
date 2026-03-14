import type { WalletProvider } from "../types/index.js";

const providers = new Map<string, () => WalletProvider>();

export function registerProviderFactory(type: string, factory: () => WalletProvider): void {
  providers.set(type, factory);
}

export function getProviderFactory(type: string): (() => WalletProvider) | undefined {
  return providers.get(type);
}

export function listProviderTypes(): string[] {
  return Array.from(providers.keys());
}

export function createProviderInstance(type: string): WalletProvider {
  const factory = providers.get(type);
  if (!factory) {
    throw new Error(`Unknown provider type: ${type}. Available: ${listProviderTypes().join(", ")}`);
  }
  return factory();
}
