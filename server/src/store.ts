import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Attachment, Conversation, ConversationMeta, Message } from './types.js';

/**
 * Conversations are stored as one Markdown file per conversation.
 *
 * The file is readable as a normal Markdown document, while HTML comments carry
 * the metadata needed to parse it back:
 *
 *   ---
 *   id: "20261005-0812-hello-x7k2"
 *   title: "Hello"
 *   ...
 *   ---
 *
 *   # Hello
 *
 *   <!-- message {"role":"user","createdAt":"...","attachments":[...]} -->
 *   ### 🧑 You
 *
 *   <!-- attachments -->
 *   ![photo.jpg](attachments/3fa9….jpg)
 *   [🎤 Voice message · 0:07](attachments/b41c….wav)
 *   <!-- /attachments -->
 *
 *   Hi!
 *
 *   <!-- message {"role":"assistant","model":"qwen3",...} -->
 *   ### ✨ Assistant · qwen3
 *
 *   <!-- thinking -->
 *   <details><summary>Thinking</summary>
 *   ...
 *   </details>
 *   <!-- /thinking -->
 *
 *   Hello! How can I help?
 */

const ID_RE = /^[a-z0-9][a-z0-9-]{0,120}$/;
const MESSAGE_RE = /^<!-- message (\{.*\}) -->$/;
const META_KEYS: (keyof ConversationMeta)[] = ['id', 'title', 'model', 'createdAt', 'updatedAt'];

export class ConversationStore {
  private cache = new Map<string, { mtimeMs: number; conv: Conversation }>();
  private writeQueues = new Map<string, Promise<void>>();

  constructor(readonly dir: string) {}

  async init() {
    await mkdir(this.dir, { recursive: true });
  }

  isValidId(id: string) {
    return ID_RE.test(id);
  }

  private file(id: string) {
    if (!this.isValidId(id)) throw new Error(`Invalid conversation id: ${id}`);
    return path.join(this.dir, `${id}.md`);
  }

  newId(firstMessage: string) {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
    const slug = firstMessage
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40)
      .replace(/-+$/, '');
    const rand = Math.random().toString(36).slice(2, 6);
    return [stamp, slug, rand].filter(Boolean).join('-');
  }

  async list(): Promise<Conversation[]> {
    const names = (await readdir(this.dir)).filter((n) => n.endsWith('.md'));
    const out: Conversation[] = [];
    await Promise.all(
      names.map(async (name) => {
        const id = name.slice(0, -3);
        if (!this.isValidId(id)) return;
        const conv = await this.get(id).catch(() => null);
        if (conv) out.push(conv);
      }),
    );
    // Forget cache entries for files deleted from disk.
    const ids = new Set(out.map((c) => c.id));
    for (const id of this.cache.keys()) if (!ids.has(id)) this.cache.delete(id);
    return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async get(id: string): Promise<Conversation | null> {
    const file = this.file(id);
    let mtimeMs: number;
    try {
      mtimeMs = (await stat(file)).mtimeMs;
    } catch {
      this.cache.delete(id);
      return null;
    }
    const cached = this.cache.get(id);
    if (cached && cached.mtimeMs === mtimeMs) return cached.conv;
    const conv = parseConversation(await readFile(file, 'utf8'), id);
    this.cache.set(id, { mtimeMs, conv });
    return conv;
  }

  /** Writes are serialized per conversation and atomic (tmp file + rename). */
  save(conv: Conversation): Promise<void> {
    const prev = this.writeQueues.get(conv.id) ?? Promise.resolve();
    const next = prev
      .catch(() => {})
      .then(async () => {
        const file = this.file(conv.id);
        const tmp = `${file}.${process.pid}.tmp`;
        await writeFile(tmp, serializeConversation(conv), 'utf8');
        await rename(tmp, file);
        const { mtimeMs } = await stat(file);
        this.cache.set(conv.id, { mtimeMs, conv: structuredClone(conv) });
      });
    this.writeQueues.set(conv.id, next);
    return next;
  }

  async delete(id: string) {
    await (this.writeQueues.get(id) ?? Promise.resolve()).catch(() => {});
    this.cache.delete(id);
    await unlink(this.file(id));
  }
}

