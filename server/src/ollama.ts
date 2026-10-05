import { execFile } from 'node:child_process';
import type { ModelInfo, OllamaStatus } from './types.js';

export const OLLAMA_HOST = normalizeHost(process.env.OLLAMA_HOST || 'http://127.0.0.1:11434');

function normalizeHost(h: string) {
  let host = h.trim();
  if (!/^https?:\/\//.test(host)) host = `http://${host}`;
  host = host.replace(/\/+$/, '');
  // "0.0.0.0" is a valid bind address for `ollama serve` but not a destination.
  host = host.replace('://0.0.0.0', '://127.0.0.1');
  if (!/:\d+$/.test(host.replace(/^https?:\/\//, ''))) host += ':11434';
  return host;
}

interface TagModel {
  name: string;
  model: string;
  modified_at: string;
  size: number;
  digest: string;
  details?: {
    format?: string;
    family?: string;
    families?: string[] | null;
    parameter_size?: string;
    quantization_level?: string;
  };
}

interface ShowResponse {
  capabilities?: string[];
  model_info?: Record<string, unknown>;
}

const showCache = new Map<string, ShowResponse>();

async function api<T>(path: string, init?: RequestInit & { timeoutMs?: number }): Promise<T> {
  const res = await fetch(`${OLLAMA_HOST}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
    signal: init?.signal ?? AbortSignal.timeout(init?.timeoutMs ?? 5000),
  });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status} ${await res.text().catch(() => '')}`.trim());
  return (await res.json()) as T;
}

function runOllamaList(): Promise<{ ok: true; stdout: string } | { ok: false; notInstalled: boolean; message: string }> {
  return new Promise((resolve) => {
    execFile(
      'ollama',
      ['list'],
      { timeout: 8000, env: { ...process.env, OLLAMA_HOST, NO_COLOR: '1' } },
      (err, stdout, stderr) => {
        if (!err) return resolve({ ok: true, stdout });
        const notInstalled = (err as NodeJS.ErrnoException).code === 'ENOENT';
        resolve({
          ok: false,
          notInstalled,
          message: notInstalled ? 'ollama: command not found' : (stderr || stdout || err.message).trim(),
        });
      },
    );
  });
}

/** Parses the fixed-width table printed by `ollama list`. */
export function parseOllamaList(stdout: string) {
  const lines = stdout.split('\n').filter((l) => l.trim());
  const header = lines.shift();
  if (!header || !/^NAME\s/.test(header)) return [];
  const cols = ['NAME', 'ID', 'SIZE', 'MODIFIED'].map((c) => header.indexOf(c));
  return lines.map((line) => {
    const cell = (k: number) => line.slice(cols[k], k + 1 < cols.length ? cols[k + 1] : undefined).trim();
    return { name: cell(0), id: cell(1), size: cell(2), modified: cell(3) };
  });
}

async function show(name: string, digest: string): Promise<ShowResponse> {
  const key = `${name}@${digest}`;
  const hit = showCache.get(key);
  if (hit) return hit;
  const res = await api<ShowResponse>('/api/show', { method: 'POST', body: JSON.stringify({ model: name }) }).catch(
    () => ({}) as ShowResponse,
  );
  // Drop the (large) tensor/tokenizer data, keep what we display.
  const slim: ShowResponse = {
    capabilities: res.capabilities,
    model_info: Object.fromEntries(Object.entries(res.model_info ?? {}).filter(([k]) => k.endsWith('.context_length'))),
  };
  showCache.set(key, slim);
  return slim;
}

function formatBytes(n: number) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`;
  if (n >= 1e6) return `${Math.round(n / 1e6)} MB`;
  return `${Math.round(n / 1e3)} KB`;
}

export async function getStatus(): Promise<OllamaStatus> {
  const checkedAt = new Date().toISOString();
  const cli = await runOllamaList();
  const base = { host: OLLAMA_HOST, command: 'ollama list', checkedAt };

  let tags: TagModel[] | null = null;
  let version: string | undefined;
  let apiError: string | undefined;
  try {
    [tags, version] = await Promise.all([
      api<{ models: TagModel[] }>('/api/tags').then((r) => r.models ?? []),
      api<{ version: string }>('/api/version').then((r) => r.version),
    ]);
  } catch (e) {
    apiError = e instanceof Error ? e.message : String(e);
  }

  if (!tags) {
    return {
      ...base,
      running: false,
      installed: cli.ok || !cli.notInstalled,
      source: cli.ok ? 'cli' : 'none',
      output: cli.ok ? cli.stdout : cli.message,
      error: cli.ok ? apiError : cli.message,
      models: [],
    };
  }

  const loaded = new Set(
    await api<{ models: { name: string }[] }>('/api/ps')
      .then((r) => r.models.map((m) => m.name))
      .catch(() => [] as string[]),
  );
  const cliRows = cli.ok ? parseOllamaList(cli.stdout) : [];
  const byName = new Map(tags.map((t) => [t.name, t]));
  // Keep the CLI order (most recent first); fall back to the API list.
  const names = cliRows.length ? cliRows.map((r) => r.name) : tags.map((t) => t.name);

  const models = await Promise.all(
    names.map(async (name): Promise<ModelInfo> => {
      const row = cliRows.find((r) => r.name === name);
      const tag = byName.get(name);
      const info = tag ? await show(name, tag.digest) : {};
      const ctx = Object.values(info.model_info ?? {}).find((v) => typeof v === 'number') as number | undefined;
      return {
        name,
        id: row?.id ?? tag?.digest.slice(0, 12) ?? '',
        size: row?.size ?? (tag ? formatBytes(tag.size) : ''),
        sizeBytes: tag?.size,
        modified: row?.modified ?? '',
        modifiedAt: tag?.modified_at,
        family: tag?.details?.family,
        families: tag?.details?.families ?? undefined,
        parameterSize: tag?.details?.parameter_size,
        quantization: tag?.details?.quantization_level,
        format: tag?.details?.format,
        capabilities: info.capabilities ?? [],
        contextLength: ctx,
        loaded: loaded.has(name),
      };
    }),
  );

  let output: string;
  if (cli.ok) {
    output = cli.stdout;
  } else {
    // CLI unavailable (e.g. remote OLLAMA_HOST): render the same table from the API.
    const rows = [['NAME', 'ID', 'SIZE', 'MODIFIED'], ...models.map((m) => [m.name, m.id, m.size, m.modifiedAt?.slice(0, 10) ?? ''])];
    const widths = rows[0].map((_, c) => Math.max(...rows.map((r) => r[c].length)) + 4);
    output = rows.map((r) => r.map((cell, c) => cell.padEnd(widths[c])).join('').trimEnd()).join('\n');
  }

  return {
    ...base,
    command: cli.ok ? 'ollama list' : `GET ${OLLAMA_HOST}/api/tags`,
    running: true,
    installed: cli.ok || !cli.notInstalled,
    version,
    source: cli.ok ? 'cli' : 'api',
    output,
    models,
  };
}

export async function modelCapabilities(model: string): Promise<string[]> {
  for (const [key, v] of showCache) if (key.startsWith(`${model}@`)) return v.capabilities ?? [];
  const res = await api<ShowResponse>('/api/show', { method: 'POST', body: JSON.stringify({ model }) }).catch(
    () => ({}) as ShowResponse,
  );
  return res.capabilities ?? [];
}

export interface ChatChunk {
  message?: { role: string; content?: string; thinking?: string };
  done?: boolean;
  error?: string;
  eval_count?: number;
  eval_duration?: number;
  prompt_eval_count?: number;
  total_duration?: number;
}

/** Streams /api/chat as parsed NDJSON chunks. */
export async function* chatStream(
  body: { model: string; messages: { role: string; content: string }[]; think?: boolean },
  signal: AbortSignal,
): AsyncGenerator<ChatChunk> {
  const res = await fetch(`${OLLAMA_HOST}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...body, stream: true }),
    signal,
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    let msg = text;
    try {
      msg = JSON.parse(text).error ?? text;
    } catch {
      /* plain text error */
    }
    throw new Error(msg || `Ollama returned HTTP ${res.status}`);
  }
  const decoder = new TextDecoder();
  let buf = '';
  for await (const part of res.body as unknown as AsyncIterable<Uint8Array>) {
    buf += decoder.decode(part, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line) yield JSON.parse(line) as ChatChunk;
    }
  }
  if (buf.trim()) yield JSON.parse(buf) as ChatChunk;
}
