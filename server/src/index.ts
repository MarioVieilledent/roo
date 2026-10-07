import express, { type NextFunction, type Request, type Response } from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { AttachmentStore, sanitizeAttachment } from './attachments.js';
import { GenerationManager, send } from './generation.js';
import { getStatus, modelCapabilities, OLLAMA_HOST } from './ollama.js';
import { ConversationStore, titleFrom } from './store.js';
import type { Attachment, Conversation, ConversationSummary, Message } from './types.js';

const PORT = Number(process.env.PORT || 6500);
// Bind to every interface by default so the built app is reachable on the LAN.
// Set HOST=127.0.0.1 to limit it to this computer.
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = path.resolve(process.env.CONVERSATIONS_DIR || path.join(import.meta.dirname, '../../data/conversations'));
const CLIENT_DIST = path.resolve(import.meta.dirname, '../../client/dist');

const MAX_ATTACHMENTS = 10;

const store = new ConversationStore(DATA_DIR);
const attachments = new AttachmentStore(path.join(DATA_DIR, 'attachments'));
const generations = new GenerationManager(store, attachments);
const app = express();
app.use(express.json({ limit: '5mb' }));

type Params = { id: string };

const summary = (c: Conversation): ConversationSummary => ({
  id: c.id,
  title: c.title,
  model: c.model,
  createdAt: c.createdAt,
  updatedAt: c.updatedAt,
  generating: generations.isGenerating(c.id),
  messageCount: c.messages.length,
});

const withState = (c: Conversation) => ({ ...c, generating: generations.isGenerating(c.id) });

const userMessage = (content: string, files: Attachment[], createdAt: string): Message => ({
  role: 'user',
  content,
  createdAt,
  ...(files.length ? { attachments: files } : {}),
});

async function parseSend(body: unknown) {
  const b = (body ?? {}) as Record<string, unknown>;
  const content = typeof b.content === 'string' ? b.content : '';
  const model = typeof b.model === 'string' ? b.model.trim() : '';
  const files = await parseAttachments(b.attachments);
  if (!content.trim() && !files.length) throw httpError(400, 'Message content is required');
  if (!model) throw httpError(400, 'A model is required');
  if (files.length) {
    // Fail before saving the message rather than after: Ollama's own error is cryptic.
    const caps = await modelCapabilities(model);
    if (caps.length) {
      if (files.some((a) => a.kind === 'image') && !caps.includes('vision')) throw httpError(400, `${model} can't read images. Choose a model with vision.`);
      if (files.some((a) => a.kind === 'audio') && !caps.includes('audio')) throw httpError(400, `${model} can't listen to audio. Choose a model with audio support.`);
    }
  }
  return { content, model, think: b.think === true, attachments: files };
}

async function parseAttachments(raw: unknown): Promise<Attachment[]> {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw httpError(400, 'attachments must be an array');
  if (raw.length > MAX_ATTACHMENTS) throw httpError(400, `At most ${MAX_ATTACHMENTS} attachments per message`);
  return Promise.all(
    raw.map(async (a: { id?: unknown }) => {
      const stored = typeof a?.id === 'string' ? await attachments.info(a.id) : null;
      if (!stored) throw httpError(400, 'Unknown attachment, upload it again');
      return sanitizeAttachment(a, stored);
    }),
  );
}

/** Removes attachment files that no conversation uses anymore. */
async function collectAttachments() {
  const used = new Set((await store.list()).flatMap((c) => c.messages.flatMap((m) => m.attachments?.map((a) => a.id) ?? [])));
  await attachments.gc(used);
}

function httpError(status: number, message: string) {
  return Object.assign(new Error(message), { status });
}

async function load(req: Request<Params>) {
  if (!store.isValidId(req.params.id)) throw httpError(400, 'Invalid conversation id');
  const conv = await store.get(req.params.id);
  if (!conv) throw httpError(404, 'Conversation not found');
  return conv;
}

