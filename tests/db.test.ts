import type { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import {
	deleteAgent,
	getAgent,
	getAgentByName,
	listAgents,
	registerAgent,
} from '../src/db/agents';
import {
	createCardRecord,
	deleteCard,
	getCard,
	getCardByExternalId,
	listCards,
	updateCard,
	updateCardBalance,
} from '../src/db/cards';
import {
	closeDatabase,
	getDatabase,
	now,
	resetDatabase,
	resolvePartialId,
	shortId,
	uuid,
} from '../src/db/database';
import {
	createProvider,
	deleteProvider,
	ensureProvider,
	getProvider,
	getProviderByName,
	getProviderByType,
	listProviders,
	updateProvider,
} from '../src/db/providers';
import {
	createTransaction,
	getTransaction,
	listTransactions,
} from '../src/db/transactions';

let db: Database;

beforeEach(() => {
	process.env['WALLETS_DB_PATH'] = ':memory:';
	resetDatabase();
	db = getDatabase();
});

afterEach(() => {
	closeDatabase();
	delete process.env['WALLETS_DB_PATH'];
});

// ── Database helpers ───────────────────────────────────────────────────────

describe('database helpers', () => {
	it('now() returns ISO string', () => {
		const result = now();
		expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T/);
	});

	it('uuid() returns valid UUID', () => {
		const result = uuid();
		expect(result).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/);
	});

	it('shortId() returns 8-char string', () => {
		const result = shortId();
		expect(result).toHaveLength(8);
	});

	it('resolvePartialId resolves unique prefix', () => {
		const provider = createProvider({ name: 'test', type: 'test' }, db);
		const resolved = resolvePartialId(db, 'providers', provider.id.slice(0, 4));
		expect(resolved).toBe(provider.id);
	});

	it('resolvePartialId returns null for no match', () => {
		const resolved = resolvePartialId(db, 'providers', 'zzzzzzz');
		expect(resolved).toBeNull();
	});
});

// ── Providers ──────────────────────────────────────────────────────────────

describe('providers', () => {
	it('creates a provider', () => {
		const provider = createProvider(
			{ name: 'agentcard', type: 'agentcard' },
			db
		);
		expect(provider.name).toBe('agentcard');
		expect(provider.type).toBe('agentcard');
		expect(provider.status).toBe('active');
		expect(provider.id).toBeTruthy();
	});

	it('creates provider with config', () => {
		const provider = createProvider(
			{ name: 'ac', type: 'agentcard', config: { jwt: 'tok123' } },
			db
		);
		expect(provider.config).toEqual({ jwt: 'tok123' });
	});

	it('gets provider by id', () => {
		const created = createProvider({ name: 'test', type: 'test' }, db);
		const found = getProvider(created.id, db);
		expect(found).not.toBeNull();
		expect(found!.name).toBe('test');
	});

	it('gets provider by name', () => {
		createProvider({ name: 'mycard', type: 'agentcard' }, db);
		const found = getProviderByName('mycard', db);
		expect(found).not.toBeNull();
		expect(found!.type).toBe('agentcard');
	});

	it('gets provider by type', () => {
		createProvider({ name: 'ac', type: 'agentcard' }, db);
		const found = getProviderByType('agentcard', db);
		expect(found).not.toBeNull();
	});

	it('returns null for missing provider', () => {
		expect(getProvider('nonexistent', db)).toBeNull();
		expect(getProviderByName('nonexistent', db)).toBeNull();
		expect(getProviderByType('nonexistent', db)).toBeNull();
	});

	it('lists providers', () => {
		createProvider({ name: 'a', type: 'test' }, db);
		createProvider({ name: 'b', type: 'test' }, db);
		const providers = listProviders(db);
		expect(providers).toHaveLength(2);
	});

	it('updates provider', () => {
		const created = createProvider({ name: 'test', type: 'test' }, db);
		const updated = updateProvider(
			created.id,
			{ config: { key: 'val' }, status: 'inactive' },
			db
		);
		expect(updated.config).toEqual({ key: 'val' });
		expect(updated.status).toBe('inactive');
	});

	it('throws on updating nonexistent provider', () => {
		expect(() => updateProvider('fake', { name: 'x' }, db)).toThrow();
	});

	it('deletes provider', () => {
		const created = createProvider({ name: 'del', type: 'test' }, db);
		expect(deleteProvider(created.id, db)).toBe(true);
		expect(getProvider(created.id, db)).toBeNull();
	});

	it('delete returns false for nonexistent', () => {
		expect(deleteProvider('fake', db)).toBe(false);
	});

	it('ensureProvider creates if not exists', () => {
		const provider = ensureProvider('new-provider', 'test', { key: 'v' }, db);
		expect(provider.name).toBe('new-provider');
		expect(provider.config).toEqual({ key: 'v' });
	});

	it('ensureProvider returns existing', () => {
		const first = ensureProvider('ep', 'test', undefined, db);
		const second = ensureProvider('ep', 'test', undefined, db);
		expect(first.id).toBe(second.id);
	});

	it('ensureProvider updates config on existing', () => {
		ensureProvider('ep', 'test', { a: 1 }, db);
		const updated = ensureProvider('ep', 'test', { b: 2 }, db);
		expect(updated.config).toEqual({ b: 2 });
	});
});

