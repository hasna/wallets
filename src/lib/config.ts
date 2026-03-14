import { homedir } from "os";
import { join } from "path";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";

export interface WalletsConfig {
  default_provider?: string;
  default_currency?: string;
  providers?: Record<string, Record<string, unknown>>;
}

export function getConfigDir(): string {
  return process.env["WALLETS_CONFIG_DIR"] || join(homedir(), ".wallets");
}

export function getConfigPath(): string {
  return join(getConfigDir(), "config.json");
}

export function loadConfig(): WalletsConfig {
  const configPath = getConfigPath();
  if (!existsSync(configPath)) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(configPath, "utf-8"));
  } catch {
    return {};
  }
}

export function saveConfig(config: WalletsConfig): void {
  const configDir = getConfigDir();
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }
  writeFileSync(join(configDir, "config.json"), JSON.stringify(config, null, 2) + "\n");
}

export function getProviderConfig(providerName: string): Record<string, unknown> | undefined {
  const config = loadConfig();
  return config.providers?.[providerName];
}

export function setProviderConfig(providerName: string, providerConfig: Record<string, unknown>): void {
  const config = loadConfig();
  if (!config.providers) config.providers = {};
  config.providers[providerName] = providerConfig;
  saveConfig(config);
}

export function removeProviderConfig(providerName: string): void {
  const config = loadConfig();
  if (config.providers) {
    delete config.providers[providerName];
    saveConfig(config);
  }
}
