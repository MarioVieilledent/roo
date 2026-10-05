import { useState } from 'react';
import type { ModelInfo, OllamaStatus } from '../types';
import { capabilityChips } from './ModelPicker';
import { AlertIcon, CubeIcon, RefreshIcon, TerminalIcon } from './Icons';

interface Props {
  status: OllamaStatus | null;
  refreshing: boolean;
  onRefresh: () => void;
  model: string | null;
  onSelect: (name: string) => void;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function relative(iso?: string, fallback = '') {
  if (!iso) return fallback;
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86400e3);
  if (days < 1) return 'today';
  if (days < 2) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}

export function Welcome({ status, refreshing, onRefresh, model, onSelect }: Props) {
  const [showRaw, setShowRaw] = useState(false);
  const running = status?.running;

  return (
    <div className="welcome">
      <h1 className="hello">
        <span className="gradient-text">{greeting()}</span>
      </h1>
      <p className="hello-sub">{running ? 'Pick a model and ask me anything.' : status ? 'Let’s get Ollama running first.' : 'Looking for Ollama…'}</p>

      <section className="status-card">
        <header className="status-head">
          <div className="status-title">
            <TerminalIcon size={16} />
            <code>{status?.command ?? 'ollama list'}</code>
          </div>
          <span className={`status-pill ${status === null ? 'pending' : running ? 'ok' : 'down'}`}>
            <span className="dot" />
            {status === null ? 'Checking' : running ? `Running${status.version ? ` · v${status.version}` : ''}` : 'Not running'}
          </span>
          <button type="button" className={`icon-btn${refreshing ? ' spin' : ''}`} onClick={onRefresh} title="Run again" aria-label="Refresh status">
            <RefreshIcon size={16} />
          </button>
        </header>

        {status && !running && (
          <div className="status-down">
            <AlertIcon size={18} />
            <div>
              <p>
                {status.installed ? (
                  <>
                    Ollama is installed but the server isn’t reachable at <code>{status.host}</code>. Start it with{' '}
                    <code>ollama serve</code> (or open the Ollama app). I’ll keep checking.
                  </>
                ) : (
                  <>
                    The <code>ollama</code> command was not found. Install it from ollama.com, then run <code>ollama serve</code>.
                  </>
                )}
              </p>
            </div>
          </div>
        )}

        {running && status.models.length === 0 && (
          <div className="status-down">
            <CubeIcon size={18} />
            <p>
              No models installed yet. Pull one, for example <code>ollama pull qwen3</code>, then refresh.
            </p>
          </div>
        )}

        {running && status.models.length > 0 && (
          <div className="model-grid">
            {status.models.map((m) => (
              <ModelCard key={m.name} m={m} selected={m.name === model} onSelect={() => onSelect(m.name)} />
            ))}
          </div>
        )}

        {status && (
          <div className="raw">
            <button type="button" className="link-btn" onClick={() => setShowRaw((v) => !v)}>
              {showRaw ? 'Hide' : 'Show'} raw output
            </button>
            {showRaw && (
              <pre className="terminal">
                <span className="prompt">$ </span>
                {status.command}
                {'\n'}
                {status.output || status.error || '(no output)'}
              </pre>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function ModelCard({ m, selected, onSelect }: { m: ModelInfo; selected: boolean; onSelect: () => void }) {
  const [base, tag] = m.name.split(':');
  return (
    <button type="button" className={`model-card${selected ? ' selected' : ''}`} onClick={onSelect} aria-pressed={selected}>
      <div className="model-card-top">
        <span className="model-card-name">
          {base}
          {tag && <span className="tag">:{tag}</span>}
        </span>
        {m.loaded && <span className="loaded" title="Currently loaded in memory">● loaded</span>}
      </div>
      <dl className="model-card-specs">
        {m.parameterSize && (
          <div>
            <dt>Params</dt>
            <dd>{m.parameterSize}</dd>
          </div>
        )}
        <div>
          <dt>Size</dt>
          <dd>{m.size}</dd>
        </div>
        {m.quantization && (
          <div>
            <dt>Quant</dt>
            <dd>{m.quantization}</dd>
          </div>
        )}
        {m.contextLength && (
          <div>
            <dt>Context</dt>
            <dd>{m.contextLength >= 1024 ? `${Math.round(m.contextLength / 1024)}K` : m.contextLength}</dd>
          </div>
        )}
      </dl>
      <div className="model-card-foot">
        <span className="family">
          {m.family ?? 'unknown'} · {m.modified || relative(m.modifiedAt)}
        </span>
        <span className="caps">
          {capabilityChips(m).map((c) => (
            <span key={c} className={`cap cap-${c}`}>
              {c}
            </span>
          ))}
        </span>
      </div>
      <span className="model-card-id">{m.id}</span>
    </button>
  );
}
