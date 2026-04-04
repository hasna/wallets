import { getDatabase, uuid } from './database.js';

export interface AuditEntry {
	id: string;
	action: 'create' | 'update' | 'delete';
	entity_type: 'card' | 'provider' | 'transaction' | 'agent';
	entity_id: string;
	actor_id: string | null;
	actor_name: string | null;
	changes: Record<string, unknown>;
	metadata: Record<string, unknown>;
	created_at: string;
}

export interface CreateAuditParams {
	action: AuditEntry['action'];
	entity_type: AuditEntry['entity_type'];
	entity_id: string;
	actor_id?: string | null;
	actor_name?: string | null;
	changes?: Record<string, unknown>;
	metadata?: Record<string, unknown>;
}

export function createAuditEntry(params: CreateAuditParams): AuditEntry {
	const db = getDatabase();
	const id = uuid();

	db.run(
		`INSERT INTO audit_log (id, action, entity_type, entity_id, actor_id, actor_name, changes, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		[
			id,
			params.action,
			params.entity_type,
			params.entity_id,
			params.actor_id ?? null,
			params.actor_name ?? null,
			JSON.stringify(params.changes ?? {}),
			JSON.stringify(params.metadata ?? {}),
		]
	);

	const row = db.query('SELECT * FROM audit_log WHERE id = ?').get(id) as {
		id: string;
		action: string;
		entity_type: string;
		entity_id: string;
		actor_id: string | null;
		actor_name: string | null;
		changes: string;
		metadata: string;
		created_at: string;
	};

	return {
		...row,
		action: row.action as AuditEntry['action'],
		entity_type: row.entity_type as AuditEntry['entity_type'],
		changes: JSON.parse(row.changes || '{}'),
		metadata: JSON.parse(row.metadata || '{}'),
	};
}

export interface ListAuditFilter {
	entity_type?: AuditEntry['entity_type'];
	entity_id?: string;
	actor_id?: string;
	action?: AuditEntry['action'];
	limit?: number;
	offset?: number;
}

export function listAuditLog(filter: ListAuditFilter = {}): AuditEntry[] {
	const db = getDatabase();
	const conditions: string[] = [];
	const params: (string | number)[] = [];

	if (filter.entity_type) {
		conditions.push('entity_type = ?');
		params.push(filter.entity_type);
	}
	if (filter.entity_id) {
		conditions.push('entity_id = ?');
		params.push(filter.entity_id);
	}
	if (filter.actor_id) {
		conditions.push('actor_id = ?');
		params.push(filter.actor_id);
	}
	if (filter.action) {
		conditions.push('action = ?');
		params.push(filter.action);
	}

	const where =
		conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
	const limit = filter.limit ? `LIMIT ${filter.limit}` : '';
	const offset = filter.offset ? `OFFSET ${filter.offset}` : '';

	const rows = db
		.query(
			`SELECT * FROM audit_log ${where} ORDER BY created_at DESC ${limit} ${offset}`
		)
		.all(...params) as {
		id: string;
		action: string;
		entity_type: string;
		entity_id: string;
		actor_id: string | null;
		actor_name: string | null;
		changes: string;
		metadata: string;
		created_at: string;
	}[];

	return rows.map((row) => ({
		...row,
		action: row.action as AuditEntry['action'],
		entity_type: row.entity_type as AuditEntry['entity_type'],
		changes: JSON.parse(row.changes || '{}'),
		metadata: JSON.parse(row.metadata || '{}'),
	}));
}
