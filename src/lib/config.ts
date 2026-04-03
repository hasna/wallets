import { homedir } from "os";
import { join } from "path";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { z } from "zod";
import chalk from "chalk";

export const WalletsConfigSchema = z.object({
  default_provider: z.string().optional(),
  default_currency: z.string().optional(),
  providers: z.record(z.string(), z.record(z.unknown())).optional(),
});

export type WalletsConfig = z.infer<typeof WalletsConfigSchema>;

export function getConfigDir(): string {
  if (process.env["WALLETS_CONFIG_DIR"]) return process.env["WALLETS_CONFIG_DIR"];

  const home = homedir();
  const newDir = join(home, ".hasna", "wallets");
  const legacyDir = join(home, ".wallets");

  // Use legacy dir if it exists and new one doesn't yet (backward compat)
  if (!existsSync(newDir) && existsSync(legacyDir)) {
    return legacyDir;
  }

  return newDir;
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
    const raw = JSON.parse(readFileSync(configPath, "utf-8"));
    return WalletsConfigSchema.parse(raw);
  } catch (e) {
    if (e instanceof z.ZodError) {
      console.error(chalk.yellow(`Config validation errors: ${e.errors.map((err) => `${err.path.join(".")}: ${err.message}`).join(", ")}`));
    }
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
