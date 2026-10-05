/**
 * A dependency-free Markdown parser (CommonMark + GFM flavoured), tuned for
 * streamed LLM output: unfinished constructs (an open code fence, a half
 * written table, …) degrade gracefully instead of breaking the layout.
 */

export type Inline =
  | { t: 'text'; v: string }
  | { t: 'strong' | 'em' | 'del' | 'u' | 'sup' | 'sub' | 'mark' | 'kbd' | 'small'; c: Inline[] }
  | { t: 'code'; v: string }
  | { t: 'link'; href: string; title?: string; c: Inline[] }
  | { t: 'img'; src: string; alt: string; title?: string }
  | { t: 'math'; v: string; display: boolean }
  | { t: 'br' };

export type Align = '' | 'left' | 'center' | 'right';

export interface ListItem {
  children: Block[];
  checked: boolean | null;
}

export type Block =
  | { t: 'heading'; level: number; text: string }
  | { t: 'para'; text: string }
  | { t: 'code'; lang: string; code: string; closed: boolean }
  | { t: 'math'; tex: string; closed: boolean }
  | { t: 'hr' }
  | { t: 'quote'; children: Block[]; alert?: string }
  | { t: 'list'; ordered: boolean; start: number; tight: boolean; items: ListItem[] }
  | { t: 'table'; align: Align[]; head: string[]; rows: string[][] };

export interface TopBlock {
  block: Block;
  /** Source text of the block — used to memoize rendering while streaming. */
  raw: string;
}

