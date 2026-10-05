/**
 * A dependency-free syntax highlighter. Each language is described by keyword
 * lists and a few regex rules; a shared tokenizer turns code into classed
 * spans. Markup-like languages (HTML, CSS, YAML, diff, INI) have their own
 * small tokenizers.
 */

export interface HlToken {
  c: string; // css class suffix ('' = plain)
  v: string;
}

interface Rule {
  re: RegExp; // sticky
  c: string;
  /** Only applies when the previous significant character matches. */
  prev?: RegExp;
}

interface Lang {
  kw?: string;
  lit?: string;
  types?: string;
  builtins?: string;
  line?: string[];
  block?: [string, string][];
  str?: string[];
  triple?: boolean;
  tpl?: boolean;
  ci?: boolean;
  deco?: boolean;
  macro?: boolean;
  pre?: boolean;
  capType?: boolean;
  jsonKeys?: boolean;
  rules?: Rule[];
}

const words = (s?: string) => new Set((s ?? '').split(/\s+/).filter(Boolean));

const JS_KW =
  'break case catch class const continue debugger default delete do else export extends finally for from function if import in instanceof let new of return static super switch this throw try typeof var void while with yield async await as get set';
const JS: Lang = {
  kw: JS_KW,
  lit: 'true false null undefined NaN Infinity',
  builtins: 'console window document Math JSON Promise Array Object String Number Boolean Map Set WeakMap Date RegExp Error Symbol BigInt require module process globalThis fetch setTimeout setInterval',
  line: ['//'],
  block: [['/*', '*/']],
  str: ['"', "'"],
  tpl: true,
  capType: true,
  deco: true,
  rules: [{ re: /\/(?![*/])(?:\\.|\[(?:\\.|[^\]\n])*\]|[^/\\\n])+\/[dgimsuyv]*/y, c: 'str', prev: /^$|[(,=:[!&|?{};+\-*%<>~^]/ }],
};
const TS: Lang = {
  ...JS,
  kw: JS_KW + ' interface type enum implements namespace declare abstract private protected public readonly keyof infer is satisfies override module unique',
  types: 'string number boolean any unknown never object symbol bigint void Record Partial Required Readonly Pick Omit Exclude Extract ReturnType Awaited',
};
const PY: Lang = {
  kw: 'and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case print',
  lit: 'True False None self cls',
  builtins:
    'len range int str float list dict set tuple bool type isinstance enumerate zip map filter sorted sum min max abs open super input any all iter next reversed round format repr hash id vars dir getattr setattr hasattr object Exception ValueError TypeError KeyError IndexError RuntimeError StopIteration',
  line: ['#'],
  str: ['"', "'"],
  triple: true,
  deco: true,
  capType: true,
  rules: [{ re: /[rbfu]{1,2}(?="|')/iy, c: 'kw' }],
};
const C_KW =
  'auto break case const continue default do else enum extern for goto if inline register restrict return signed sizeof static struct switch typedef union unsigned volatile while';
const C: Lang = {
  kw: C_KW,
  types: 'char double float int long short void bool size_t ssize_t int8_t int16_t int32_t int64_t uint8_t uint16_t uint32_t uint64_t FILE',
  lit: 'true false NULL',
  builtins: 'printf scanf malloc free calloc realloc memcpy memset strlen strcpy strcmp fopen fclose fprintf sprintf puts',
  line: ['//'],
  block: [['/*', '*/']],
  str: ['"', "'"],
  pre: true,
};
const CPP: Lang = {
  ...C,
  kw:
    C_KW +
    ' class namespace template typename public private protected virtual override final new delete this throw try catch using operator friend constexpr consteval noexcept explicit mutable static_cast dynamic_cast reinterpret_cast const_cast decltype concept requires co_await co_return co_yield',
  types: C.types + ' string vector map unordered_map set pair unique_ptr shared_ptr optional std auto wchar_t char8_t',
  lit: 'true false nullptr NULL',
  builtins: 'cout cin cerr endl make_unique make_shared move forward',
  capType: true,
};
const JAVA: Lang = {
  kw: 'abstract assert break case catch class continue default do else enum extends final finally for if implements import instanceof interface native new package private protected public return static strictfp super switch synchronized this throw throws transient try volatile while var record sealed permits yield',
  types: 'boolean byte char double float int long short void String Object Integer List Map Set',
  lit: 'true false null',
  line: ['//'],
  block: [['/*', '*/']],
  str: ['"', "'"],
  deco: true,
  capType: true,
};
const CS: Lang = {
  kw: 'abstract as base break case catch checked class const continue default delegate do else enum event explicit extern finally fixed for foreach goto if implicit in interface internal is lock namespace new operator out override params private protected public readonly ref return sealed sizeof stackalloc static struct switch this throw try typeof unchecked unsafe using virtual volatile while async await get set record init yield where var',
  types: 'bool byte char decimal double float int long object sbyte short string uint ulong ushort void dynamic',
  lit: 'true false null',
  line: ['//'],
  block: [['/*', '*/']],
  str: ['"', "'"],
  capType: true,
  pre: true,
  rules: [{ re: /\[[A-Z]\w*(?:\(.*?\))?\]/y, c: 'deco' }],
};
const GO: Lang = {
  kw: 'break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var',
  types: 'bool byte complex64 complex128 error float32 float64 int int8 int16 int32 int64 rune string uint uint8 uint16 uint32 uint64 uintptr any',
  lit: 'true false nil iota',
  builtins: 'append cap close copy delete len make new panic print println recover',
  line: ['//'],
  block: [['/*', '*/']],
  str: ['"', "'", '`'],
  capType: true,
};
const RUST: Lang = {
  kw: 'as async await break const continue crate dyn else enum extern fn for if impl in let loop match mod move mut pub ref return self static struct super trait type unsafe use where while',
  types: 'i8 i16 i32 i64 i128 isize u8 u16 u32 u64 u128 usize f32 f64 bool char str String Vec Option Result Box Self HashMap',
  lit: 'true false None Some Ok Err',
  line: ['//'],
  block: [['/*', '*/']],
  str: ['"'],
  macro: true,
  capType: true,
  rules: [
    { re: /#!?\[[^\]]*\]/y, c: 'deco' },
    { re: /'(?:\\.|[^\\'])'/y, c: 'str' },
    { re: /'[a-z_]\w*/y, c: 'type' },
  ],
};
const PHP: Lang = {
  kw: 'abstract and as break callable case catch class clone const continue declare default do echo else elseif empty enddeclare endfor endforeach endif endswitch endwhile extends final finally fn for foreach function global goto if implements include include_once instanceof insteadof interface isset list match namespace new or print private protected public readonly require require_once return static switch throw trait try unset use var while xor yield',
  lit: 'true false null TRUE FALSE NULL',
  line: ['//', '#'],
  block: [['/*', '*/']],
  str: ['"', "'"],
  capType: true,
  rules: [
    { re: /<\?php|\?>/y, c: 'meta' },
    { re: /\$\w+/y, c: 'var' },
  ],
};
const RUBY: Lang = {
  kw: 'alias and begin break case class def defined do else elsif end ensure for if in module next not or redo rescue retry return self super then undef unless until when while yield require attr_accessor attr_reader puts',
  lit: 'true false nil',
  line: ['#'],
  str: ['"', "'"],
  capType: true,
  rules: [
    { re: /:[a-zA-Z_]\w*[?!]?/y, c: 'lit' },
    { re: /@{1,2}\w+/y, c: 'var' },
  ],
};
const SWIFT: Lang = {
  kw: 'associatedtype class deinit enum extension fileprivate func import init inout internal let open operator private protocol public rethrows static struct subscript typealias var break case continue default defer do else fallthrough for guard if in repeat return switch where while as catch is super self throw throws try async await some any',
  types: 'Int Double Float String Bool Character Array Dictionary Set Optional Void',
  lit: 'true false nil',
  line: ['//'],
  block: [['/*', '*/']],
  str: ['"'],
  deco: true,
  capType: true,
};
const KOTLIN: Lang = {
  kw: 'as break class continue do else for fun if in interface is object package return super this throw try typealias val var when while by catch constructor companion data enum finally import init inner internal lateinit open override private protected public sealed suspend',
  types: 'Int Long Double Float String Boolean Char Unit Any Nothing List Map Set',
  lit: 'true false null',
  line: ['//'],
  block: [['/*', '*/']],
  str: ['"', "'"],
  deco: true,
  capType: true,
};
const LUA: Lang = {
  kw: 'and break do else elseif end for function goto if in local not or repeat return then until while',
  lit: 'true false nil',
  builtins: 'print pairs ipairs require table string math tostring tonumber type setmetatable',
  line: ['--'],
  block: [['--[[', ']]']],
  str: ['"', "'"],
};
const SQL: Lang = {
  kw: 'select from where and or not insert into values update set delete create table drop alter add column index primary key foreign references join inner left right outer full on as group by order having limit offset distinct union all exists in is like between case when then else end with returning default constraint unique check view trigger begin commit rollback transaction asc desc if replace',
  types: 'int integer bigint smallint varchar char text boolean bool date timestamp timestamptz float real double numeric decimal serial uuid json jsonb',
  lit: 'null true false',
  builtins: 'count sum avg min max coalesce now cast lower upper length substring',
  line: ['--', '#'],
  block: [['/*', '*/']],
  str: ["'", '"', '`'],
  ci: true,
};
const BASH: Lang = {
  kw: 'if then else elif fi case esac for while until do done in function return break continue export local readonly declare unset shift exit source alias select time',
  builtins: 'echo printf cd ls cat grep sed awk find xargs mkdir rm cp mv chmod chown curl wget git npm npx node python pip docker kubectl sudo apt brew tar ssh make tee head tail sort uniq wc touch kill ps ollama yarn pnpm',
  lit: 'true false',
  line: ['#'],
  str: ['"', "'"],
  rules: [
    { re: /\$\{[^}\n]*\}|\$\w+|\$[@#?$!*0-9-]/y, c: 'var' },
    { re: /(?<=\s|^)--?[a-zA-Z][\w-]*/y, c: 'attr' },
  ],
};
const PS: Lang = {
  kw: 'begin break catch class continue data do dynamicparam else elseif end exit filter finally for foreach from function if in param process return switch throw trap try until using var while',
  lit: '$true $false $null',
  line: ['#'],
  block: [['<#', '#>']],
  str: ['"', "'"],
  ci: true,
  rules: [
    { re: /\$\w+(?::\w+)?/y, c: 'var' },
    { re: /\b[A-Z][a-z]+-[A-Z]\w+/y, c: 'fn' },
    { re: /-[a-zA-Z]+/y, c: 'attr' },
  ],
};
const JSON_: Lang = { lit: 'true false null', str: ['"'], jsonKeys: true, line: ['//'] };
const DOCKER: Lang = {
  kw: 'from as run cmd label maintainer expose env add copy entrypoint volume user workdir arg onbuild stopsignal healthcheck shell',
  ci: true,
  line: ['#'],
  str: ['"', "'"],
  rules: [{ re: /\$\{[^}\n]*\}|\$\w+/y, c: 'var' }],
};
const R: Lang = {
  kw: 'if else repeat while function for in next break return library require',
  lit: 'TRUE FALSE NULL NA Inf NaN T F',
  line: ['#'],
  str: ['"', "'"],
  rules: [{ re: /<-|->/y, c: 'kw' }],
};

const LANGS: Record<string, Lang | 'html' | 'css' | 'yaml' | 'diff' | 'ini'> = {
  js: JS, javascript: JS, jsx: JS, mjs: JS, cjs: JS, node: JS,
  ts: TS, typescript: TS, tsx: TS, mts: TS,
  py: PY, python: PY, python3: PY, py3: PY,
  c: C, h: C, cpp: CPP, 'c++': CPP, cc: CPP, cxx: CPP, hpp: CPP, arduino: CPP, cuda: CPP,
  java: JAVA, cs: CS, csharp: CS, 'c#': CS, go: GO, golang: GO, rs: RUST, rust: RUST, php: PHP,
  rb: RUBY, ruby: RUBY, swift: SWIFT, kt: KOTLIN, kotlin: KOTLIN, kts: KOTLIN, scala: KOTLIN, dart: JAVA,
  lua: LUA, sql: SQL, mysql: SQL, postgres: SQL, postgresql: SQL, sqlite: SQL, plsql: SQL,
  sh: BASH, bash: BASH, shell: BASH, zsh: BASH, console: BASH, terminal: BASH, shellscript: BASH,
  ps: PS, ps1: PS, powershell: PS, pwsh: PS,
  json: JSON_, jsonc: JSON_, json5: JSON_, dockerfile: DOCKER, docker: DOCKER, r: R,
  html: 'html', xml: 'html', svg: 'html', vue: 'html', svelte: 'html', xhtml: 'html', jsp: 'html',
  css: 'css', scss: 'css', sass: 'css', less: 'css',
  yaml: 'yaml', yml: 'yaml', diff: 'diff', patch: 'diff', ini: 'ini', toml: 'ini', conf: 'ini', properties: 'ini', env: 'ini',
};

export function isHighlightable(lang: string) {
  return lang.toLowerCase() in LANGS;
}

const compiled = new Map<Lang, ReturnType<typeof compile>>();
function compile(l: Lang) {
  const norm = (s: string) => (l.ci ? s.toLowerCase() : s);
  return {
    kw: new Set([...words(l.kw)].map(norm)),
    lit: new Set([...words(l.lit)].map(norm)),
    types: new Set([...words(l.types)].map(norm)),
    builtins: new Set([...words(l.builtins)].map(norm)),
    norm,
  };
}

const NUM_RE = /(?:0[xX][\da-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|(?:\d[\d_]*\.?[\d_]*|\.\d[\d_]*)(?:[eE][+-]?\d+)?)[a-zA-Z]*\b/y;
const IDENT_RE = /[\p{L}_$][\p{L}\p{N}_$]*/uy;
const OP_RE = /[+\-*/%=<>!&|^~?:]+|[.,;]/y;

function push(out: HlToken[], c: string, v: string) {
  if (!v) return;
  const last = out[out.length - 1];
  if (last && last.c === c) last.v += v;
  else out.push({ c, v });
}

function tokenizeGeneric(code: string, l: Lang, out: HlToken[] = []): HlToken[] {
  const sets = compiled.get(l) ?? compiled.set(l, compile(l)).get(l)!;
  let i = 0;
  let lineStart = true;
  let prevSig = ''; // previous significant character, to spot `.prop`
  const n = code.length;
  const tryRe = (re: RegExp) => {
    re.lastIndex = i;
    const m = re.exec(code);
    return m && m.index === i ? m[0] : null;
  };

  outer: while (i < n) {
    const ch = code[i];
    if (ch === '\n') {
      push(out, '', ch);
      i++;
      lineStart = true;
      continue;
    }
    if (ch === ' ' || ch === '\t' || ch === '\r') {
      push(out, '', ch);
      i++;
      continue;
    }
    const atLineStart = lineStart;
    lineStart = false;

    if (l.pre && atLineStart && ch === '#') {
      const end = code.indexOf('\n', i);
      const v = code.slice(i, end === -1 ? n : end);
      push(out, 'meta', v);
      i += v.length;
      continue;
    }
    if (l.block) {
      for (const [open, close] of l.block) {
        if (code.startsWith(open, i)) {
          const end = code.indexOf(close, i + open.length);
          const v = code.slice(i, end === -1 ? n : end + close.length);
          push(out, 'com', v);
          i += v.length;
          continue outer;
        }
      }
    }
    if (l.line) {
      for (const lc of l.line) {
        if (code.startsWith(lc, i)) {
          const end = code.indexOf('\n', i);
          const v = code.slice(i, end === -1 ? n : end);
          push(out, 'com', v);
          i += v.length;
          continue outer;
        }
      }
    }
    if (l.rules) {
      for (const r of l.rules) {
        if (r.prev && !r.prev.test(prevSig)) continue;
        const v = tryRe(r.re);
        if (v) {
          push(out, r.c, v);
          i += v.length;
          prevSig = v[v.length - 1];
          continue outer;
        }
      }
    }
    if (l.triple && (code.startsWith('"""', i) || code.startsWith("'''", i))) {
      const q = code.slice(i, i + 3);
      const end = code.indexOf(q, i + 3);
      const v = code.slice(i, end === -1 ? n : end + 3);
      push(out, 'str', v);
      i += v.length;
      continue;
    }
    if (l.tpl && ch === '`') {
      i = templateString(code, i, l, out);
      continue;
    }
    if (l.str?.includes(ch)) {
      let j = i + 1;
      while (j < n && code[j] !== ch) {
        if (code[j] === '\\') j++;
        else if (code[j] === '\n' && ch !== '`') break;
        j++;
      }
      const v = code.slice(i, Math.min(j + 1, n));
      let c = 'str';
      if (l.jsonKeys) {
        const rest = /^\s*:/.exec(code.slice(i + v.length, i + v.length + 20));
        if (rest) c = 'key';
      }
      push(out, c, v);
      i += v.length;
      prevSig = ch;
      continue;
    }
    if (/\d/.test(ch) || (ch === '.' && /\d/.test(code[i + 1] ?? ''))) {
      const v = tryRe(NUM_RE);
      if (v) {
        push(out, 'num', v);
        i += v.length;
        prevSig = '0';
        continue;
      }
    }
    if (l.deco && ch === '@') {
      const m = /@[\w.]+/y;
      const v = tryRe(m);
      if (v) {
        push(out, 'deco', v);
        i += v.length;
        continue;
      }
    }
    const id = tryRe(IDENT_RE);
    if (id) {
      const key = sets.norm(id);
      const after = code.slice(i + id.length, i + id.length + 2);
      let c = '';
      if (prevSig === '.' && !sets.kw.has(key)) c = /^\s*\(/.test(after) ? 'fn' : 'prop';
      else if (sets.kw.has(key)) c = 'kw';
      else if (sets.lit.has(key)) c = 'lit';
      else if (sets.types.has(key)) c = 'type';
      else if (l.macro && after[0] === '!') c = 'fn';
      else if (/^\s*\(/.test(after)) c = 'fn';
      else if (sets.builtins.has(key)) c = 'builtin';
      else if (l.capType && /^[A-Z][a-z0-9]/.test(id)) c = 'type';
      push(out, c, id);
      i += id.length;
      prevSig = 'a';
      continue;
    }
    const op = tryRe(OP_RE);
    if (op) {
      push(out, op === '.' || op === ',' || op === ';' ? 'punc' : 'op', op);
      i += op.length;
      prevSig = op[op.length - 1];
      continue;
    }
    push(out, 'punc', ch);
    prevSig = ch;
    i++;
  }
  return out;
}

function templateString(code: string, start: number, l: Lang, out: HlToken[]): number {
  let i = start + 1;
  let buf = '`';
  while (i < code.length && code[i] !== '`') {
    if (code[i] === '\\') {
      buf += code.slice(i, i + 2);
      i += 2;
      continue;
    }
    if (code.startsWith('${', i)) {
      push(out, 'str', buf);
      buf = '';
      let depth = 1;
      let j = i + 2;
      while (j < code.length && depth > 0) {
        if (code[j] === '{') depth++;
        else if (code[j] === '}') depth--;
        if (depth > 0) j++;
      }
      push(out, 'interp', '${');
      tokenizeGeneric(code.slice(i + 2, j), l, out);
      if (j < code.length) push(out, 'interp', '}');
      i = j + 1;
      continue;
    }
    buf += code[i++];
  }
  if (i < code.length) buf += '`';
  push(out, 'str', buf);
  return i + 1;
}

function tokenizeHtml(code: string): HlToken[] {
  const out: HlToken[] = [];
  let i = 0;
  const n = code.length;
  while (i < n) {
    if (code.startsWith('<!--', i)) {
      const end = code.indexOf('-->', i);
      const v = code.slice(i, end === -1 ? n : end + 3);
      push(out, 'com', v);
      i += v.length;
      continue;
    }
    if (code.startsWith('<!', i) || code.startsWith('<?', i)) {
      const end = code.indexOf('>', i);
      const v = code.slice(i, end === -1 ? n : end + 1);
      push(out, 'meta', v);
      i += v.length;
      continue;
    }
    const tagM = /^<\/?([a-zA-Z][\w:.-]*)/.exec(code.slice(i, i + 64));
    if (tagM) {
      const tagName = tagM[1].toLowerCase();
      push(out, 'punc', tagM[0][1] === '/' ? '</' : '<');
      push(out, 'tag', tagM[1]);
      i += tagM[0].length;
      // attributes
      while (i < n && code[i] !== '>' && !code.startsWith('/>', i)) {
        const rest = code.slice(i, i + 256);
        let m: RegExpExecArray | null;
        if ((m = /^\s+/.exec(rest))) push(out, '', m[0]);
        else if ((m = /^[^\s=>"'/]+/.exec(rest))) push(out, 'attr', m[0]);
        else if ((m = /^=/.exec(rest))) push(out, 'op', m[0]);
        else if ((m = /^"[^"]*"?|^'[^']*'?/.exec(rest))) push(out, 'str', m[0]);
        else push(out, 'punc', (m = /^./s.exec(rest)!)[0]);
        i += m[0].length;
      }
      if (code.startsWith('/>', i)) {
        push(out, 'punc', '/>');
        i += 2;
      } else if (i < n) {
        push(out, 'punc', '>');
        i++;
        if ((tagName === 'script' || tagName === 'style') && tagM[0][1] !== '/') {
          const close = code.toLowerCase().indexOf(`</${tagName}`, i);
          const inner = code.slice(i, close === -1 ? n : close);
          if (tagName === 'script') tokenizeGeneric(inner, JS, out);
          else out.push(...tokenizeCss(inner));
          i += inner.length;
        }
      }
      continue;
    }
    const ent = /^&[#\w]+;/.exec(code.slice(i, i + 12));
    if (ent) {
      push(out, 'lit', ent[0]);
      i += ent[0].length;
      continue;
    }
    push(out, '', code[i++]);
  }
  return out;
}

function tokenizeCss(code: string): HlToken[] {
  const out: HlToken[] = [];
  let i = 0;
  const n = code.length;
  let depth = 0;
  let parens = 0;
  let inValue = false;
  while (i < n) {
    const rest = code.slice(i, i + 200);
    let m: RegExpExecArray | null;
    if (code.startsWith('/*', i)) {
      const end = code.indexOf('*/', i + 2);
      const v = code.slice(i, end === -1 ? n : end + 2);
      push(out, 'com', v);
      i += v.length;
      continue;
    }
    if (code.startsWith('//', i) && !inValue) {
      const end = code.indexOf('\n', i);
      const v = code.slice(i, end === -1 ? n : end);
      push(out, 'com', v);
      i += v.length;
      continue;
    }
    const ch = code[i];
    if (ch === '"' || ch === "'") {
      m = new RegExp(`^${ch}(?:\\\\.|[^${ch}\\\\\\n])*${ch}?`).exec(rest);
      push(out, 'str', m![0]);
      i += m![0].length;
      continue;
    }
    if (ch === ':' && !inValue && !parens) {
      // `a:hover {` is a selector; `color: red` is a declaration.
      const seg = /^[^;{}]*/.exec(code.slice(i + 1))![0];
      if (depth === 0 || code[i + 1 + seg.length] === '{') {
        m = /^::?[\w-]+/.exec(rest);
        if (m) {
          push(out, 'kw', m[0]);
          i += m[0].length;
          continue;
        }
      }
    }
    if (ch === '{') (depth++, (inValue = false));
    if (ch === '}') (depth = Math.max(0, depth - 1), (inValue = false));
    if (ch === ';') inValue = false;
    if (!inValue && depth === 0 && ch === '(') parens++;
    if (ch === ')' && parens) (parens--, (inValue = false));
    if ('{};:,()>+~[]='.includes(ch)) {
      if (ch === ':' && (depth > 0 || parens)) inValue = true;
      push(out, 'punc', ch);
      i++;
      continue;
    }
    if ((m = /^@[\w-]+/.exec(rest))) {
      push(out, 'kw', m[0]);
      i += m[0].length;
      continue;
    }
    if ((m = /^!important/.exec(rest))) {
      push(out, 'kw', m[0]);
      i += m[0].length;
      continue;
    }
    if (inValue) {
      if ((m = /^#[\da-fA-F]{3,8}\b/.exec(rest)) || (m = /^-?(?:\d+\.?\d*|\.\d+)(?:%|[a-zA-Z]+)?/.exec(rest))) {
        push(out, 'num', m[0]);
        i += m[0].length;
        continue;
      }
      if ((m = /^[\w-]+(?=\()/.exec(rest))) {
        push(out, 'fn', m[0]);
        i += m[0].length;
        continue;
      }
      if ((m = /^\$[\w-]+|^--[\w-]+/.exec(rest))) {
        push(out, 'var', m[0]);
        i += m[0].length;
        continue;
      }
      if ((m = /^[\w-]+/.exec(rest))) {
        push(out, 'lit', m[0]);
        i += m[0].length;
        continue;
      }
    } else if ((parens && (m = /^[\w-]+(?=\s*:)/.exec(rest))) || (depth > 0 && (m = /^(?:--|\$)?[\w-]+(?=\s*:(?![^;{}]*\{))/.exec(rest)))) {
      push(out, m[0].startsWith('--') || m[0].startsWith('$') ? 'var' : 'attr', m[0]);
      i += m[0].length;
      continue;
    } else if ((m = /^[.#][\w-]+/.exec(rest))) {
      push(out, 'type', m[0]);
      i += m[0].length;
      continue;
    } else if ((m = /^::?[\w-]+/.exec(rest))) {
      push(out, 'kw', m[0]);
      i += m[0].length;
      continue;
    } else if ((m = /^[a-zA-Z][\w-]*/.exec(rest))) {
      push(out, 'tag', m[0]);
      i += m[0].length;
      continue;
    }
    push(out, '', ch);
    i++;
  }
  return out;
}

function tokenizeLines(code: string, fn: (line: string, out: HlToken[]) => void): HlToken[] {
  const out: HlToken[] = [];
  code.split('\n').forEach((line, idx) => {
    if (idx) push(out, '', '\n');
    fn(line, out);
  });
  return out;
}

const YAML_SCALAR: Lang = { lit: 'true false null yes no on off True False Null', str: ['"', "'"], line: ['#'] };
function tokenizeYaml(code: string) {
  return tokenizeLines(code, (line, out) => {
    let m: RegExpExecArray | null;
    if (/^\s*#/.test(line)) return push(out, 'com', line);
    if (/^(---|\.\.\.)\s*$/.test(line)) return push(out, 'meta', line);
    if ((m = /^(\s*(?:-\s+)*)([^\s#:'"][^#:]*?|"[^"]*"|'[^']*')(:)(?=\s|$)(.*)$/.exec(line))) {
      push(out, 'punc', m[1]);
      push(out, 'key', m[2]);
      push(out, 'punc', m[3]);
      tokenizeGeneric(m[4], YAML_SCALAR, out);
      return;
    }
    if ((m = /^(\s*-\s)(.*)$/.exec(line))) {
      push(out, 'punc', m[1]);
      tokenizeGeneric(m[2], YAML_SCALAR, out);
      return;
    }
    tokenizeGeneric(line, YAML_SCALAR, out);
  });
}

function tokenizeDiff(code: string) {
  return tokenizeLines(code, (line, out) => {
    if (/^(\+\+\+|---|diff |index )/.test(line)) push(out, 'meta', line);
    else if (line.startsWith('@@')) push(out, 'deco', line);
    else if (line.startsWith('+')) push(out, 'ins', line);
    else if (line.startsWith('-')) push(out, 'del', line);
    else push(out, '', line);
  });
}

const INI_VALUE: Lang = { lit: 'true false yes no on off', str: ['"', "'"] };
function tokenizeIni(code: string) {
  return tokenizeLines(code, (line, out) => {
    let m: RegExpExecArray | null;
    if (/^\s*[#;]/.test(line)) return push(out, 'com', line);
    if ((m = /^(\s*)(\[\[?[^\]]*\]\]?)(.*)$/.exec(line))) {
      push(out, '', m[1]);
      push(out, 'type', m[2]);
      push(out, 'com', m[3]);
      return;
    }
    if ((m = /^(\s*)([\w.\-"' ]+?)(\s*[=:]\s*)(.*)$/.exec(line))) {
      push(out, '', m[1]);
      push(out, 'key', m[2]);
      push(out, 'op', m[3]);
      tokenizeGeneric(m[4], { ...INI_VALUE, line: ['#'] }, out);
      return;
    }
    push(out, '', line);
  });
}

export function highlight(code: string, lang: string): HlToken[] | null {
  const def = LANGS[lang.toLowerCase()];
  if (!def) return null;
  if (def === 'html') return tokenizeHtml(code);
  if (def === 'css') return tokenizeCss(code);
  if (def === 'yaml') return tokenizeYaml(code);
  if (def === 'diff') return tokenizeDiff(code);
  if (def === 'ini') return tokenizeIni(code);
  return tokenizeGeneric(code, def);
}
