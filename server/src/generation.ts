import type { Response } from 'express';
import type { AttachmentStore } from './attachments.js';
import { chatStream, modelCapabilities, type ChatMessage } from './ollama.js';
import type { ConversationStore } from './store.js';
import type { Conversation, Message } from './types.js';

/**
 * A generation runs on the server independently of any HTTP connection, so a
 * client can leave a conversation and come back later: it re-subscribes and
 * receives a snapshot of everything produced so far, then the live deltas.
 */
interface Generation {
  conversationId: string;
  model: string;
  think: boolean;
  startedAt: number;
  thinkingEndedAt?: number;
  thinking: string;
  content: string;
  subscribers: Set<Response>;
  abort: AbortController;
}

export interface Snapshot {
  model: string;
  think: boolean;
  startedAt: string;
  thinking: string;
  content: string;
}

export class GenerationManager {
  private active = new Map<string, Generation>();

  constructor(
    private store: ConversationStore,
    private attachments: AttachmentStore,
  ) {}

  isGenerating(id: string) {
    return this.active.has(id);
  }

  stop(id: string) {
    const gen = this.active.get(id);
    if (!gen) return false;
    gen.abort.abort();
    return true;
  }

  /** Registers an SSE subscriber. Returns false when nothing is generating. */
  subscribe(id: string, res: Response): boolean {
    const gen = this.active.get(id);
    if (!gen) return false;
    send(res, 'snapshot', this.snapshot(gen));
    gen.subscribers.add(res);
    res.on('close', () => gen.subscribers.delete(res));
    return true;
  }

  private snapshot(gen: Generation): Snapshot {
    return {
      model: gen.model,
      think: gen.think,
      startedAt: new Date(gen.startedAt).toISOString(),
      thinking: gen.thinking,
      content: gen.content,
    };
  }

  /** Starts generating the assistant reply for the last user message of `conv`. */
  start(conv: Conversation, model: string, think: boolean) {
    if (this.active.has(conv.id)) throw new Error('A response is already being generated for this conversation');
    const gen: Generation = {
      conversationId: conv.id,
      model,
      think,
      startedAt: Date.now(),
      thinking: '',
      content: '',
      subscribers: new Set(),
      abort: new AbortController(),
    };
    this.active.set(conv.id, gen);
    void this.run(gen, conv);
  }

  private broadcast(gen: Generation, event: string, data: unknown) {
    for (const res of gen.subscribers) send(res, event, data);
  }

  /** The conversation as Ollama expects it: images and audio go in `images`, base64-encoded. */
  private async history(conv: Conversation): Promise<ChatMessage[]> {
    const usable = conv.messages.filter((m) => m.content.trim() || m.attachments?.length);
    return Promise.all(
      usable.map(async (m) => {
        const files = m.attachments ?? [];
        if (!files.length) return { role: m.role, content: m.content };
        const images = await Promise.all(files.map((a) => this.attachments.base64(a.id)));
        return { role: m.role, content: m.content.trim() || defaultPrompt(files), images };
      }),
    );
  }

  private async run(gen: Generation, conv: Conversation) {
    let error: string | undefined;
    let stats: Message['stats'];
    try {
      const history = await this.history(conv);
      // Only send `think` to models that understand it; others reject the field.
      const caps = await modelCapabilities(gen.model);
      const supportsThinking = caps.includes('thinking');
      if (gen.think && !supportsThinking && caps.length) {
        throw new Error(`${gen.model} does not support thinking. Turn "Think" off or choose another model.`);
      }
      const body = { model: gen.model, messages: history, ...(supportsThinking ? { think: gen.think } : {}) };

      for await (const chunk of chatStream(body, gen.abort.signal)) {
        if (chunk.error) throw new Error(chunk.error);
        const t = chunk.message?.thinking;
        const c = chunk.message?.content;
        if (t) {
          gen.thinking += t;
          this.broadcast(gen, 'delta', { thinking: t });
        }
        if (c) {
          if (gen.thinking && !gen.thinkingEndedAt) gen.thinkingEndedAt = Date.now();
          gen.content += c;
          this.broadcast(gen, 'delta', { content: c });
        }
        if (chunk.done) {
          stats = {
            evalCount: chunk.eval_count,
            evalDurationMs: chunk.eval_duration ? Math.round(chunk.eval_duration / 1e6) : undefined,
            promptEvalCount: chunk.prompt_eval_count,
            totalDurationMs: chunk.total_duration ? Math.round(chunk.total_duration / 1e6) : undefined,
          };
        }
      }
    } catch (e) {
      if (!gen.abort.signal.aborted) {
        error = e instanceof Error ? e.message : String(e);
        if (/fetch failed|ECONNREFUSED/i.test(error)) error = 'Could not reach Ollama. Is `ollama serve` running?';
      }
    }

    const message: Message = {
      role: 'assistant',
      content: gen.content,
      createdAt: new Date().toISOString(),
      model: gen.model,
      think: gen.think,
      ...(gen.thinking ? { thinking: gen.thinking } : {}),
      ...(gen.thinking ? { thinkingMs: (gen.thinkingEndedAt ?? Date.now()) - gen.startedAt } : {}),
      ...(stats ? { stats } : {}),
      ...(error ? { error } : {}),
      ...(gen.abort.signal.aborted ? { stopped: true } : {}),
    };

    try {
      // The conversation may have been deleted meanwhile: don't resurrect it.
      const latest = await this.store.get(conv.id);
      if (latest) {
        latest.messages.push(message);
        latest.updatedAt = message.createdAt;
        await this.store.save(latest);
      }
    } catch (e) {
      console.error(`Failed to save conversation ${conv.id}:`, e);
    }

    this.active.delete(conv.id);
    this.broadcast(gen, 'done', { message });
    for (const res of gen.subscribers) res.end();
  }
}

/**
 * Sent in place of an empty prompt: without any text, models tend to ignore a
 * voice message or describe it instead of answering it.
 */
function defaultPrompt(files: Message['attachments'] & {}) {
  if (files.some((a) => a.kind === 'audio')) return 'Listen to this audio and respond to it.';
  return files.length > 1 ? 'Describe these images.' : 'Describe this image.';
}

export function send(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}
