// Database layer
export { getDatabase, closeDatabase, resetDatabase } from "./db/database.js";
export { createProvider, getProvider, getProviderByName, listProviders, updateProvider, deleteProvider, ensureProvider } from "./db/providers.js";
export { createCardRecord, getCard, getCardByExternalId, listCards, updateCard, updateCardBalance, deleteCard } from "./db/cards.js";
export { createTransaction, getTransaction, listTransactions } from "./db/transactions.js";
export { registerAgent, getAgent, getAgentByName, listAgents, deleteAgent } from "./db/agents.js";

// Provider layer
export { getProviderInstance, createAgentCardProvider, registerProviderFactory, listProviderTypes } from "./providers/index.js";
export { AgentCardProvider } from "./providers/agentcard.js";

// Lib
export { loadConfig, saveConfig, getProviderConfig, setProviderConfig } from "./lib/config.js";
export { runDoctor } from "./lib/doctor.js";
export { formatCard, formatProvider, formatTransaction, formatDoctorCheck, formatError } from "./lib/format.js";

// Types
export type {
  Card,
  CardDetails,
  CardStatus,
  Provider,
  ProviderStatus,
  Transaction,
  TransactionType,
  TransactionStatus,
  Currency,
  Agent,
  WalletProvider,
  CreateCardInput,
  CreateProviderInput,
  UpdateCardInput,
  ListCardsFilter,
  ListTransactionsFilter,
  RegisterAgentInput,
  DoctorCheck,
  DoctorResult,
} from "./types/index.js";

export {
  WalletError,
  ProviderNotFoundError,
  CardNotFoundError,
  ProviderError,
  InsufficientFundsError,
  ConfigError,
  AgentNotFoundError,
} from "./types/index.js";
