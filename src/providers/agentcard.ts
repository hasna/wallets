import type {
	Card,
	CardDetails,
	CreateCardInput,
	Currency,
	Transaction,
	TransactionType,
	WalletProvider,
} from '../types/index.js';
import { ProviderError } from '../types/index.js';

interface AgentCardConfig {
	jwt: string;
	baseUrl?: string;
}

export class AgentCardProvider implements WalletProvider {
	name = 'agentcard';
	type = 'agentcard';
	private jwt: string;
	private baseUrl: string;

	constructor(config: AgentCardConfig) {
		this.jwt = config.jwt;
		this.baseUrl = config.baseUrl || 'https://api.agentcard.sh';
	}

	private async request(
		path: string,
		options: RequestInit = {}
	): Promise<unknown> {
		const url = `${this.baseUrl}${path}`;
		const res = await fetch(url, {
			...options,
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${this.jwt}`,
				...(options.headers || {}),
			},
		});

		if (!res.ok) {
			const body = await res.text();
			throw new ProviderError('agentcard', `HTTP ${res.status}: ${body}`);
		}

		return res.json();
	}

	async createCard(
		input: CreateCardInput
	): Promise<Card & { funding_url?: string }> {
		const data = (await this.request('/cards', {
			method: 'POST',
			body: JSON.stringify({ amount: input.amount }),
		})) as {
			id: string;
			funding_url?: string;
			status: string;
			amount: number;
		};

		return {
			id: data.id,
			provider_id: '',
			external_id: data.id,
			name: input.name || `AgentCard $${input.amount}`,
			last_four: '',
			brand: 'visa',
			status: (data.status as Card['status']) || 'pending',
			currency: (input.currency || 'USD') as Currency,
			balance: 0,
			funded_amount: data.amount || input.amount,
			spending_limit: input.spending_limit ?? null,
			agent_id: input.agent_id ?? null,
			metadata: input.metadata || {},
			expires_at: null,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
			funding_url: data.funding_url,
			idempotency_key: null,
		};
	}

	async listCards(): Promise<Card[]> {
		const data = (await this.request('/cards')) as Array<{
			id: string;
			status: string;
			last_four?: string;
			balance?: number;
			amount?: number;
			created_at?: string;
		}>;

		return data.map((c) => ({
			id: c.id,
			provider_id: '',
			external_id: c.id,
			name: `AgentCard ${c.last_four ? `*${c.last_four}` : c.id.slice(0, 8)}`,
			last_four: c.last_four || '',
			brand: 'visa',
			status: (c.status as Card['status']) || 'active',
			currency: 'USD' as Currency,
			balance: c.balance ?? 0,
			funded_amount: c.amount ?? 0,
			spending_limit: null,
			agent_id: null,
			metadata: {},
			expires_at: null,
			created_at: c.created_at || new Date().toISOString(),
			updated_at: new Date().toISOString(),
			idempotency_key: null,
		}));
	}

	async getCardDetails(externalId: string): Promise<CardDetails> {
		const data = (await this.request(`/cards/${externalId}/details`)) as {
			id: string;
			pan: string;
			cvv: string;
			exp_month: string;
			exp_year: string;
			last_four?: string;
			balance?: number;
			amount?: number;
			status?: string;
		};

		return {
			id: data.id,
			provider_id: '',
			external_id: data.id,
			name: `AgentCard *${data.last_four || data.pan.slice(-4)}`,
			last_four: data.last_four || data.pan.slice(-4),
			brand: 'visa',
			status: (data.status as Card['status']) || 'active',
			currency: 'USD' as Currency,
			balance: data.balance ?? 0,
			funded_amount: data.amount ?? 0,
			spending_limit: null,
			agent_id: null,
			metadata: {},
			expires_at: null,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
			pan: data.pan,
			cvv: data.cvv,
			exp_month: data.exp_month,
			exp_year: data.exp_year,
			idempotency_key: null,
		};
	}

	async getBalance(
		externalId: string
	): Promise<{ balance: number; currency: Currency }> {
		const data = (await this.request(`/cards/${externalId}/balance`)) as {
			balance: number;
			currency?: string;
		};
		return {
			balance: data.balance,
			currency: (data.currency as Currency) || 'USD',
		};
	}

	async closeCard(externalId: string): Promise<void> {
		await this.request(`/cards/${externalId}/close`, { method: 'POST' });
	}

	async freezeCard(externalId: string): Promise<void> {
		await this.request(`/cards/${externalId}/freeze`, { method: 'POST' });
	}

	async unfreezeCard(externalId: string): Promise<void> {
		await this.request(`/cards/${externalId}/unfreeze`, { method: 'POST' });
	}

	async topUpCard(
		externalId: string,
		amount: number
	): Promise<{ balance: number; currency: Currency }> {
		const data = (await this.request(`/cards/${externalId}/topup`, {
			method: 'POST',
			body: JSON.stringify({ amount }),
		})) as { balance: number; currency?: string };
		return {
			balance: data.balance,
			currency: (data.currency as Currency) || 'USD',
		};
	}

	async getTransactions(externalId: string): Promise<Transaction[]> {
		const data = (await this.request(
			`/cards/${externalId}/transactions`
		)) as Array<{
			id: string;
			type: string;
			status: string;
			amount: number;
			currency?: string;
			merchant?: string;
			description?: string;
			created_at?: string;
		}>;

		return data.map((tx) => ({
			id: tx.id,
			card_id: '',
			provider_id: '',
			external_id: tx.id,
			type: (tx.type as TransactionType) || 'purchase',
			status: (tx.status as Transaction['status']) || 'completed',
			amount: tx.amount,
			currency: (tx.currency as Currency) || 'USD',
			merchant: tx.merchant || null,
			description: tx.description || null,
			metadata: {},
			created_at: tx.created_at || new Date().toISOString(),
		}));
	}
}