const FENCE_RE = /^( {0,3})(`{3,}|~{3,})[ \t]*([^\s`]*)[^`]*$/;
const HEADING_RE = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const HR_RE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const QUOTE_RE = /^ {0,3}> ?/;
const LIST_RE = /^( *)([-*+]|\d{1,9}[.)])(?:([ \t]+)(.*)|$)/;
const TABLE_DELIM_RE = /^ {0,3}\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;
const MATH_OPEN_RE = /^ {0,3}(\$\$|\\\[)/;
const SETEXT_RE = /^ {0,3}(=+|-+)[ \t]*$/;
const ALERT_RE = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*$/i;

const indentOf = (l: string) => l.length - l.trimStart().length;
const isBlank = (l: string | undefined) => l === undefined || l.trim() === '';

function expandTabs(line: string) {
  if (!line.includes('\t')) return line;
  let out = '';
  for (const ch of line) out += ch === '\t' ? ' '.repeat(4 - (out.length % 4)) : ch;
  return out;
}

function isTableStart(lines: string[], i: number) {
  const head = lines[i];
  const delim = lines[i + 1];
  if (!head || !delim || !head.includes('|') || !TABLE_DELIM_RE.test(delim)) return false;
  if (!delim.includes('|') && splitRow(head).length > 1) return false;
  return splitRow(head).length === splitRow(delim).length;
}

/** Does this line start a block that interrupts a paragraph? */
function interrupts(line: string): boolean {
  if (HEADING_RE.test(line) || FENCE_RE.test(line) || HR_RE.test(line) || QUOTE_RE.test(line) || MATH_OPEN_RE.test(line)) return true;
  const m = LIST_RE.exec(line);
  if (m && m[4]?.trim()) {
    const ordered = /\d/.test(m[2]);
    return !ordered || parseInt(m[2], 10) === 1;
  }
  return false;
}

export function parseMarkdown(src: string): TopBlock[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n').map(expandTabs);
  return parseLines(lines).map(({ block, start, end }) => ({ block, raw: lines.slice(start, end).join('\n') }));
}

function parseLines(lines: string[]): { block: Block; start: number; end: number }[] {
  const out: { block: Block; start: number; end: number }[] = [];
  const n = lines.length;
  let i = 0;
  const add = (block: Block, start: number, end: number) => {
    out.push({ block, start, end });
    i = end;
  };

  while (i < n) {
    const line = lines[i];
    if (isBlank(line)) {
      i++;
      continue;
    }

    // Fenced code block
    let m = FENCE_RE.exec(line);
    if (m) {
      const indent = m[1].length;
      const fence = m[2];
      const body: string[] = [];
      let j = i + 1;
      let closed = false;
      for (; j < n; j++) {
        const close = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(lines[j]);
        if (close && close[1][0] === fence[0] && close[1].length >= fence.length) {
          closed = true;
          j++;
          break;
        }
        body.push(lines[j].slice(Math.min(indent, indentOf(lines[j]))));
      }
      add({ t: 'code', lang: m[3].toLowerCase(), code: body.join('\n'), closed }, i, j);
      continue;
    }

    // Display math: $$ … $$ or \[ … \]
    m = MATH_OPEN_RE.exec(line);
    if (m) {
      const close = m[1] === '$$' ? '$$' : '\\]';
      const first = line.trim().slice(2);
      const sameLine = first.indexOf(close);
      if (sameLine !== -1) {
        add({ t: 'math', tex: first.slice(0, sameLine), closed: true }, i, i + 1);
        continue;
      }
      const body = [first];
      let j = i + 1;
      let closed = false;
      for (; j < n; j++) {
        const at = lines[j].indexOf(close);
        if (at !== -1) {
          body.push(lines[j].slice(0, at));
          closed = true;
          j++;
          break;
        }
        body.push(lines[j]);
      }
      add({ t: 'math', tex: body.join('\n').trim(), closed }, i, j);
      continue;
    }

    m = HEADING_RE.exec(line);
    if (m) {
      add({ t: 'heading', level: m[1].length, text: (m[2] ?? '').trim() }, i, i + 1);
      continue;
    }

    if (HR_RE.test(line)) {
      add({ t: 'hr' }, i, i + 1);
      continue;
    }

    if (QUOTE_RE.test(line)) {
      const body: string[] = [];
      let j = i;
      for (; j < n; j++) {
        const l = lines[j];
        if (QUOTE_RE.test(l)) body.push(l.replace(QUOTE_RE, ''));
        else if (!isBlank(l) && !isBlank(body[body.length - 1]) && !interrupts(l)) body.push(l); // lazy continuation
        else break;
      }
      let alert: string | undefined;
      const am = ALERT_RE.exec(body[0]?.trim() ?? '');
      if (am) {
        alert = am[1].toLowerCase();
        body.shift();
      }
      add({ t: 'quote', children: parseLines(body).map((b) => b.block), alert }, i, j);
      continue;
    }

    if (LIST_RE.test(line)) {
      const { block, end } = parseList(lines, i);
      add(block, i, end);
      continue;
    }

    if (isTableStart(lines, i)) {
      const head = splitRow(lines[i]);
      const align = splitRow(lines[i + 1]).map((c): Align => {
        const l = c.startsWith(':');
        const r = c.endsWith(':');
        return l && r ? 'center' : r ? 'right' : l ? 'left' : '';
      });
      const rows: string[][] = [];
      let j = i + 2;
      for (; j < n && !isBlank(lines[j]) && lines[j].includes('|'); j++) {
        const cells = splitRow(lines[j]);
        rows.push(head.map((_, k) => cells[k] ?? ''));
      }
      add({ t: 'table', align, head, rows }, i, j);
      continue;
    }

    // Paragraph (possibly a setext heading)
    const body: string[] = [line.trimStart()];
    let j = i + 1;
    let setext = 0;
    for (; j < n; j++) {
      const l = lines[j];
      if (isBlank(l)) break;
      const sm = SETEXT_RE.exec(l);
      if (sm && (sm[1][0] === '=' || body.length)) {
        setext = sm[1][0] === '=' ? 1 : 2;
        j++;
        break;
      }
      if (interrupts(l) || isTableStart(lines, j)) break;
      body.push(l.trimStart());
    }
    const text = body.join('\n');
    add(setext ? { t: 'heading', level: setext, text: text.trim() } : { t: 'para', text: text.trimEnd() }, i, j);
  }
  return out;
}

function parseList(lines: string[], i: number): { block: Block; end: number } {
  const n = lines.length;
  const first = LIST_RE.exec(lines[i])!;
  const ordered = /\d/.test(first[2]);
  const marker = ordered ? first[2].slice(-1) : '*';
  const start = ordered ? parseInt(first[2], 10) : 1;
  const baseIndent = first[1].length;
  const items: ListItem[] = [];
  let tight = true;

  while (i < n) {
    const m = LIST_RE.exec(lines[i]);
    if (!m || HR_RE.test(lines[i])) break;
    const isOrdered = /\d/.test(m[2]);
    if (isOrdered !== ordered || (ordered && m[2].slice(-1) !== marker)) break;
    const indent = m[1].length;
    if (items.length && indent > baseIndent + 1) break;

    let spaces = m[3]?.length ?? 1;
    if (spaces > 4 || !m[4]) spaces = 1;
    const contentOffset = indent + m[2].length + spaces;
    const body: string[] = [m[4] ?? ''];
    let j = i + 1;
    let sawBlank = false;
    for (; j < n; j++) {
      const l = lines[j];
      if (isBlank(l)) {
        body.push('');
        sawBlank = true;
        continue;
      }
      const ind = indentOf(l);
      const lm = LIST_RE.exec(l);
      if (ind >= contentOffset) {
        if (sawBlank && body.some((b) => b.trim())) tight = tight && !!LIST_RE.exec(l.slice(contentOffset));
        body.push(l.slice(contentOffset));
        sawBlank = false;
        continue;
      }
      // Lenient nesting: models often indent sub-lists (and continuation
      // paragraphs) by fewer spaces than CommonMark requires.
      if (ind > indent && !HR_RE.test(l) && (lm || sawBlank)) {
        body.push(l.slice(ind));
        sawBlank = false;
        continue;
      }
      if (sawBlank || lm || interrupts(l)) break;
      body.push(l.trimStart()); // lazy continuation
    }
    while (body.length && isBlank(body[body.length - 1])) body.pop();

    let checked: boolean | null = null;
    const task = /^\[([ xX])\][ \t]+/.exec(body[0]);
    if (task) {
      checked = task[1] !== ' ';
      body[0] = body[0].slice(task[0].length);
    }
    items.push({ children: parseLines(body).map((b) => b.block), checked });

    i = j;
    const next = lines[i] !== undefined ? LIST_RE.exec(lines[i]) : null;
    if (!next) break;
    if (sawBlank) tight = false;
  }
  return { block: { t: 'list', ordered, start, tight, items }, end: i };
}

export function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const cells: string[] = [];
  let cur = '';
  let inCode = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\' && s[i + 1] === '|') {
      cur += '|';
      i++;
    } else if (c === '`') {
      let k = 0;
      while (s[i + k] === '`') k++;
      inCode = inCode === k ? 0 : inCode || k;
      cur += '`'.repeat(k);
      i += k - 1;
    } else if (c === '|' && !inCode) {
      cells.push(cur.trim());
      cur = '';
    } else cur += c;
  }
  cells.push(cur.trim());
  return cells;
}

