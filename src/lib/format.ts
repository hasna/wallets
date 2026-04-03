import type { Card, Provider, Transaction, DoctorCheck } from "../types/index.js";
import {
  ProviderNotFoundError,
  CardNotFoundError,
  ProviderError,
  InsufficientFundsError,
  ConfigError,
  AgentNotFoundError,
  WalletError,
} from "../types/index.js";

export function formatCard(card: Card): string {
  const id = card.id.slice(0, 8);
  const last4 = card.last_four ? `*${card.last_four}` : "----";
  return `${id} ${card.status.padEnd(8)} ${last4.padEnd(6)} $${card.balance.toFixed(2).padStart(10)} ${card.name}`;
}

export function formatProvider(provider: Provider): string {
  return `${provider.id.slice(0, 8)} ${provider.status.padEnd(8)} ${provider.type.padEnd(12)} ${provider.name}`;
}

export function formatTransaction(tx: Transaction): string {
  const id = tx.id.slice(0, 8);
  const sign = tx.type === "refund" || tx.type === "load" ? "+" : "-";
  return `${id} ${tx.type.padEnd(10)} ${tx.status.padEnd(10)} ${sign}$${tx.amount.toFixed(2).padStart(9)} ${tx.merchant || tx.description || ""}`;
}

export function formatDoctorCheck(check: DoctorCheck): string {
  const icon = check.status === "ok" ? "[ok]" : check.status === "warn" ? "[!!]" : "[ERR]";
  return `${icon} ${check.name}: ${check.message}`;
}

export function formatError(error: unknown, includeStack = false): string {
  return JSON.stringify(formatErrorStructured(error, includeStack));
}

export interface StructuredError {
  timestamp: string;
  type: string;
  code: string;
  message: string;
  suggestion?: string;
  stack?: string;
}

export function formatErrorStructured(error: unknown, includeStack = false): StructuredError {
  const base = { timestamp: new Date().toISOString() };

  if (error instanceof ProviderNotFoundError) {
    return { ...base, type: "ProviderNotFoundError", code: ProviderNotFoundError.code, message: error.message, suggestion: ProviderNotFoundError.suggestion, ...(includeStack && error.stack ? { stack: error.stack } : {}) };
  }
  if (error instanceof CardNotFoundError) {
    return { ...base, type: "CardNotFoundError", code: CardNotFoundError.code, message: error.message, suggestion: CardNotFoundError.suggestion, ...(includeStack && error.stack ? { stack: error.stack } : {}) };
  }
  if (error instanceof ProviderError) {
    return { ...base, type: "ProviderError", code: ProviderError.code, message: error.message, suggestion: ProviderError.suggestion, ...(includeStack && error.stack ? { stack: error.stack } : {}) };
  }
  if (error instanceof InsufficientFundsError) {
    return { ...base, type: "InsufficientFundsError", code: InsufficientFundsError.code, message: error.message, suggestion: InsufficientFundsError.suggestion, ...(includeStack && error.stack ? { stack: error.stack } : {}) };
  }
  if (error instanceof ConfigError) {
    return { ...base, type: "ConfigError", code: ConfigError.code, message: error.message, suggestion: ConfigError.suggestion, ...(includeStack && error.stack ? { stack: error.stack } : {}) };
  }
  if (error instanceof AgentNotFoundError) {
    return { ...base, type: "AgentNotFoundError", code: AgentNotFoundError.code, message: error.message, suggestion: AgentNotFoundError.suggestion, ...(includeStack && error.stack ? { stack: error.stack } : {}) };
  }
  if (error instanceof WalletError) {
    return { ...base, type: "WalletError", code: WalletError.code, message: error.message, suggestion: WalletError.suggestion, ...(includeStack && error.stack ? { stack: error.stack } : {}) };
  }
  if (error instanceof Error) {
    return { ...base, type: error.name || "Error", code: "UNKNOWN_ERROR", message: error.message, ...(includeStack && error.stack ? { stack: error.stack } : {}) };
  }
  return { ...base, type: "Unknown", code: "UNKNOWN_ERROR", message: String(error) };
}
