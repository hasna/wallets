// ── Enums ──────────────────────────────────────────────────────────────────

export const CARD_STATUSES = ["active", "frozen", "closed", "pending"] as const;
export type CardStatus = (typeof CARD_STATUSES)[number];

export const TRANSACTION_TYPES = ["purchase", "refund", "load", "withdrawal", "fee"] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const TRANSACTION_STATUSES = ["pending", "completed", "failed", "reversed"] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

export const PROVIDER_STATUSES = ["active", "inactive", "error"] as const;
export type ProviderStatus = (typeof PROVIDER_STATUSES)[number];

export const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD"] as const;
export type Currency = (typeof CURRENCIES)[number];

// ── Domain Types ───────────────────────────────────────────────────────────

export interface Provider {
  id: string;
  name: string;
  type: string;
  status: ProviderStatus;
  config: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Card {
  id: string;
  provider_id: string;
  external_id: string;
  name: string;
  last_four: string;
  brand: string;
  status: CardStatus;
  currency: Currency;
  balance: number;
  funded_amount: number;
  spending_limit: number | null;
  agent_id: string | null;
  metadata: Record<string, unknown>;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  idempotency_key: string | null;
}

export interface CardDetails extends Card {
  pan: string;
  cvv: string;
  exp_month: string;
  exp_year: string;
}

export interface Transaction {
  id: string;
  card_id: string;
  provider_id: string;
  external_id: string | null;
  type: TransactionType;
  status: TransactionStatus;
  amount: number;
  currency: Currency;
  merchant: string | null;
  description: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface Agent {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  last_seen_at: string;
}

// ── Row Types (raw DB output) ──────────────────────────────────────────────

export interface ProviderRow {
  id: string;
  name: string;
  type: string;
  status: string;
  config: string | null;
  metadata: string | null;
  created_at: string;
  updated_at: string;
}

export interface CardRow {
  id: string;
  provider_id: string;
  external_id: string;
  name: string;
  last_four: string;
  brand: string;
  status: string;
  currency: string;
  balance: number;
  funded_amount: number;
  spending_limit: number | null;
  agent_id: string | null;
  metadata: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  idempotency_key: string | null;
}

export interface TransactionRow {
  id: string;
  card_id: string;
  provider_id: string;
  external_id: string | null;
  type: string;
  status: string;
  amount: number;
  currency: string;
  merchant: string | null;
  description: string | null;
  metadata: string | null;
  created_at: string;
}

export interface AgentRow {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  last_seen_at: string;
}

// ── Input Types ────────────────────────────────────────────────────────────

export interface CreateProviderInput {
  name: string;
  type: string;
  config?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface CreateCardInput {
  provider_id?: string;
  name?: string;
  amount: number;
  currency?: Currency;
  agent_id?: string;
  spending_limit?: number;
  metadata?: Record<string, unknown>;
}

export interface UpdateCardInput {
  name?: string;
  status?: CardStatus;
  spending_limit?: number | null;
  metadata?: Record<string, unknown>;
}

export interface ListCardsFilter {
  provider_id?: string;
  status?: CardStatus;
  agent_id?: string;
  currency?: Currency;
  limit?: number;
  offset?: number;
}

export interface ListTransactionsFilter {
  card_id?: string;
  provider_id?: string;
  type?: TransactionType;
  status?: TransactionStatus;
  limit?: number;
  offset?: number;
}

export interface RegisterAgentInput {
  name: string;
  description?: string;
}

// ── Provider Interface ─────────────────────────────────────────────────────

export interface WalletProvider {
  name: string;
  type: string;

  createCard(input: CreateCardInput): Promise<Card & { funding_url?: string }>;
  listCards(): Promise<Card[]>;
  getCardDetails(externalId: string): Promise<CardDetails>;
  getBalance(externalId: string): Promise<{ balance: number; currency: Currency }>;
  closeCard(externalId: string): Promise<void>;
  freezeCard?(externalId: string): Promise<void>;
  unfreezeCard?(externalId: string): Promise<void>;
  getTransactions?(externalId: string): Promise<Transaction[]>;
}

// ── Doctor Types ───────────────────────────────────────────────────────────

export interface DoctorCheck {
  name: string;
  status: "ok" | "warn" | "error";
  message: string;
}

export interface DoctorResult {
  checks: DoctorCheck[];
  healthy: boolean;
}

// ── Error Classes ──────────────────────────────────────────────────────────

export class WalletError extends Error {
  static code = "WALLET_ERROR";
  static suggestion = "Check the wallet configuration and try again.";

  constructor(message: string) {
    super(message);
    this.name = "WalletError";
  }
}

export class ProviderNotFoundError extends Error {
  static code = "PROVIDER_NOT_FOUND";
  static suggestion = "Use 'wallets provider list' to see available providers, or 'wallets provider add' to register one.";

  constructor(id: string) {
    super(`Provider not found: ${id}`);
    this.name = "ProviderNotFoundError";
  }
}

export class CardNotFoundError extends Error {
  static code = "CARD_NOT_FOUND";
  static suggestion = "Use 'wallets card list' to see available cards.";

  constructor(id: string) {
    super(`Card not found: ${id}`);
    this.name = "CardNotFoundError";
  }
}

export class ProviderError extends Error {
  static code = "PROVIDER_ERROR";
  static suggestion = "Check the provider configuration and API credentials. Run 'wallets doctor' for diagnostics.";

  constructor(provider: string, message: string) {
    super(`Provider '${provider}' error: ${message}`);
    this.name = "ProviderError";
  }
}

export class InsufficientFundsError extends Error {
  static code = "INSUFFICIENT_FUNDS";
  static suggestion = "Fund the card with more money before making this transaction.";

  constructor(cardId: string, required: number, available: number) {
    super(`Insufficient funds on card ${cardId}: need ${required}, have ${available}`);
    this.name = "InsufficientFundsError";
  }
}

export class ConfigError extends Error {
  static code = "CONFIG_ERROR";
  static suggestion = "Check ~/.hasna/wallets/config.json and ensure all required fields are set.";

  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export class AgentNotFoundError extends Error {
  static code = "AGENT_NOT_FOUND";
  static suggestion = "Use 'wallets agent list' to see registered agents.";

  constructor(id: string) {
    super(`Agent not found: ${id}`);
    this.name = "AgentNotFoundError";
  }
}
