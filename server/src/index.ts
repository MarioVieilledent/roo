import express, { type NextFunction, type Request, type Response } from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { GenerationManager, send } from './generation.js';
import { getStatus, OLLAMA_HOST } from './ollama.js';
import { ConversationStore, titleFrom } from './store.js';
import type { Conversation, ConversationSummary, Message } from './types.js';

const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || '127.0.0.1';
const DATA_DIR = path.resolve(process.env.CONVERSATIONS_DIR || path.join(import.meta.dirname, '../../data/conversations'));
const CLIENT_DIST = path.resolve(import.meta.dirname, '../../client/dist');

const store = new ConversationStore(DATA_DIR);
const generations = new GenerationManager(store);
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

function parseSend(body: unknown): { content: string; model: string; think: boolean } {
  const b = (body ?? {}) as Record<string, unknown>;
  const content = typeof b.content === 'string' ? b.content : '';
  const model = typeof b.model === 'string' ? b.model.trim() : '';
  if (!content.trim()) throw httpError(400, 'Message content is required');
  if (!model) throw httpError(400, 'A model is required');
  return { content, model, think: b.think === true };
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
  const { content, model, think } = parseSend(req.body);
  const now = new Date().toISOString();
  const conv: Conversation = {
    id: store.newId(titleFrom(content)),
    title: titleFrom(content),
    model,
    createdAt: now,
    updatedAt: now,
    messages: [{ role: 'user', content, createdAt: now }],
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
});

app.post('/api/conversations/:id/messages', async (req: Request<Params>, res) => {
  const conv = await load(req);
  if (generations.isGenerating(conv.id)) throw httpError(409, 'A response is already being generated');
  const { content, model, think } = parseSend(req.body);
  const message: Message = { role: 'user', content, createdAt: new Date().toISOString() };
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
app.listen(PORT, HOST, () => {
  console.log(`✨ API listening on http://${HOST}:${PORT}`);
  console.log(`   Ollama host:    ${OLLAMA_HOST}`);
  console.log(`   Conversations:  ${DATA_DIR}`);
});