// ── Cards ──────────────────────────────────────────────────────────────────

describe('cards', () => {
	let providerId: string;

	beforeEach(() => {
		const provider = createProvider({ name: 'testprovider', type: 'test' }, db);
		providerId = provider.id;
	});

	it('creates a card record', () => {
		const card = createCardRecord(
			{
				provider_id: providerId,
				external_id: 'ext-1',
				name: 'Test Card',
				balance: 100,
				funded_amount: 100,
			},
			db
		);
		expect(card.name).toBe('Test Card');
		expect(card.balance).toBe(100);
		expect(card.status).toBe('pending');
		expect(card.currency).toBe('USD');
	});

	it('creates card with all fields', () => {
		const card = createCardRecord(
			{
				provider_id: providerId,
				external_id: 'ext-2',
				name: 'Full Card',
				last_four: '4242',
				brand: 'mastercard',
				status: 'active',
				currency: 'EUR',
				balance: 50,
				funded_amount: 50,
				spending_limit: 25,
				agent_id: 'agent-1',
				metadata: { foo: 'bar' },
				expires_at: '2027-01-01',
			},
			db
		);
		expect(card.last_four).toBe('4242');
		expect(card.brand).toBe('mastercard');
		expect(card.status).toBe('active');
		expect(card.currency).toBe('EUR');
		expect(card.spending_limit).toBe(25);
		expect(card.agent_id).toBe('agent-1');
		expect(card.metadata).toEqual({ foo: 'bar' });
		expect(card.expires_at).toBe('2027-01-01');
	});

	it('gets card by id', () => {
		const card = createCardRecord(
			{ provider_id: providerId, external_id: 'e1', name: 'C' },
			db
		);
		const found = getCard(card.id, db);
		expect(found).not.toBeNull();
		expect(found!.name).toBe('C');
	});

	it('gets card by external id', () => {
		createCardRecord(
			{ provider_id: providerId, external_id: 'ext-unique', name: 'C' },
			db
		);
		const found = getCardByExternalId('ext-unique', providerId, db);
		expect(found).not.toBeNull();
	});

	it('returns null for missing card', () => {
		expect(getCard('nonexistent', db)).toBeNull();
		expect(getCardByExternalId('nope', providerId, db)).toBeNull();
	});

	it('lists cards with filters', () => {
		createCardRecord(
			{
				provider_id: providerId,
				external_id: 'a',
				name: 'A',
				status: 'active',
			},
			db
		);
		createCardRecord(
			{
				provider_id: providerId,
				external_id: 'b',
				name: 'B',
				status: 'closed',
			},
			db
		);
		createCardRecord(
			{
				provider_id: providerId,
				external_id: 'c',
				name: 'C',
				status: 'active',
				currency: 'EUR',
			},
			db
		);

		expect(listCards({}, db)).toHaveLength(3);
		expect(listCards({ status: 'active' }, db)).toHaveLength(2);
		expect(listCards({ status: 'closed' }, db)).toHaveLength(1);
		expect(listCards({ currency: 'EUR' }, db)).toHaveLength(1);
		expect(listCards({ provider_id: providerId }, db)).toHaveLength(3);
		expect(listCards({ limit: 1 }, db)).toHaveLength(1);
	});

	it('updates card', () => {
		const card = createCardRecord(
			{ provider_id: providerId, external_id: 'u1', name: 'Up' },
			db
		);
		const updated = updateCard(
			card.id,
			{ name: 'Updated', status: 'active' },
			db
		);
		expect(updated.name).toBe('Updated');
		expect(updated.status).toBe('active');
	});

	it('updates card metadata', () => {
		const card = createCardRecord(
			{ provider_id: providerId, external_id: 'm1', name: 'M' },
			db
		);
		const updated = updateCard(card.id, { metadata: { a: 1 } }, db);
		expect(updated.metadata).toEqual({ a: 1 });
	});

	it('throws on updating nonexistent card', () => {
		expect(() => updateCard('fake', { name: 'x' }, db)).toThrow();
	});

	it('updates card balance', () => {
		const card = createCardRecord(
			{ provider_id: providerId, external_id: 'b1', name: 'B', balance: 50 },
			db
		);
		const updated = updateCardBalance(card.id, 75.5, db);
		expect(updated.balance).toBe(75.5);
	});

	it('deletes card', () => {
		const card = createCardRecord(
			{ provider_id: providerId, external_id: 'd1', name: 'D' },
			db
		);
		expect(deleteCard(card.id, db)).toBe(true);
		expect(getCard(card.id, db)).toBeNull();
	});

	it('delete returns false for nonexistent', () => {
		expect(deleteCard('fake', db)).toBe(false);
	});
});

