import { useState } from 'react';
import type { ConversationSummary, OllamaStatus } from '../types';
import { CloseIcon, PencilIcon, PlusIcon, Spark, TrashIcon } from './Icons';

interface Props {
  conversations: ConversationSummary[];
  currentId: string | null;
  open: boolean;
  status: OllamaStatus | null;
  onClose: () => void;
  onSelect: (id: string | null) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
}

function groupOf(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = (today.getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86400e3;
  if (diff <= 0) return 'Today';
  if (diff <= 1) return 'Yesterday';
  if (diff <= 7) return 'Previous 7 days';
  if (diff <= 30) return 'Previous 30 days';
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export function Sidebar({ conversations, currentId, open, status, onClose, onSelect, onDelete, onRename }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const groups: { label: string; items: ConversationSummary[] }[] = [];
  for (const c of conversations) {
    const label = groupOf(c.updatedAt);
    const g = groups[groups.length - 1];
    if (g?.label === label) g.items.push(c);
    else groups.push({ label, items: [c] });
  }

  const commit = (id: string) => {
    const t = draft.trim();
    setEditing(null);
    if (t) onRename(id, t);
  };

  return (
    <>
      <div className={`backdrop${open ? ' show' : ''}`} onClick={onClose} />
      <aside className={`sidebar${open ? ' open' : ''}`}>
        <div className="sidebar-head">
          <div className="brand">
            <Spark size={22} />
            <span>Roo</span>
          </div>
          <button type="button" className="icon-btn mobile-only" onClick={onClose} aria-label="Close menu">
            <CloseIcon size={18} />
          </button>
        </div>
        <button type="button" className="new-chat" onClick={() => onSelect(null)}>
          <PlusIcon size={18} />
          <span>New chat</span>
        </button>
        <nav className="conv-list">
          {conversations.length === 0 && <p className="empty">Your conversations will appear here.</p>}
          {groups.map((g) => (
            <div key={g.label} className="conv-group">
              <div className="conv-group-label">{g.label}</div>
              {g.items.map((c) => (
                <div key={c.id} className={`conv-item${c.id === currentId ? ' active' : ''}`}>
                  {editing === c.id ? (
                    <input
                      autoFocus
                      className="conv-rename"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onBlur={() => commit(c.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commit(c.id);
                        if (e.key === 'Escape') setEditing(null);
                      }}
                    />
                  ) : (
                    <button type="button" className="conv-link" onClick={() => onSelect(c.id)} title={c.title}>
                      {c.generating && <span className="conv-live" title="Generating…" />}
                      <span className="conv-title">{c.title}</span>
                    </button>
                  )}
                  {editing !== c.id && (
                    <div className="conv-actions">
                      <button
                        type="button"
                        className="icon-btn small"
                        aria-label="Rename"
                        title="Rename"
                        onClick={() => {
                          setDraft(c.title);
                          setEditing(c.id);
                        }}
                      >
                        <PencilIcon size={15} />
                      </button>
                      <button
                        type="button"
                        className="icon-btn small"
                        aria-label="Delete"
                        title="Delete"
                        onClick={() => {
                          if (confirm(`Delete “${c.title}”?`)) onDelete(c.id);
                        }}
                      >
                        <TrashIcon size={15} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span className={`dot ${status === null ? 'pending' : status.running ? 'ok' : 'down'}`} />
          <span>
            {status === null ? 'Checking Ollama…' : status.running ? `Ollama ${status.version ?? ''}` : 'Ollama offline'}
          </span>
          <span className="host">{status?.host.replace(/^https?:\/\//, '')}</span>
        </div>
      </aside>
    </>
  );
}