/* ───────────────────────────── Inline ───────────────────────────── */

interface Delim {
  node: { t: 'text'; v: string };
  ch: string;
  n: number;
  orig: number;
  open: boolean;
  close: boolean;
}

const PUNCT = /[\p{P}\p{S}]/u;
const WS = /\s/;
const ESCAPABLE = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/;
const HTML_TAGS = new Set(['sup', 'sub', 'kbd', 'u', 'ins', 'mark', 'b', 'i', 'em', 'strong', 's', 'del', 'strike', 'small']);
const TAG_TYPE: Record<string, Inline['t']> = {
  b: 'strong', strong: 'strong', i: 'em', em: 'em', s: 'del', del: 'del', strike: 'del', ins: 'u', u: 'u',
  sup: 'sup', sub: 'sub', kbd: 'kbd', mark: 'mark', small: 'small',
};
const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', reg: '®', trade: '™', hellip: '…',
  mdash: '—', ndash: '–', laquo: '«', raquo: '»', times: '×', divide: '÷', deg: '°', plusmn: '±', middot: '·',
  bull: '•', rarr: '→', larr: '←', uarr: '↑', darr: '↓', harr: '↔', euro: '€', pound: '£', yen: '¥', cent: '¢',
  sect: '§', para: '¶', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', check: '✓', ne: '≠', le: '≤', ge: '≥',
};

