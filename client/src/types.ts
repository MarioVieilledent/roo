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
  thinkingMs?: number;
  model?: string;
  think?: boolean;
  stats?: MessageStats;
  error?: string;
  stopped?: boolean;
}

export interface ConversationSummary {
  id: string;
  title: string;
  model: string;
  createdAt: string;
  updatedAt: string;
  generating: boolean;
  messageCount: number;
}

export interface Conversation extends Omit<ConversationSummary, 'messageCount'> {
  messages: Message[];
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
  command: string;
  output: string;
  source: 'cli' | 'api' | 'none';
  error?: string;
  models: ModelInfo[];
  checkedAt: string;
}

/** The in-flight assistant reply, as streamed from the server. */
export interface LiveReply {
  model: string;
  think: boolean;
  startedAt: string;
  thinking: string;
  content: string;
}
