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

export function formatError(error: unknown): string {
  if (error instanceof ProviderNotFoundError) {
    return JSON.stringify({ code: ProviderNotFoundError.code, message: error.message, suggestion: ProviderNotFoundError.suggestion });
  }
  if (error instanceof CardNotFoundError) {
    return JSON.stringify({ code: CardNotFoundError.code, message: error.message, suggestion: CardNotFoundError.suggestion });
  }
  if (error instanceof ProviderError) {
    return JSON.stringify({ code: ProviderError.code, message: error.message, suggestion: ProviderError.suggestion });
  }
  if (error instanceof InsufficientFundsError) {
    return JSON.stringify({ code: InsufficientFundsError.code, message: error.message, suggestion: InsufficientFundsError.suggestion });
  }
  if (error instanceof ConfigError) {
    return JSON.stringify({ code: ConfigError.code, message: error.message, suggestion: ConfigError.suggestion });
  }
  if (error instanceof AgentNotFoundError) {
    return JSON.stringify({ code: AgentNotFoundError.code, message: error.message, suggestion: AgentNotFoundError.suggestion });
  }
  if (error instanceof WalletError) {
    return JSON.stringify({ code: WalletError.code, message: error.message, suggestion: WalletError.suggestion });
  }
  if (error instanceof Error) {
    return JSON.stringify({ code: "UNKNOWN_ERROR", message: error.message });
  }
  return JSON.stringify({ code: "UNKNOWN_ERROR", message: String(error) });
}
