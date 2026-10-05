import { memo, useMemo, useState, type ReactNode } from 'react';
import { CheckIcon, CopyIcon } from '../components/Icons';
import { copyText } from '../lib/clipboard';
import { highlight } from './highlight';
import { latexToMathML } from './latex';
import { parseInline, parseMarkdown, type Block, type Inline } from './parser';

export const Markdown = memo(function Markdown({ text, className }: { text: string; className?: string }) {
  const blocks = useMemo(() => parseMarkdown(text), [text]);
  return (
    <div className={`md${className ? ` ${className}` : ''}`}>
      {blocks.map((b, i) => (
        <TopBlock key={i} raw={b.raw} block={b.block} />
      ))}
    </div>
  );
});

/** Re-renders only when the block's source changes (i.e. the last block while streaming). */
const TopBlock = memo(
  function TopBlock({ block }: { raw: string; block: Block }) {
    return <BlockView block={block} />;
  },
  (a, b) => a.raw === b.raw,
);

const ALERT_LABELS: Record<string, string> = {
  note: 'Note',
  tip: 'Tip',
  important: 'Important',
  warning: 'Warning',
  caution: 'Caution',
};

function BlockView({ block, tight = false }: { block: Block; tight?: boolean }): ReactNode {
  switch (block.t) {
    case 'heading': {
      const H = `h${block.level}` as 'h1';
      return (
        <H>
          <InlineText src={block.text} />
        </H>
      );
    }
    case 'para':
      return tight ? <InlineText src={block.text} /> : <p><InlineText src={block.text} /></p>;
    case 'hr':
      return <hr />;
    case 'code':
      if (block.lang === 'math' && block.closed) return <MathBlock tex={block.code} closed />;
      return <CodeBlock lang={block.lang} code={block.code} />;
    case 'math':
      return <MathBlock tex={block.tex} closed={block.closed} />;
    case 'quote':
      return (
        <blockquote className={block.alert ? `alert alert-${block.alert}` : undefined}>
          {block.alert && <div className="alert-title">{ALERT_LABELS[block.alert]}</div>}
          {block.children.map((c, i) => (
            <BlockView key={i} block={c} />
          ))}
        </blockquote>
      );
    case 'list': {
      const items = block.items.map((item, i) => (
        <li key={i} className={item.checked !== null ? 'task' : undefined}>
          {item.checked !== null && <input type="checkbox" checked={item.checked} readOnly tabIndex={-1} />}
          {item.children.map((c, j) => (
            <BlockView key={j} block={c} tight={block.tight} />
          ))}
        </li>
      ));
      return block.ordered ? (
        <ol start={block.start !== 1 ? block.start : undefined}>{items}</ol>
      ) : (
        <ul className={block.items.some((it) => it.checked !== null) ? 'contains-task' : undefined}>{items}</ul>
      );
    }
    case 'table':
      return (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {block.head.map((h, i) => (
                  <th key={i} style={block.align[i] ? { textAlign: block.align[i] } : undefined}>
                    <InlineText src={h} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, i) => (
                    <td key={i} style={block.align[i] ? { textAlign: block.align[i] } : undefined}>
                      <InlineText src={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

function InlineText({ src }: { src: string }) {
  const nodes = useMemo(() => parseInline(src), [src]);
  return <Inlines nodes={nodes} />;
}

function Inlines({ nodes }: { nodes: Inline[] }) {
  return <>{nodes.map((n, i) => renderInline(n, i))}</>;
}

function renderInline(n: Inline, key: number): ReactNode {
  switch (n.t) {
    case 'text':
      return n.v;
    case 'br':
      return <br key={key} />;
    case 'code':
      return <code key={key}>{n.v}</code>;
    case 'math':
      return <MathInline key={key} tex={n.v} display={n.display} />;
    case 'link':
      return (
        <a key={key} href={n.href} title={n.title} target="_blank" rel="noopener noreferrer">
          <Inlines nodes={n.c} />
        </a>
      );
    case 'img':
      return <img key={key} src={n.src} alt={n.alt} title={n.title} loading="lazy" />;
    case 'strong':
    case 'em':
    case 'del':
    case 'u':
    case 'sup':
    case 'sub':
    case 'mark':
    case 'kbd':
    case 'small': {
      const Tag = n.t;
      return (
        <Tag key={key}>
          <Inlines nodes={n.c} />
        </Tag>
      );
    }
  }
}

function MathInline({ tex, display }: { tex: string; display: boolean }) {
  const ml = useMemo(() => latexToMathML(tex, display), [tex, display]);
  if (!ml) return <code className="math-error">{tex}</code>;
  return <span className={display ? 'math-display' : 'math-inline'} dangerouslySetInnerHTML={{ __html: ml }} />;
}

function MathBlock({ tex, closed }: { tex: string; closed: boolean }) {
  const ml = useMemo(() => (closed ? latexToMathML(tex, true) : null), [tex, closed]);
  if (!ml) return <pre className="math-pending">{tex}</pre>;
  return <div className="math-display" dangerouslySetInnerHTML={{ __html: ml }} />;
}

const LANG_NAMES: Record<string, string> = {
  js: 'JavaScript', javascript: 'JavaScript', jsx: 'JSX', ts: 'TypeScript', typescript: 'TypeScript', tsx: 'TSX',
  py: 'Python', python: 'Python', sh: 'Shell', bash: 'Bash', zsh: 'Zsh', shell: 'Shell', console: 'Console',
  cpp: 'C++', 'c++': 'C++', cs: 'C#', csharp: 'C#', rs: 'Rust', go: 'Go', rb: 'Ruby', kt: 'Kotlin', yml: 'YAML',
  yaml: 'YAML', json: 'JSON', html: 'HTML', css: 'CSS', scss: 'SCSS', sql: 'SQL', md: 'Markdown', markdown: 'Markdown',
  ps1: 'PowerShell', powershell: 'PowerShell', dockerfile: 'Dockerfile', toml: 'TOML', ini: 'INI', xml: 'XML',
  php: 'PHP', java: 'Java', c: 'C', swift: 'Swift', kotlin: 'Kotlin', rust: 'Rust', lua: 'Lua', diff: 'Diff', r: 'R',
};

export function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const tokens = useMemo(() => highlight(code, lang), [code, lang]);
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    if (await copyText(code)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }
  };
  return (
    <div className="code-block">
      <div className="code-head">
        <span className="code-lang">{LANG_NAMES[lang] ?? (lang || 'text')}</span>
        <button type="button" className="code-copy" onClick={onCopy} aria-label="Copy code">
          {copied ? <CheckIcon size={15} /> : <CopyIcon size={15} />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre>
        <code>
          {tokens
            ? tokens.map((t, i) =>
                t.c ? (
                  <span key={i} className={`tk-${t.c}`}>
                    {t.v}
                  </span>
                ) : (
                  t.v
                ),
              )
            : code}
        </code>
      </pre>
    </div>
  );
}
