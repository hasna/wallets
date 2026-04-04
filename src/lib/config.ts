import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import chalk from 'chalk';
import { z } from 'zod';
import { getProviderByName, updateProvider } from '../db/providers.js';

export const WalletsConfigSchema = z.object({
	default_provider: z.string().optional(),
	default_currency: z.string().optional(),
});

export type WalletsConfig = z.infer<typeof WalletsConfigSchema>;

let _configCache: WalletsConfig | null = null;
let _configCachePath: string | null = null;

function _invalidateCache(): void {
	_configCache = null;
	_configCachePath = null;
}

function _loadConfigUncached(): WalletsConfig {
	const configPath = getConfigPath();
	if (!existsSync(configPath)) {
		return {};
	}
	try {
		const raw = JSON.parse(readFileSync(configPath, 'utf-8'));
		return WalletsConfigSchema.parse(raw);
	} catch (e) {
		if (e instanceof z.ZodError) {
			console.error(
				chalk.yellow(
					`Config validation errors: ${e.errors.map((err) => `${err.path.join('.')}: ${err.message}`).join(', ')}`
				)
			);
		}
		return {};
	}
}

export function getConfigDir(): string {
	if (process.env.WALLETS_CONFIG_DIR) return process.env.WALLETS_CONFIG_DIR;

	const home = homedir();
	const newDir = join(home, '.hasna', 'wallets');
	const legacyDir = join(home, '.wallets');

	// Use legacy dir if it exists and new one doesn't yet (backward compat)
	if (!existsSync(newDir) && existsSync(legacyDir)) {
		return legacyDir;
	}

	return newDir;
}

export function getConfigPath(): string {
	return join(getConfigDir(), 'config.json');
}

export function loadConfig(): WalletsConfig {
	const configPath = getConfigPath();
	if (_configCache !== null && _configCachePath === configPath) {
		return _configCache;
	}
	_configCache = _loadConfigUncached();
	_configCachePath = configPath;
	return _configCache;
}

export function saveConfig(config: WalletsConfig): void {
	const configDir = getConfigDir();
	if (!existsSync(configDir)) {
		mkdirSync(configDir, { recursive: true });
	}
	writeFileSync(
		join(configDir, 'config.json'),
		`${JSON.stringify(config, null, 2)}\n`
	);
	_invalidateCache();
}

export function getProviderConfig(
	providerName: string
): Record<string, unknown> | undefined {
	const provider = getProviderByName(providerName);
	return provider?.config;
}

export function setProviderConfig(
	providerName: string,
	providerConfig: Record<string, unknown>
): void {
	const provider = getProviderByName(providerName);
	if (!provider) return;
	updateProvider(provider.id, { config: providerConfig });
}

export function removeProviderConfig(providerName: string): void {
	const provider = getProviderByName(providerName);
	if (!provider) return;
	updateProvider(provider.id, { config: {} });
}
