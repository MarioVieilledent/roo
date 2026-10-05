import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { api } from './api';
import { Composer } from './components/Composer';
import { ArrowDownIcon, MenuIcon, PlusIcon } from './components/Icons';
import { AssistantMessage, LiveMessage, UserMessage } from './components/MessageView';
import { ModelPicker } from './components/ModelPicker';
import { Sidebar } from './components/Sidebar';
import { Welcome } from './components/Welcome';
import { forgetConversation, useConversation } from './hooks/useConversation';
import { useConversationRoute } from './hooks/useHashRoute';
import { useStickToBottom } from './hooks/useStickToBottom';
import type { ConversationSummary, OllamaStatus } from './types';

function usePersisted<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage unavailable */
    }
  }, [key, value]);
  return [value, setValue] as const;
}

const isMobile = () => window.matchMedia('(max-width: 860px)').matches;

export default function App() {
  const [id, navigate] = useConversationRoute();
  const [status, setStatus] = useState<OllamaStatus | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [model, setModel] = usePersisted<string | null>('roo.model', null);
  const [think, setThink] = usePersisted('roo.think', false);
  const [collapsed, setCollapsed] = usePersisted('roo.sidebarCollapsed', false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const { scrollRef, contentRef, atBottom, scrollToBottom, scrollToTop } = useStickToBottom();

  const refreshList = useCallback(() => {
    api.conversations().then(setConversations).catch(() => {});
  }, []);

  const refreshStatus = useCallback(async () => {
    setRefreshing(true);
    try {
      const s = await api.status();
      setStatus(s);
      // Keep the chosen model if it still exists; otherwise prefer a loaded one.
      setModel((current) => {
        if (current && s.models.some((m) => m.name === current)) return current;
        return (s.models.find((m) => m.loaded) ?? s.models[0])?.name ?? current;
      });
    } catch {
      setStatus((prev) => ({
        running: false,
        installed: prev?.installed ?? true,
        host: prev?.host ?? 'localhost:11434',
        command: 'ollama list',
        output: 'Could not reach the Roo API server.',
        source: 'none',
        error: 'API server unreachable',
        models: [],
        checkedAt: new Date().toISOString(),
      }));
    } finally {
      setRefreshing(false);
    }
  }, [setModel]);

  // Launch: run `ollama list` (via the API) and fetch the saved conversations.
  useEffect(() => {
    void refreshStatus();
    refreshList();
  }, [refreshStatus, refreshList]);

  // Poll Ollama quickly while it's down so the UI flips as soon as it starts.
  useEffect(() => {
    const t = setInterval(() => void refreshStatus(), status?.running ? 30000 : 4000);
    return () => clearInterval(t);
  }, [status?.running, refreshStatus]);

  // Keep the sidebar's "generating" indicators fresh.
  const anyGenerating = conversations.some((c) => c.generating);
  useEffect(() => {
    if (!anyGenerating) return;
    const t = setInterval(refreshList, 2500);
    return () => clearInterval(t);
  }, [anyGenerating, refreshList]);

  const { conv, live, error, send, stop } = useConversation(id, refreshList);

  // Opening a conversation switches to the model it was using (if available).
  useEffect(() => {
    if (conv?.model && status?.models.some((m) => m.name === conv.model)) setModel(conv.model);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conv?.id]);

  useLayoutEffect(() => {
    if (id) scrollToBottom();
    else scrollToTop();
  }, [id, conv?.id, scrollToBottom, scrollToTop]);

  useEffect(() => {
    document.title = conv?.title ? `${conv.title} · Roo` : 'Roo';
  }, [conv?.title]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const select = (next: string | null) => {
    navigate(next);
    setDrawerOpen(false);
  };

  const handleSend = async (content: string) => {
    if (!model) return false;
    try {
      scrollToBottom();
      const createdId = await send({ content, model, think: think && thinkSupported !== false });
      if (createdId) navigate(createdId);
      return true;
    } catch (e) {
      setToast(e instanceof Error ? e.message : String(e));
      return false;
    }
  };

  const handleDelete = async (cid: string) => {
    try {
      await api.remove(cid);
      forgetConversation(cid);
      if (cid === id) navigate(null);
      refreshList();
    } catch (e) {
      setToast(e instanceof Error ? e.message : String(e));
    }
  };

  const handleRename = async (cid: string, title: string) => {
    await api.rename(cid, title).catch((e) => setToast(e.message));
    refreshList();
  };

  const selected = status?.models.find((m) => m.name === model);
  const thinkSupported = selected ? (selected.capabilities.length ? selected.capabilities.includes('thinking') : null) : null;
  const disabledReason = !status ? 'Connecting…' : !status.running ? 'Ollama is not running' : !model ? 'Choose a model first' : null;
  const generating = !!live || !!conv?.generating;
  const showWelcome = !id;

  return (
    <div className={`app${collapsed ? ' collapsed' : ''}`}>
      <Sidebar
        conversations={conversations}
        currentId={id}
        open={drawerOpen}
        status={status}
        onClose={() => setDrawerOpen(false)}
        onSelect={select}
        onDelete={handleDelete}
        onRename={handleRename}
      />
      <main className="main">
        <div className={`aurora${showWelcome ? ' show' : ''}`} aria-hidden>
          <span />
          <span />
          <span />
        </div>
        <header className="topbar">
          <button
            type="button"
            className="icon-btn"
            aria-label="Toggle sidebar"
            onClick={() => (isMobile() ? setDrawerOpen((o) => !o) : setCollapsed((c) => !c))}
          >
            <MenuIcon />
          </button>
          <ModelPicker status={status} model={model} onChange={setModel} />
          <div className="spacer" />
          {id && (
            <button type="button" className="icon-btn" aria-label="New chat" title="New chat" onClick={() => select(null)}>
              <PlusIcon />
            </button>
          )}
        </header>

        <div className="scroller" ref={scrollRef}>
          <div className="thread" ref={contentRef}>
            {showWelcome ? (
              <Welcome status={status} refreshing={refreshing} onRefresh={refreshStatus} model={model} onSelect={setModel} />
            ) : !conv ? (
              <div className="center-note">{error ?? <span className="loading-lines"><span /><span /><span /></span>}</div>
            ) : (
              <>
                {conv.messages.map((m, i) =>
                  m.role === 'user' ? <UserMessage key={i} message={m} /> : <AssistantMessage key={i} message={m} />,
                )}
                {live && <LiveMessage live={live} />}
              </>
            )}
          </div>
        </div>

        <div className="composer-wrap">
          {!atBottom && !showWelcome && (
            <button type="button" className="to-bottom" onClick={() => scrollToBottom(true)} aria-label="Scroll to bottom">
              <ArrowDownIcon size={18} />
            </button>
          )}
          <Composer
            onSend={handleSend}
            onStop={stop}
            generating={generating}
            think={think}
            onThinkChange={setThink}
            thinkSupported={thinkSupported}
            disabledReason={disabledReason}
            autoFocusKey={id ?? 'new'}
          />
          <p className="disclaimer">Runs locally with Ollama. Models can make mistakes — double-check important info.</p>
        </div>
        {toast && (
          <div className="toast" role="alert" onClick={() => setToast(null)}>
            {toast}
          </div>
        )}
      </main>
    </div>
  );
}
