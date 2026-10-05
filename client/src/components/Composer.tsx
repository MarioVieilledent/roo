import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BrainIcon, SendIcon, StopIcon } from './Icons';

interface Props {
  onSend: (text: string) => Promise<boolean>;
  onStop: () => void;
  generating: boolean;
  think: boolean;
  onThinkChange: (v: boolean) => void;
  /** null when the selected model's capabilities are unknown. */
  thinkSupported: boolean | null;
  disabledReason: string | null;
  autoFocusKey: string;
}

const isTouch = () => window.matchMedia('(pointer: coarse)').matches;

export function Composer({ onSend, onStop, generating, think, onThinkChange, thinkSupported, disabledReason, autoFocusKey }: Props) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  // Grow with the content up to a max height, then scroll.
  useLayoutEffect(() => {
    const ta = ref.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, window.innerHeight * 0.4)}px`;
  }, [text]);

  useEffect(() => {
    if (!isTouch()) ref.current?.focus();
  }, [autoFocusKey]);

  const canSend = !!text.trim() && !generating && !sending && !disabledReason;

  const submit = async () => {
    if (!canSend) return;
    const value = text;
    setSending(true);
    setText('');
    const ok = await onSend(value).finally(() => setSending(false));
    if (!ok) setText(value);
  };

  const thinkDisabled = thinkSupported === false;
  return (
    <form
      className={`composer${generating ? ' busy' : ''}`}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <textarea
        ref={ref}
        value={text}
        rows={1}
        placeholder={disabledReason ?? 'Ask anything…'}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !isTouch()) {
            e.preventDefault();
            void submit();
          }
        }}
        aria-label="Message"
      />
      <div className="composer-bar">
        <button
          type="button"
          className={`pill toggle${think && !thinkDisabled ? ' on' : ''}`}
          onClick={() => onThinkChange(!think)}
          disabled={thinkDisabled}
          aria-pressed={think && !thinkDisabled}
          title={thinkDisabled ? 'This model does not support thinking' : 'Let the model reason before answering'}
        >
          <BrainIcon size={16} />
          <span>Think</span>
          <span className="switch" aria-hidden />
        </button>
        <div className="spacer" />
        <span className="hint">{isTouch() ? '' : 'Shift + Enter for a new line'}</span>
        {generating ? (
          <button type="button" className="send stop" onClick={onStop} aria-label="Stop generating" title="Stop">
            <StopIcon size={18} />
          </button>
        ) : (
          <button type="submit" className="send" disabled={!canSend} aria-label="Send" title="Send">
            <SendIcon size={18} />
          </button>
        )}
      </div>
    </form>
  );
}
