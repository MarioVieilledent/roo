export type Role = 'user' | 'assistant';

export interface MessageStats {
  evalCount?: number;
  evalDurationMs?: number;
  promptEvalCount?: number;
  totalDurationMs?: number;
}

export interface Message {
  role: Role;
  content: string;
  createdAt: string;
  thinking?: string;
  /** Time spent in the thinking phase, in milliseconds. */
  thinkingMs?: number;
  model?: string;
  think?: boolean;
  stats?: MessageStats;
  error?: string;
  stopped?: boolean;
}

export interface ConversationMeta {
  id: string;
  title: string;
  model: string;
  createdAt: string;
  updatedAt: string;
}

export interface Conversation extends ConversationMeta {
  messages: Message[];
}

export interface ConversationSummary extends ConversationMeta {
  generating: boolean;
  messageCount: number;
}

export interface ModelInfo {
  name: string;
  id: string;
  size: string;
  sizeBytes?: number;
  modified: string;
  modifiedAt?: string;
  family?: string;
  families?: string[];
  parameterSize?: string;
  quantization?: string;
  format?: string;
  capabilities: string[];
  contextLength?: number;
  loaded: boolean;
}

export interface OllamaStatus {
  running: boolean;
  installed: boolean;
  host: string;
  version?: string;
  /** Raw output of the `ollama list` command (or an equivalent rendering). */
  command: string;
  output: string;
  source: 'cli' | 'api' | 'none';
  error?: string;
  models: ModelInfo[];
  checkedAt: string;
}
