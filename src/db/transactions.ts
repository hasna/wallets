import type { Database } from 'bun:sqlite';
import type {
	ListTransactionsFilter,
	Transaction,
	TransactionRow,
	TransactionStatus,
	TransactionType,
} from '../types/index.js';
import { getDatabase, uuid } from './database.js';

function rowToTransaction(row: TransactionRow): Transaction {
	return {
		...row,
		type: row.type as Transaction['type'],
		status: row.status as Transaction['status'],
		currency: row.currency as Transaction['currency'],
		metadata: JSON.parse(row.metadata || '{}'),
	};
}

export interface CreateTransactionRecord {
	card_id: string;
	provider_id: string;
	external_id?: string;
	type: TransactionType;
	status?: TransactionStatus;
	amount: number;
	currency?: string;
	merchant?: string;
	description?: string;
	metadata?: Record<string, unknown>;
}

export function createTransaction(
	input: CreateTransactionRecord,
	db?: Database
): Transaction {
	const d = db || getDatabase();
	const id = uuid();

	d.run(
		`INSERT INTO transactions (id, card_id, provider_id, external_id, type, status, amount, currency, merchant, description, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		[
			id,
			input.card_id,
			input.provider_id,
			input.external_id ?? null,
			input.type,
			input.status || 'completed',
			input.amount,
			input.currency || 'USD',
			input.merchant ?? null,
			input.description ?? null,
			JSON.stringify(input.metadata || {}),
		]
	);

	return getTransaction(id, d)!;
}

export function getTransaction(id: string, db?: Database): Transaction | null {
	const d = db || getDatabase();
	const row = d
		.query('SELECT * FROM transactions WHERE id = ?')
		.get(id) as TransactionRow | null;
	return row ? rowToTransaction(row) : null;
}

export function listTransactions(
	filter: ListTransactionsFilter = {},
	db?: Database
): Transaction[] {
	const d = db || getDatabase();
	const conditions: string[] = [];
	const params: (string | number)[] = [];

	if (filter.card_id) {
		conditions.push('card_id = ?');
		params.push(filter.card_id);
	}
	if (filter.provider_id) {
		conditions.push('provider_id = ?');
		params.push(filter.provider_id);
	}
	if (filter.type) {
		conditions.push('type = ?');
		params.push(filter.type);
	}
	if (filter.status) {
		conditions.push('status = ?');
		params.push(filter.status);
	}

	const where =
		conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
	const limit = filter.limit ? `LIMIT ${filter.limit}` : '';
	const offset = filter.offset ? `OFFSET ${filter.offset}` : '';

	const rows = d
		.query(
			`SELECT * FROM transactions ${where} ORDER BY created_at DESC ${limit} ${offset}`
		)
		.all(...params) as TransactionRow[];
	return rows.map(rowToTransaction);
}