export function serializeConversation(conv: Conversation): string {
  const lines: string[] = ['---'];
  for (const key of META_KEYS) lines.push(`${key}: ${JSON.stringify(conv[key])}`);
  lines.push('---', '', `# ${conv.title.replace(/\n/g, ' ')}`, '');

  for (const m of conv.messages) {
    const { content, thinking, ...meta } = m;
    lines.push(`<!-- message ${JSON.stringify(meta)} -->`);
    lines.push(m.role === 'user' ? '### 🧑 You' : `### ✨ Assistant${m.model ? ` · ${m.model}` : ''}`, '');
    if (m.attachments?.length) {
      lines.push('<!-- attachments -->', ...m.attachments.map(attachmentLink), '<!-- /attachments -->', '');
    }
    if (thinking) {
      lines.push('<!-- thinking -->', '<details>', '<summary>Thinking</summary>', '', thinking.trim(), '', '</details>', '<!-- /thinking -->', '');
    }
    if (content) lines.push(content.trim(), '');
  }
  return lines.join('\n');
}

export function parseConversation(text: string, fallbackId: string): Conversation {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const meta: Record<string, string> = {};
  let i = 0;
  if (lines[0] === '---') {
    for (i = 1; i < lines.length && lines[i] !== '---'; i++) {
      const m = /^(\w+):\s*(.*)$/.exec(lines[i]);
      if (!m) continue;
      try {
        meta[m[1]] = JSON.parse(m[2]);
      } catch {
        meta[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    }
    i++;
  }

  const messages: Message[] = [];
  let current: { meta: Partial<Message>; body: string[] } | null = null;
  const flush = () => {
    if (!current) return;
    const body = current.body;
    // Drop the human-readable "### You / ### Assistant" heading.
    while (body.length && body[0].trim() === '') body.shift();
    if (body.length && /^### /.test(body[0])) body.shift();
    const aStart = body.indexOf('<!-- attachments -->');
    const aEnd = body.indexOf('<!-- /attachments -->');
    if (aStart !== -1 && aEnd > aStart) body.splice(aStart, aEnd - aStart + 1);
    let thinking: string | undefined;
    const tStart = body.indexOf('<!-- thinking -->');
    const tEnd = body.indexOf('<!-- /thinking -->');
    if (tStart !== -1 && tEnd > tStart) {
      thinking = body
        .slice(tStart + 1, tEnd)
        .filter((l) => !/^<\/?details>$|^<summary>.*<\/summary>$/.test(l.trim()))
        .join('\n')
        .trim();
      body.splice(tStart, tEnd - tStart + 1);
    }
    messages.push({
      role: current.meta.role === 'assistant' ? 'assistant' : 'user',
      createdAt: current.meta.createdAt ?? new Date(0).toISOString(),
      ...current.meta,
      content: body.join('\n').trim(),
      ...(thinking ? { thinking } : {}),
    });
    current = null;
  };

  for (; i < lines.length; i++) {
    const m = MESSAGE_RE.exec(lines[i]);
    if (m) {
      flush();
      let parsed: Partial<Message> = {};
      try {
        parsed = JSON.parse(m[1]);
      } catch {
        /* keep defaults */
      }
      current = { meta: parsed, body: [] };
    } else if (current) {
      current.body.push(lines[i]);
    }
  }
  flush();

  const now = new Date().toISOString();
  return {
    id: meta.id || fallbackId,
    title: meta.title || messages[0]?.content.slice(0, 60) || 'Untitled',
    model: meta.model || '',
    createdAt: meta.createdAt || now,
    updatedAt: meta.updatedAt || meta.createdAt || now,
    messages,
  };
}

/** A Markdown link to the file, relative to the conversation's `.md` file. */
function attachmentLink(a: Attachment) {
  const href = `attachments/${a.id}`;
  const label = (a.name ?? '').replace(/[[\]\n]/g, ' ');
  if (a.kind === 'image') return `![${label}](${href})`;
  const s = Math.round((a.durationMs ?? 0) / 1000);
  const duration = a.durationMs !== undefined ? ` · ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : '';
  return `[🎤 ${label || 'Voice message'}${duration}](${href})`;
}

export function titleFrom(text: string, attachments: Attachment[] = []): string {
  if (!text.trim()) {
    if (attachments.some((a) => a.kind === 'audio')) return 'Voice message';
    if (attachments.length) return attachments.length > 1 ? 'Images' : 'Image';
  }
  const line =
    text
      .split('\n')
      .map((l) => l.trim())
      .find(Boolean) ?? 'New chat';
  const clean = line
    .replace(/^#+\s*|^>\s*|^[-*+]\s+|^\d+[.)]\s+/g, '')
    .replace(/[`*_~]/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .trim();
  return clean.length > 60 ? `${clean.slice(0, 57).trimEnd()}…` : clean || 'New chat';
}
