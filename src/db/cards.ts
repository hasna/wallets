import type { Database } from 'bun:sqlite';
import type {
	Card,
	CardRow,
	CardStatus,
	ListCardsFilter,
	UpdateCardInput,
} from '../types/index.js';
import { getDatabase, now, uuid } from './database.js';

function rowToCard(row: CardRow): Card {
	return {
		...row,
		status: row.status as Card['status'],
		currency: row.currency as Card['currency'],
		metadata: JSON.parse(row.metadata || '{}'),
	};
}

export interface CreateCardRecord {
	provider_id: string;
	external_id: string;
	name: string;
	last_four?: string;
	brand?: string;
	status?: CardStatus;
	currency?: string;
	balance?: number;
	funded_amount?: number;
	spending_limit?: number | null;
	agent_id?: string | null;
	metadata?: Record<string, unknown>;
	expires_at?: string | null;
	idempotency_key?: string | null;
}

export function createCardRecord(input: CreateCardRecord, db?: Database): Card {
	const d = db || getDatabase();
	const id = uuid();

	d.run(
		`INSERT INTO cards (id, provider_id, external_id, name, last_four, brand, status, currency, balance, funded_amount, spending_limit, agent_id, metadata, expires_at, idempotency_key)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		[
			id,
			input.provider_id,
			input.external_id,
			input.name,
			input.last_four || '',
			input.brand || 'visa',
			input.status || 'pending',
			input.currency || 'USD',
			input.balance ?? 0,
			input.funded_amount ?? 0,
			input.spending_limit ?? null,
			input.agent_id ?? null,
			JSON.stringify(input.metadata || {}),
			input.expires_at ?? null,
			input.idempotency_key ?? null,
		]
	);

	return getCard(id, d)!;
}

export function getCard(id: string, db?: Database): Card | null {
	const d = db || getDatabase();
	const row = d
		.query('SELECT * FROM cards WHERE id = ?')
		.get(id) as CardRow | null;
	return row ? rowToCard(row) : null;
}

export function getCardByExternalId(
	externalId: string,
	providerId: string,
	db?: Database
): Card | null {
	const d = db || getDatabase();
	const row = d
		.query('SELECT * FROM cards WHERE external_id = ? AND provider_id = ?')
		.get(externalId, providerId) as CardRow | null;
	return row ? rowToCard(row) : null;
}

export function getCardByIdempotencyKey(
	idempotencyKey: string,
	db?: Database
): Card | null {
	const d = db || getDatabase();
	const row = d
		.query('SELECT * FROM cards WHERE idempotency_key = ?')
		.get(idempotencyKey) as CardRow | null;
	return row ? rowToCard(row) : null;
}

export function listCards(filter: ListCardsFilter = {}, db?: Database): Card[] {
	const d = db || getDatabase();
	const conditions: string[] = [];
	const params: (string | number)[] = [];

	if (filter.provider_id) {
		conditions.push('provider_id = ?');
		params.push(filter.provider_id);
	}
	if (filter.status) {
		conditions.push('status = ?');
		params.push(filter.status);
	}
	if (filter.agent_id) {
		conditions.push('agent_id = ?');
		params.push(filter.agent_id);
	}
	if (filter.currency) {
		conditions.push('currency = ?');
		params.push(filter.currency);
	}

	const where =
		conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
	const limit = filter.limit ? `LIMIT ${filter.limit}` : '';
	const offset = filter.offset ? `OFFSET ${filter.offset}` : '';

	const rows = d
		.query(
			`SELECT * FROM cards ${where} ORDER BY created_at DESC ${limit} ${offset}`
		)
		.all(...params) as CardRow[];
	return rows.map(rowToCard);
}

export function updateCard(
	id: string,
	input: UpdateCardInput,
	db?: Database
): Card {
	const d = db || getDatabase();
	const card = getCard(id, d);
	if (!card) throw new Error(`Card not found: ${id}`);

	const sets: string[] = [];
	const params: (string | number | null)[] = [];

	if (input.name !== undefined) {
		sets.push('name = ?');
		params.push(input.name);
	}
	if (input.status !== undefined) {
		sets.push('status = ?');
		params.push(input.status);
	}
	if (input.spending_limit !== undefined) {
		sets.push('spending_limit = ?');
		params.push(input.spending_limit);
	}
	if (input.metadata !== undefined) {
		sets.push('metadata = ?');
		params.push(JSON.stringify(input.metadata));
	}

	if (sets.length > 0) {
		sets.push('updated_at = ?');
		params.push(now());
		params.push(id);
		d.run(`UPDATE cards SET ${sets.join(', ')} WHERE id = ?`, params);
	}

	return getCard(id, d)!;
}

export function updateCardBalance(
	id: string,
	balance: number,
	db?: Database
): Card {
	const d = db || getDatabase();
	d.run('UPDATE cards SET balance = ?, updated_at = ? WHERE id = ?', [
		balance,
		now(),
		id,
	]);
	return getCard(id, d)!;
}

export function deleteCard(id: string, db?: Database): boolean {
	const d = db || getDatabase();
	return d.run('DELETE FROM cards WHERE id = ?', [id]).changes > 0;
}