export function safeUrl(url: string, image = false): string | null {
  const s = url.trim();
  const probe = s.replace(/[\s\x00-\x1f]/g, '').toLowerCase();
  if (/^(javascript|vbscript|file):/.test(probe)) return null;
  if (probe.startsWith('data:')) return image && /^data:image\/(png|gif|jpe?g|webp|avif|svg\+xml)[;,]/.test(probe) ? s : null;
  return s;
}

function findCodeSpanEnd(src: string, i: number, k: number): number {
  let j = i + k;
  while (j < src.length) {
    const at = src.indexOf('`', j);
    if (at === -1) return -1;
    let run = 0;
    while (src[at + run] === '`') run++;
    if (run === k) return at;
    j = at + run;
  }
  return -1;
}

interface LinkParts {
  end: number;
  text: string;
  href: string;
  title?: string;
}

function parseLink(src: string, i: number): LinkParts | null {
  // i points at '['
  let depth = 0;
  let j = i;
  for (; j < src.length; j++) {
    const c = src[j];
    if (c === '\\') {
      j++;
      continue;
    }
    if (c === '`') {
      let k = 0;
      while (src[j + k] === '`') k++;
      const end = findCodeSpanEnd(src, j, k);
      if (end !== -1) j = end + k - 1;
      else j += k - 1;
      continue;
    }
    if (c === '[') depth++;
    else if (c === ']' && --depth === 0) break;
  }
  if (j >= src.length || src[j + 1] !== '(') return null;
  const text = src.slice(i + 1, j);
  let k = j + 2;
  while (src[k] === ' ' || src[k] === '\n') k++;
  let href = '';
  if (src[k] === '<') {
    const close = src.indexOf('>', k);
    if (close === -1) return null;
    href = src.slice(k + 1, close);
    k = close + 1;
  } else {
    let parens = 0;
    const s = k;
    for (; k < src.length; k++) {
      const c = src[k];
      if (c === '\\') {
        k++;
        continue;
      }
      if (/\s/.test(c)) break;
      if (c === '(') parens++;
      else if (c === ')') {
        if (parens === 0) break;
        parens--;
      }
    }
    href = src.slice(s, k);
  }
  while (src[k] === ' ' || src[k] === '\n') k++;
  let title: string | undefined;
  const q = src[k];
  if (q === '"' || q === "'" || q === '(') {
    const closeQ = q === '(' ? ')' : q;
    const close = src.indexOf(closeQ, k + 1);
    if (close === -1) return null;
    title = src.slice(k + 1, close);
    k = close + 1;
    while (src[k] === ' ') k++;
  }
  if (src[k] !== ')') return null;
  return { end: k + 1, text, href: href.replace(/\\([^\w\s])/g, '$1'), title };
}