// ── Transactions ───────────────────────────────────────────────────────────

describe('transactions', () => {
	let providerId: string;
	let cardId: string;

	beforeEach(() => {
		const provider = createProvider({ name: 'tp', type: 'test' }, db);
		providerId = provider.id;
		const card = createCardRecord(
			{ provider_id: providerId, external_id: 'tc1', name: 'TC' },
			db
		);
		cardId = card.id;
	});

	it('creates a transaction', () => {
		const tx = createTransaction(
			{
				card_id: cardId,
				provider_id: providerId,
				type: 'purchase',
				amount: 10.5,
				merchant: 'Amazon',
			},
			db
		);
		expect(tx.type).toBe('purchase');
		expect(tx.amount).toBe(10.5);
		expect(tx.merchant).toBe('Amazon');
		expect(tx.status).toBe('completed');
	});

	it('creates transaction with all fields', () => {
		const tx = createTransaction(
			{
				card_id: cardId,
				provider_id: providerId,
				type: 'refund',
				status: 'pending',
				amount: 5,
				currency: 'EUR',
				external_id: 'ext-tx-1',
				merchant: 'Shop',
				description: 'Refund for item',
				metadata: { ref: '123' },
			},
			db
		);
		expect(tx.status).toBe('pending');
		expect(tx.currency).toBe('EUR');
		expect(tx.external_id).toBe('ext-tx-1');
		expect(tx.description).toBe('Refund for item');
		expect(tx.metadata).toEqual({ ref: '123' });
	});

	it('gets transaction by id', () => {
		const tx = createTransaction(
			{ card_id: cardId, provider_id: providerId, type: 'load', amount: 100 },
			db
		);
		const found = getTransaction(tx.id, db);
		expect(found).not.toBeNull();
		expect(found!.amount).toBe(100);
	});

	it('returns null for missing transaction', () => {
		expect(getTransaction('nonexistent', db)).toBeNull();
	});

	it('lists transactions with filters', () => {
		createTransaction(
			{
				card_id: cardId,
				provider_id: providerId,
				type: 'purchase',
				amount: 10,
			},
			db
		);
		createTransaction(
			{ card_id: cardId, provider_id: providerId, type: 'refund', amount: 5 },
			db
		);
		createTransaction(
			{
				card_id: cardId,
				provider_id: providerId,
				type: 'purchase',
				amount: 20,
				status: 'failed',
			},
			db
		);

		expect(listTransactions({}, db)).toHaveLength(3);
		expect(listTransactions({ card_id: cardId }, db)).toHaveLength(3);
		expect(listTransactions({ type: 'purchase' }, db)).toHaveLength(2);
		expect(listTransactions({ type: 'refund' }, db)).toHaveLength(1);
		expect(listTransactions({ status: 'failed' }, db)).toHaveLength(1);
		expect(listTransactions({ limit: 1 }, db)).toHaveLength(1);
	});
});

// ── Agents ─────────────────────────────────────────────────────────────────

describe('agents', () => {
	it('registers an agent', () => {
		const agent = registerAgent({ name: 'marcus' }, db);
		expect(agent.name).toBe('marcus');
		expect(agent.id).toHaveLength(8);
	});

	it('registers agent with description', () => {
		const agent = registerAgent(
			{ name: 'titus', description: 'wallet manager' },
			db
		);
		expect(agent.description).toBe('wallet manager');
	});

	it('idempotent registration', () => {
		const first = registerAgent({ name: 'cassius' }, db);
		const second = registerAgent({ name: 'cassius' }, db);
		expect(first.id).toBe(second.id);
	});

	it('normalizes name to lowercase', () => {
		const agent = registerAgent({ name: 'BRUTUS' }, db);
		expect(agent.name).toBe('brutus');
	});

	it('gets agent by id', () => {
		const agent = registerAgent({ name: 'nero' }, db);
		const found = getAgent(agent.id, db);
		expect(found).not.toBeNull();
		expect(found!.name).toBe('nero');
	});

	it('gets agent by name', () => {
		registerAgent({ name: 'aurelius' }, db);
		const found = getAgentByName('aurelius', db);
		expect(found).not.toBeNull();
	});

	it('returns null for missing agent', () => {
		expect(getAgent('fake', db)).toBeNull();
		expect(getAgentByName('nobody', db)).toBeNull();
	});

	it('lists agents', () => {
		registerAgent({ name: 'a' }, db);
		registerAgent({ name: 'b' }, db);
		expect(listAgents(db)).toHaveLength(2);
	});

	it('deletes agent', () => {
		const agent = registerAgent({ name: 'del' }, db);
		expect(deleteAgent(agent.id, db)).toBe(true);
		expect(getAgent(agent.id, db)).toBeNull();
	});

	it('delete returns false for nonexistent', () => {
		expect(deleteAgent('fake', db)).toBe(false);
	});
});
