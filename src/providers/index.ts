import type { WalletProvider } from '../types/index.js';
import { AgentCardProvider } from './agentcard.js';
import {
	createProviderInstance,
	getProviderFactory,
	listProviderTypes,
	registerProviderFactory,
} from './registry.js';

// Register built-in providers
registerProviderFactory('agentcard', () => {
	throw new Error(
		'AgentCard requires config. Use createAgentCardProvider() instead.'
	);
});

export function createAgentCardProvider(config: {
	jwt: string;
	baseUrl?: string;
}): AgentCardProvider {
	return new AgentCardProvider(config);
}

const PROVIDER_INSTANCE_TTL_MS = 300_000; // 5 minutes

interface CachedInstance {
	instance: WalletProvider;
	expiresAt: number;
}

const instanceCache = new Map<string, CachedInstance>();

function makeInstanceCacheKey(
	type: string,
	config: Record<string, unknown>
): string {
	// Sort keys for stable serialization
	const sorted = Object.keys(config)
		.sort()
		.reduce<Record<string, unknown>>((acc, k) => {
			acc[k] = config[k];
			return acc;
		}, {});
	return `${type}:${JSON.stringify(sorted)}`;
}

export function getProviderInstance(
	type: string,
	config: Record<string, unknown>
): WalletProvider {
	const key = makeInstanceCacheKey(type, config);
	const cached = instanceCache.get(key);

	if (cached && cached.expiresAt > Date.now()) {
		return cached.instance;
	}

	let instance: WalletProvider;
	switch (type) {
		case 'agentcard':
			instance = new AgentCardProvider({
				jwt: config.jwt as string,
				baseUrl: config.baseUrl as string | undefined,
			});
			break;
		default:
			instance = createProviderInstance(type);
	}

	instanceCache.set(key, {
		instance,
		expiresAt: Date.now() + PROVIDER_INSTANCE_TTL_MS,
	});

	return instance;
}

export function clearProviderInstanceCache(): void {
	instanceCache.clear();
}

export {
	registerProviderFactory,
	createProviderInstance,
	listProviderTypes,
	getProviderFactory,
};
export { AgentCardProvider } from './agentcard.js';