export function parseInline(src: string): Inline[] {
  const nodes: Inline[] = [];
  const delims: Delim[] = [];
  let text = '';
  const flush = () => {
    if (text) nodes.push({ t: 'text', v: text });
    text = '';
  };
  const n = src.length;
  let i = 0;

  while (i < n) {
    const c = src[i];

    if (c === '\\') {
      const next = src[i + 1];
      if (next === '(' || next === '[') {
        const close = src.indexOf(next === '(' ? '\\)' : '\\]', i + 2);
        if (close !== -1) {
          flush();
          nodes.push({ t: 'math', v: src.slice(i + 2, close), display: next === '[' });
          i = close + 2;
          continue;
        }
      }
      if (next === '\n') {
        flush();
        nodes.push({ t: 'br' });
        i += 2;
        continue;
      }
      if (next && ESCAPABLE.test(next)) {
        text += next;
        i += 2;
        continue;
      }
      text += c;
      i++;
      continue;
    }

    if (c === '`') {
      let k = 0;
      while (src[i + k] === '`') k++;
      const end = findCodeSpanEnd(src, i, k);
      if (end === -1) {
        text += '`'.repeat(k);
        i += k;
        continue;
      }
      let code = src.slice(i + k, end).replace(/\n/g, ' ');
      if (code.length > 2 && code.startsWith(' ') && code.endsWith(' ') && code.trim()) code = code.slice(1, -1);
      flush();
      nodes.push({ t: 'code', v: code });
      i = end + k;
      continue;
    }

    if (c === '$') {
      if (src[i + 1] === '$') {
        const end = src.indexOf('$$', i + 2);
        if (end > i + 2) {
          flush();
          nodes.push({ t: 'math', v: src.slice(i + 2, end), display: true });
          i = end + 2;
          continue;
        }
      } else if (src[i + 1] && !WS.test(src[i + 1])) {
        let j = i + 1;
        let found = -1;
        while ((j = src.indexOf('$', j)) !== -1) {
          if (src[j - 1] === '\\') {
            j++;
            continue;
          }
          if (!WS.test(src[j - 1]) && !/\d/.test(src[j + 1] ?? '') && src[j + 1] !== '$') found = j;
          break;
        }
        if (found > i + 1) {
          flush();
          nodes.push({ t: 'math', v: src.slice(i + 1, found), display: false });
          i = found + 1;
          continue;
        }
      }
      text += c;
      i++;
      continue;
    }

    if (c === '!' && src[i + 1] === '[') {
      const link = parseLink(src, i + 1);
      if (link) {
        const url = safeUrl(link.href, true);
        flush();
        if (url) nodes.push({ t: 'img', src: url, alt: link.text, title: link.title });
        else text += link.text;
        i = link.end;
        continue;
      }
    }

    if (c === '[') {
      const fn = /^\[\^([^\]\s]+)\]/.exec(src.slice(i, i + 40));
      if (fn && src[i + fn[0].length] !== ':') {
        flush();
        nodes.push({ t: 'sup', c: [{ t: 'text', v: `[${fn[1]}]` }] });
        i += fn[0].length;
        continue;
      }
      const link = parseLink(src, i);
      if (link) {
        const url = safeUrl(link.href);
        flush();
        const children = parseInline(link.text);
        if (url) nodes.push({ t: 'link', href: url, title: link.title, c: children });
        else nodes.push(...children);
        i = link.end;
        continue;
      }
    }

    if (c === '<') {
      const rest = src.slice(i, i + 300);
      let m = /^<(https?:\/\/[^\s<>]+|mailto:[^\s<>]+)>/i.exec(rest);
      if (m) {
        flush();
        nodes.push({ t: 'link', href: m[1], c: [{ t: 'text', v: m[1].replace(/^mailto:/i, '') }] });
        i += m[0].length;
        continue;
      }
      if ((m = /^<([^\s<>@]+@[^\s<>@]+\.[a-z]{2,})>/i.exec(rest))) {
        flush();
        nodes.push({ t: 'link', href: `mailto:${m[1]}`, c: [{ t: 'text', v: m[1] }] });
        i += m[0].length;
        continue;
      }
      if ((m = /^<br\s*\/?>/i.exec(rest))) {
        flush();
        nodes.push({ t: 'br' });
        i += m[0].length;
        continue;
      }
      if ((m = /^<([a-z]+)>/i.exec(rest)) && HTML_TAGS.has(m[1].toLowerCase())) {
        const tag = m[1].toLowerCase();
        const closeRe = new RegExp(`</${tag}>`, 'i');
        const after = src.slice(i + m[0].length);
        const close = after.search(closeRe);
        if (close !== -1) {
          flush();
          nodes.push({ t: TAG_TYPE[tag], c: parseInline(after.slice(0, close)) } as Inline);
          i += m[0].length + close + tag.length + 3;
          continue;
        }
      }
    }

    if (c === '&') {
      const m = /^&(#\d{1,7}|#x[\da-f]{1,6}|[a-z]{2,8});/i.exec(src.slice(i, i + 12));
      if (m) {
        const e = m[1];
        const ch =
          e[0] === '#'
            ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))
            : ENTITIES[e.toLowerCase()];
        if (ch) {
          text += ch;
          i += m[0].length;
          continue;
        }
      }
    }

    if ((c === 'h' || c === 'H') && (i === 0 || /[\s(*_~"'>[]/.test(src[i - 1]))) {
      const m = /^https?:\/\/[^\s<>"]+/i.exec(src.slice(i, i + 2048));
      if (m) {
        let url = m[0].replace(/[.,:;!?'"*_~]+$/, '');
        // drop unbalanced closing parentheses
        while (url.endsWith(')') && (url.match(/\)/g)?.length ?? 0) > (url.match(/\(/g)?.length ?? 0)) url = url.slice(0, -1);
        flush();
        nodes.push({ t: 'link', href: url, c: [{ t: 'text', v: url }] });
        i += url.length;
        continue;
      }
    }

    if (c === '*' || c === '_' || c === '~') {
      let k = 0;
      while (src[i + k] === c) k++;
      if (c === '~' && k !== 2) {
        text += c.repeat(k);
        i += k;
        continue;
      }
      const prev = i === 0 ? ' ' : src[i - 1];
      const next = src[i + k] ?? ' ';
      const left = !WS.test(next) && (!PUNCT.test(next) || WS.test(prev) || PUNCT.test(prev));
      const right = !WS.test(prev) && (!PUNCT.test(prev) || WS.test(next) || PUNCT.test(next));
      const open = c === '_' ? left && (!right || PUNCT.test(prev)) : left;
      const close = c === '_' ? right && (!left || PUNCT.test(next)) : right;
      flush();
      const node = { t: 'text' as const, v: c.repeat(k) };
      nodes.push(node);
      if (open || close) delims.push({ node, ch: c, n: k, orig: k, open, close });
      i += k;
      continue;
    }

    if (c === '\n') {
      // Hard break for "two trailing spaces"; soft breaks are also shown as
      // line breaks, which matches how chat UIs present model output.
      text = text.replace(/ +$/, '');
      flush();
      nodes.push({ t: 'br' });
      i++;
      continue;
    }

    text += c;
    i++;
  }
  flush();
  processEmphasis(nodes, delims);
  return nodes;
}

function processEmphasis(nodes: Inline[], delims: Delim[]) {
  let ci = 0;
  while (ci < delims.length) {
    const closer = delims[ci];
    if (!closer.close || closer.n === 0) {
      ci++;
      continue;
    }
    let found = -1;
    for (let oi = ci - 1; oi >= 0; oi--) {
      const o = delims[oi];
      if (o.ch !== closer.ch || !o.open || o.n === 0) continue;
      const ruleOf3 = (o.close || closer.open) && (o.orig + closer.orig) % 3 === 0 && !(o.orig % 3 === 0 && closer.orig % 3 === 0);
      if (ruleOf3) continue;
      found = oi;
      break;
    }
    if (found < 0) {
      ci++;
      continue;
    }
    const opener = delims[found];
    const use = closer.ch === '~' ? 2 : opener.n >= 2 && closer.n >= 2 ? 2 : 1;
    const a = nodes.indexOf(opener.node);
    const b = nodes.indexOf(closer.node);
    const type = closer.ch === '~' ? 'del' : use === 2 ? 'strong' : 'em';
    nodes.splice(a + 1, b - a - 1, { t: type, c: nodes.slice(a + 1, b) });
    opener.n -= use;
    closer.n -= use;
    opener.node.v = opener.node.v.slice(use);
    closer.node.v = closer.node.v.slice(use);
    delims.splice(found + 1, ci - found - 1);
    ci = found + 1;
    if (closer.n === 0) ci++;
  }
}
