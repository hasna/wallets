import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { getDatabase } from '../db/database.js';
import { listProviders } from '../db/providers.js';
import type { DoctorCheck, DoctorResult } from '../types/index.js';
import {
	getConfigDir,
	getConfigPath,
	loadConfig,
	saveConfig,
} from './config.js';

export function runDoctor(fix = false): DoctorResult {
	const checks: DoctorCheck[] = [];
	const fixed: string[] = [];

	// Auto-fix: config directory
	const configDir = getConfigDir();
	if (!existsSync(configDir)) {
		if (fix) {
			mkdirSync(configDir, { recursive: true });
			fixed.push(`Created config directory at ${configDir}`);
		}
	}

	// Check 1: Config directory exists
	checks.push({
		name: 'Config directory',
		status: existsSync(configDir) ? 'ok' : fix ? 'ok' : 'warn',
		message: existsSync(configDir)
			? `Found at ${configDir}`
			: fix
				? `Created at ${configDir}`
				: `Not found at ${configDir}. Run 'wallets provider add' to create it.`,
	});

	// Auto-fix: config file
	const configPath = getConfigPath();
	if (!existsSync(configPath)) {
		if (fix) {
			saveConfig({});
			fixed.push(`Created empty config at ${configPath}`);
		}
	}

	// Check 2: Config file exists and is valid
	if (existsSync(configPath)) {
		try {
			const config = loadConfig();
			checks.push({
				name: 'Config file',
				status: 'ok',
				message: `Valid config at ${configPath}`,
			});

			// Check 3: Default provider set
			if (config.default_provider) {
				checks.push({
					name: 'Default provider',
					status: 'ok',
					message: `Set to '${config.default_provider}'`,
				});
			} else {
				checks.push({
					name: 'Default provider',
					status: 'warn',
					message:
						"No default provider set. Use 'wallets provider add' to register one.",
				});
			}
		} catch {
			checks.push({
				name: 'Config file',
				status: 'error',
				message: `Invalid JSON at ${configPath}`,
			});
		}
	} else {
		checks.push({
			name: 'Config file',
			status: 'warn',
			message: `Not found at ${configPath}. Run 'wallets provider add' to create it.`,
		});
	}

	// Check 4: Database accessible
	try {
		const db = getDatabase();
		const providers = listProviders(db);
		checks.push({
			name: 'Database',
			status: 'ok',
			message: `Connected. ${providers.length} provider(s) registered.`,
		});

		// Check 5: Provider health
		for (const provider of providers) {
			const hasConfig =
				provider.config && Object.keys(provider.config).length > 0;
			if (provider.type === 'agentcard') {
				const hasJwt = provider.config && 'jwt' in provider.config;
				checks.push({
					name: `Provider: ${provider.name}`,
					status: hasJwt ? 'ok' : 'error',
					message: hasJwt
						? `AgentCard configured (status: ${provider.status})`
						: "Missing JWT token. Run 'wallets provider add agentcard' to configure.",
				});
			} else {
				checks.push({
					name: `Provider: ${provider.name}`,
					status: hasConfig ? 'ok' : 'warn',
					message: `Type: ${provider.type}, Status: ${provider.status}${hasConfig ? '' : ' (no config)'}`,
				});
			}
		}

		if (providers.length === 0) {
			checks.push({
				name: 'Providers',
				status: 'warn',
				message:
					"No providers registered. Use 'wallets provider add' to add one.",
			});
		}
	} catch (e) {
		checks.push({
			name: 'Database',
			status: 'error',
			message: `Failed to connect: ${e instanceof Error ? e.message : String(e)}`,
		});
	}

	// Check 6: MCP binary available
	try {
		const binPath = join(import.meta.dir, '../../dist/mcp/index.js');
		const srcPath = join(import.meta.dir, '../mcp/index.ts');
		const mcpAvailable = existsSync(binPath) || existsSync(srcPath);
		checks.push({
			name: 'MCP server',
			status: mcpAvailable ? 'ok' : 'warn',
			message: mcpAvailable
				? 'MCP server binary available'
				: "MCP server not found. Run 'bun run build' to compile.",
		});
	} catch {
		checks.push({
			name: 'MCP server',
			status: 'warn',
			message: 'Could not check MCP server status.',
		});
	}

	return {
		checks,
		healthy: checks.every((c) => c.status !== 'error'),
	};
}
