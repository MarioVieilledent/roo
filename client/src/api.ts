import type { Conversation, ConversationSummary, OllamaStatus } from './types';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: init?.body ? { 'content-type': 'application/json', ...init.headers } : init?.headers,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `${res.status} ${res.statusText}`);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export interface SendBody {
  content: string;
  model: string;
  think: boolean;
}

export const api = {
  status: () => request<OllamaStatus>('/api/status'),
  conversations: () => request<ConversationSummary[]>('/api/conversations'),
  conversation: (id: string) => request<Conversation>(`/api/conversations/${encodeURIComponent(id)}`),
  create: (body: SendBody) => request<Conversation>('/api/conversations', { method: 'POST', body: JSON.stringify(body) }),
  send: (id: string, body: SendBody) =>
    request<Conversation>(`/api/conversations/${encodeURIComponent(id)}/messages`, { method: 'POST', body: JSON.stringify(body) }),
  stop: (id: string) => request<{ stopped: boolean }>(`/api/conversations/${encodeURIComponent(id)}/stop`, { method: 'POST' }),
  rename: (id: string, title: string) =>
    request<ConversationSummary>(`/api/conversations/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ title }) }),
  remove: (id: string) => request<void>(`/api/conversations/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  streamUrl: (id: string) => `/api/conversations/${encodeURIComponent(id)}/stream`,
};
