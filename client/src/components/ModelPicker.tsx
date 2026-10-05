import { useEffect, useRef, useState } from 'react';
import type { ModelInfo, OllamaStatus } from '../types';
import { CheckIcon, ChevronIcon } from './Icons';

export function capabilityChips(m: ModelInfo) {
  return m.capabilities.filter((c) => c !== 'completion' && c !== 'embedding');
}

export function ModelPicker({
  status,
  model,
  onChange,
}: {
  status: OllamaStatus | null;
  model: string | null;
  onChange: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const models = status?.models ?? [];
  const running = status?.running;

  return (
    <div className="model-picker" ref={ref}>
      <button type="button" className="model-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="listbox">
        <span className={`dot ${status === null ? 'pending' : running ? 'ok' : 'down'}`} />
        <span className="model-name">{model ?? (running ? 'Choose a model' : status ? 'Ollama offline' : 'Checking…')}</span>
        <ChevronIcon size={16} />
      </button>
      {open && (
        <div className="model-menu" role="listbox">
          <div className="model-menu-head">
            {running ? `Ollama ${status?.version ?? ''} · ${models.length} model${models.length === 1 ? '' : 's'}` : 'Ollama is not running'}
          </div>
          {models.map((m) => (
            <button
              type="button"
              role="option"
              aria-selected={m.name === model}
              key={m.name}
              className={`model-option${m.name === model ? ' selected' : ''}`}
              onClick={() => {
                onChange(m.name);
                setOpen(false);
              }}
            >
              <div className="model-option-main">
                <span className="model-option-name">{m.name}</span>
                <span className="model-option-meta">
                  {[m.parameterSize, m.quantization, m.size].filter(Boolean).join(' · ')}
                </span>
              </div>
              <div className="model-option-chips">
                {capabilityChips(m).map((c) => (
                  <span key={c} className={`cap cap-${c}`}>
                    {c}
                  </span>
                ))}
              </div>
              {m.name === model && <CheckIcon size={16} className="model-check" />}
            </button>
          ))}
          {running && models.length === 0 && (
            <div className="model-empty">
              No models yet. Try <code>ollama pull qwen3</code>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
