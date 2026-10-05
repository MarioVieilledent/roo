import { memo, useRef, useState } from 'react';
import { copyText } from '../lib/clipboard';
import { Markdown } from '../markdown/Markdown';
import type { LiveReply, Message } from '../types';
import { AlertIcon, CheckIcon, CopyIcon, Spark } from './Icons';
import { ThinkingBox } from './ThinkingBox';

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="icon-btn small"
      title={copied ? 'Copied' : label}
      aria-label={label}
      onClick={async () => {
        if (await copyText(text)) {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }
      }}
    >
      {copied ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
    </button>
  );
}

export const UserMessage = memo(function UserMessage({ message }: { message: Message }) {
  return (
    <div className="msg user">
      <div className="bubble">{message.content}</div>
      <div className="msg-actions">
        <CopyButton text={message.content} label="Copy prompt" />
      </div>
    </div>
  );
});

function formatStats(m: Message) {
  const s = m.stats;
  if (!s?.evalCount || !s.evalDurationMs) return null;
  const tps = s.evalCount / (s.evalDurationMs / 1000);
  return `${s.evalCount} tokens · ${tps.toFixed(1)} tok/s`;
}

export const AssistantMessage = memo(function AssistantMessage({ message }: { message: Message }) {
  const stats = formatStats(message);
  return (
    <div className="msg assistant">
      <div className="avatar">
        <Spark size={22} />
      </div>
      <div className="msg-body">
        {message.thinking && <ThinkingBox text={message.thinking} active={false} durationMs={message.thinkingMs} />}
        {message.content && <Markdown text={message.content} />}
        {message.error && (
          <div className="msg-error">
            <AlertIcon size={18} />
            <span>{message.error}</span>
          </div>
        )}
        <div className="msg-footer">
          {message.content && <CopyButton text={message.content} label="Copy response" />}
          {message.model && <span className="chip">{message.model}</span>}
          {message.stopped && <span className="chip warn">Stopped</span>}
          {stats && <span className="meta">{stats}</span>}
        </div>
      </div>
    </div>
  );
});

export function LiveMessage({ live }: { live: LiveReply }) {
  const thinkingNow = !!live.thinking && !live.content;
  const waiting = !live.thinking && !live.content;
  // Remember when the answer started, to show "Thought for Xs" while streaming.
  const answerStart = useRef<number | null>(null);
  if (live.content && answerStart.current === null) answerStart.current = Date.now();
  const thoughtMs = answerStart.current !== null ? answerStart.current - Date.parse(live.startedAt) : undefined;
  return (
    <div className="msg assistant live">
      <div className="avatar">
        <Spark size={22} spinning />
      </div>
      <div className="msg-body">
        {live.thinking && <ThinkingBox text={live.thinking} active={thinkingNow} startedAt={live.startedAt} durationMs={thoughtMs} />}
        {waiting && (
          <div className="loading-lines" aria-label="Waiting for the model">
            <span />
            <span />
            <span />
          </div>
        )}
        {live.content && <Markdown text={live.content} className="streaming" />}
      </div>
    </div>
  );
}
