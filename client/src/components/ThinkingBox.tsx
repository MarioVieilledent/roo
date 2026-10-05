import { useEffect, useState } from 'react';
import { Markdown } from '../markdown/Markdown';
import { BrainIcon, ChevronIcon } from './Icons';

interface Props {
  text: string;
  /** True while the model is still in its thinking phase. */
  active: boolean;
  durationMs?: number;
  startedAt?: string;
}

/**
 * The model's reasoning, shown between the prompt and the answer. It opens by
 * itself while the model thinks and folds away once the answer starts, unless
 * the user toggled it explicitly.
 */
export function ThinkingBox({ text, active, durationMs, startedAt }: Props) {
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const open = userOpen ?? active;
  const elapsed = useElapsed(active ? startedAt : undefined);

  const seconds = durationMs !== undefined ? Math.max(1, Math.round(durationMs / 1000)) : null;
  const label = active ? 'Thinking' : seconds ? `Thought for ${seconds}s` : 'Thoughts';

  return (
    <div className={`think${open ? ' open' : ''}${active ? ' active' : ''}`}>
      <button type="button" className="think-toggle" onClick={() => setUserOpen(!open)} aria-expanded={open}>
        <BrainIcon size={16} />
        <span className={active ? 'shimmer-text' : undefined}>{label}</span>
        {active && elapsed > 0 && <span className="think-time">{elapsed}s</span>}
        <ChevronIcon size={16} className="think-chevron" />
      </button>
      <div className="think-body-wrap">
        <div className="think-body">
          <Markdown text={text || '…'} />
        </div>
      </div>
    </div>
  );
}

function useElapsed(startedAt?: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [startedAt]);
  return startedAt ? Math.max(0, Math.floor((now - Date.parse(startedAt)) / 1000)) : 0;
}