app.get('/api/status', async (_req, res) => {
  res.json(await getStatus());
});

app.get('/api/conversations', async (_req, res) => {
  res.json((await store.list()).map(summary));
});

app.post('/api/conversations', async (req, res) => {
  const { content, model, think, attachments: files } = await parseSend(req.body);
  const now = new Date().toISOString();
  const title = titleFrom(content, files);
  const conv: Conversation = {
    id: store.newId(title),
    title,
    model,
    createdAt: now,
    updatedAt: now,
    messages: [userMessage(content, files, now)],
  };
  await store.save(conv);
  generations.start(conv, model, think);
  res.status(201).json(withState(conv));
});

app.get('/api/conversations/:id', async (req: Request<Params>, res) => {
  res.json(withState(await load(req)));
});

app.patch('/api/conversations/:id', async (req: Request<Params>, res) => {
  const conv = await load(req);
  const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
  if (!title) throw httpError(400, 'Title is required');
  conv.title = title.slice(0, 200);
  await store.save(conv);
  res.json(summary(conv));
});

app.delete('/api/conversations/:id', async (req: Request<Params>, res) => {
  await load(req);
  generations.stop(req.params.id);
  await store.delete(req.params.id);
  res.status(204).end();
  void collectAttachments().catch((e) => console.error('Attachment cleanup failed:', e));
});

app.post('/api/conversations/:id/messages', async (req: Request<Params>, res) => {
  const conv = await load(req);
  if (generations.isGenerating(conv.id)) throw httpError(409, 'A response is already being generated');
  const { content, model, think, attachments: files } = await parseSend(req.body);
  const message = userMessage(content, files, new Date().toISOString());
  conv.messages.push(message);
  conv.model = model;
  conv.updatedAt = message.createdAt;
  await store.save(conv);
  generations.start(conv, model, think);
  res.status(201).json(withState(conv));
});

app.post('/api/conversations/:id/stop', async (req: Request<Params>, res) => {
  res.json({ stopped: generations.stop(req.params.id) });
});

/** Server-Sent Events: a snapshot of the in-flight reply, then live deltas. */
app.get('/api/conversations/:id/stream', async (req: Request<Params>, res) => {
  await load(req);
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });
  res.flushHeaders();
  if (!generations.subscribe(req.params.id, res)) {
    send(res, 'idle', {});
    res.end();
    return;
  }
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 15000);
  res.on('close', () => clearInterval(heartbeat));
});

/** Raw upload of one image or audio clip; the message references it by id. */
app.post('/api/attachments', express.raw({ type: () => true, limit: '64mb' }), async (req, res) => {
  const data = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!data.length) throw httpError(400, 'Empty upload');
  const stored = await attachments.put(data);
  if (!stored) throw httpError(415, 'Unsupported file type. Use JPEG or PNG images and WAV, MP3 or FLAC audio.');
  res.status(201).json(stored);
});

app.get('/api/attachments/:id', async (req: Request<Params>, res) => {
  if (!attachments.isValidId(req.params.id)) throw httpError(400, 'Invalid attachment id');
  // Content-addressed, so a URL's content never changes.
  res.sendFile(attachments.file(req.params.id), { maxAge: '1y', immutable: true }, (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: 'Attachment not found' });
  });
});

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

if (existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(CLIENT_DIST, 'index.html')));
}

app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status ?? 500;
  if (status >= 500) console.error(err);
  if (res.headersSent) return res.end();
  res.status(status).json({ error: err.message });
});

await store.init();
await attachments.init();
void collectAttachments().catch((e) => console.error('Attachment cleanup failed:', e));
app.listen(PORT, HOST, () => {
  console.log(`✨ API listening on http://${HOST}:${PORT}`);
  console.log(`   Ollama host:    ${OLLAMA_HOST}`);
  console.log(`   Conversations:  ${DATA_DIR}`);
});
