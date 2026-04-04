export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
	timestamp: string;
	level: LogLevel;
	message: string;
	[key: string]: unknown;
}

export interface Logger {
	debug(message: string, meta?: Record<string, unknown>): void;
	info(message: string, meta?: Record<string, unknown>): void;
	warn(message: string, meta?: Record<string, unknown>): void;
	error(message: string, meta?: Record<string, unknown>): void;
}

function formatLogEntry(level: LogLevel, message: string, meta?: Record<string, unknown>): LogEntry {
	return {
		timestamp: new Date().toISOString(),
		level,
		message,
		...(meta || {}),
	};
}

class ConsoleLogger implements Logger {
	private minLevel: LogLevel;
	private readonly levelPriority: Record<LogLevel, number> = {
		debug: 0,
		info: 1,
		warn: 2,
		error: 3,
	};

	constructor(minLevel: LogLevel = 'info') {
		this.minLevel = minLevel;
	}

	debug(message: string, meta?: Record<string, unknown>): void {
		if (this.levelPriority[this.minLevel] > this.levelPriority.debug) return;
		console.debug(JSON.stringify(formatLogEntry('debug', message, meta)));
	}

	info(message: string, meta?: Record<string, unknown>): void {
		if (this.levelPriority[this.minLevel] > this.levelPriority.info) return;
		console.info(JSON.stringify(formatLogEntry('info', message, meta)));
	}

	warn(message: string, meta?: Record<string, unknown>): void {
		if (this.levelPriority[this.minLevel] > this.levelPriority.warn) return;
		console.warn(JSON.stringify(formatLogEntry('warn', message, meta)));
	}

	error(message: string, meta?: Record<string, unknown>): void {
		console.error(JSON.stringify(formatLogEntry('error', message, meta)));
	}
}

// Default logger instance
const LOG_LEVEL = (process.env.WALLETS_LOG_LEVEL as LogLevel) || 'info';
export const logger = new ConsoleLogger(LOG_LEVEL);

export { ConsoleLogger };
