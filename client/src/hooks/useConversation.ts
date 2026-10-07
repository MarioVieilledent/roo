import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type SendBody } from '../api';
import type { Conversation, LiveReply, Message } from '../types';

// Survive navigation between conversations so coming back is instant.
const convCache = new Map<string, Conversation>();
const liveCache = new Map<string, LiveReply>();

const emptyLive = (model: string, think: boolean): LiveReply => ({
  model,
  think,
  startedAt: new Date().toISOString(),
  thinking: '',
  content: '',
});

function appendOnce(c: Conversation, message: Message): Conversation {
  const last = c.messages[c.messages.length - 1];
  if (last && last.role === message.role && last.createdAt === message.createdAt) return c;
  return { ...c, messages: [...c.messages, message], generating: false, updatedAt: message.createdAt };
}

/**
 * Loads a conversation and, when the server is generating a reply for it,
 * subscribes to the reply stream. Leaving the conversation closes the stream;
 * coming back re-subscribes and the server replays a snapshot first.
 */
export function useConversation(id: string | null, onChange: () => void) {
  const [conv, setConv] = useState<Conversation | null>(() => (id ? (convCache.get(id) ?? null) : null));
  const [live, setLive] = useState<LiveReply | null>(() => (id ? (liveCache.get(id) ?? null) : null));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const idRef = useRef(id);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const updateConv = useCallback((fn: (c: Conversation) => Conversation) => {
    setConv((c) => {
      if (!c) return c;
      const next = fn(c);
      convCache.set(next.id, next);
      return next;
    });
  }, []);

  const updateLive = useCallback((cid: string, next: LiveReply | null | ((l: LiveReply | null) => LiveReply | null)) => {
    setLive((prev) => {
      const value = typeof next === 'function' ? next(prev) : next;
      if (value) liveCache.set(cid, value);
      else liveCache.delete(cid);
      return value;
    });
  }, []);

  const unsubscribe = useCallback(() => {
    esRef.current?.close();
    esRef.current = null;
  }, []);

  const load = useCallback(
    async (cid: string) => {
      setLoading(!convCache.has(cid));
      try {
        const fresh = await api.conversation(cid);
        if (idRef.current !== cid) return;
        convCache.set(cid, fresh);
        setConv(fresh);
        setError(null);
        if (fresh.generating) {
          if (!esRef.current) subscribeRef.current(cid);
        } else {
          unsubscribe();
          updateLive(cid, null);
        }
      } catch (e) {
        if (idRef.current === cid) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (idRef.current === cid) setLoading(false);
      }
    },
    [unsubscribe, updateLive],
  );

  const subscribe = useCallback(
    (cid: string) => {
      unsubscribe();
      const es = new EventSource(api.streamUrl(cid));
      esRef.current = es;
      // Deltas can arrive faster than we can render: batch them per frame.
      let pending = { thinking: '', content: '' };
      let raf = 0;
      const flush = () => {
        raf = 0;
        const p = pending;
        pending = { thinking: '', content: '' };
        updateLive(cid, (l) => (l ? { ...l, thinking: l.thinking + p.thinking, content: l.content + p.content } : l));
      };
      const reset = () => {
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        pending = { thinking: '', content: '' };
      };
      const finish = () => {
        reset();
        es.close();
        if (esRef.current === es) esRef.current = null;
      };

      es.addEventListener('snapshot', (e) => {
        reset();
        updateLive(cid, JSON.parse((e as MessageEvent).data));
      });
      es.addEventListener('delta', (e) => {
        const d = JSON.parse((e as MessageEvent).data) as { thinking?: string; content?: string };
        pending.thinking += d.thinking ?? '';
        pending.content += d.content ?? '';
        if (!raf) raf = requestAnimationFrame(flush);
      });
      es.addEventListener('done', (e) => {
        finish();
        const { message } = JSON.parse((e as MessageEvent).data) as { message: Message };
        if (idRef.current === cid) {
          updateConv((c) => (c.id === cid ? appendOnce(c, message) : c));
          updateLive(cid, null);
        } else liveCache.delete(cid);
        const cached = convCache.get(cid);
        if (cached) convCache.set(cid, appendOnce(cached, message));
        onChangeRef.current();
      });
      es.addEventListener('idle', () => {
        // Finished while we were away (or before we connected): fetch the final state.
        finish();
        void load(cid);
      });
      // On network errors EventSource reconnects by itself; the server answers
      // with a fresh snapshot (or `idle`), so no extra handling is needed.
    },
    [load, unsubscribe, updateConv, updateLive],
  );
  const subscribeRef = useRef(subscribe);
  subscribeRef.current = subscribe;

  useEffect(() => {
    idRef.current = id;
    setError(null);
    if (!id) {
      setConv(null);
      setLive(null);
      return;
    }
    const cached = convCache.get(id) ?? null;
    setConv(cached);
    setLive(liveCache.get(id) ?? null);
    if (cached?.generating) subscribe(id);
    void load(id);
    return () => unsubscribe();
  }, [id, load, subscribe, unsubscribe]);

  /** Sends a message. Returns the id of a newly created conversation, if any. */
  const send = useCallback(
    async (body: SendBody): Promise<string | null> => {
      setError(null);
      const now = new Date().toISOString();
      if (!id) {
        const created = await api.create(body);
        convCache.set(created.id, created);
        liveCache.set(created.id, emptyLive(body.model, body.think));
        onChangeRef.current();
        return created.id;
      }
      const userMsg: Message = {
        role: 'user',
        content: body.content,
        createdAt: now,
        ...(body.attachments?.length ? { attachments: body.attachments } : {}),
      };
      const before = conv;
      updateConv((c) => ({ ...c, messages: [...c.messages, userMsg], generating: true }));
      updateLive(id, emptyLive(body.model, body.think));
      try {
        const fresh = await api.send(id, body);
        if (idRef.current !== id) return null;
        convCache.set(id, fresh);
        setConv(fresh);
        subscribe(id);
        onChangeRef.current();
      } catch (e) {
        if (before) {
          convCache.set(id, before);
          setConv(before);
        }
        updateLive(id, null);
        throw e;
      }
      return null;
    },
    [id, conv, subscribe, updateConv, updateLive],
  );

  const stop = useCallback(async () => {
    if (id) await api.stop(id).catch(() => {});
  }, [id]);

  return { conv, live, error, loading, send, stop, setError };
}

export function forgetConversation(id: string) {
  convCache.delete(id);
  liveCache.delete(id);
}
