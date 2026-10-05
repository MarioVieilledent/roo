/**
 * A small LaTeX → MathML converter. Browsers render MathML natively, so math
 * needs no library and no network call. It covers the subset of LaTeX that
 * language models commonly emit: fractions, roots, scripts, big operators,
 * accents, fonts, delimiters, matrices / cases / aligned environments, etc.
 */

type Tok = { k: 'cmd' | 'num' | 'ch' | 'ws'; v: string };

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  const re = /\\([a-zA-Z]+)|\\(.)|(\d+(?:\.\d+)?|\.\d+)|(\s+)|(.)/gsu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (m[1]) out.push({ k: 'cmd', v: m[1] });
    else if (m[2] !== undefined) out.push({ k: 'cmd', v: m[2] });
    else if (m[3]) out.push({ k: 'num', v: m[3] });
    else if (m[4]) out.push({ k: 'ws', v: ' ' });
    else out.push({ k: 'ch', v: m[5] });
  }
  return out;
}

const GREEK: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ϵ', varepsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ',
  vartheta: 'ϑ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', omicron: 'ο', pi: 'π', varpi: 'ϖ',
  rho: 'ρ', varrho: 'ϱ', sigma: 'σ', varsigma: 'ς', tau: 'τ', upsilon: 'υ', phi: 'ϕ', varphi: 'φ', chi: 'χ',
  psi: 'ψ', omega: 'ω', digamma: 'ϝ',
};
const GREEK_UPPER: Record<string, string> = {
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
};
const IDENT: Record<string, string> = {
  infty: '∞', partial: '∂', nabla: '∇', hbar: 'ℏ', ell: 'ℓ', Re: 'ℜ', Im: 'ℑ', aleph: 'ℵ', beth: 'ℶ', emptyset: '∅',
  varnothing: '∅', top: '⊤', bot: '⊥', angle: '∠', triangle: '△', imath: 'ı', jmath: 'ȷ', wp: '℘', degree: '°',
  checkmark: '✓', Box: '□', square: '□', blacksquare: '■', diamond: '◇', clubsuit: '♣', heartsuit: '♡', spadesuit: '♠',
  dagger: '†', ddagger: '‡', S: '§', P: '¶', copyright: '©', complement: '∁', mho: '℧', eth: 'ð', backprime: '‵',
};
const OPS: Record<string, string> = {
  // binary
  pm: '±', mp: '∓', times: '×', div: '÷', cdot: '⋅', ast: '∗', star: '⋆', circ: '∘', bullet: '∙', oplus: '⊕',
  ominus: '⊖', otimes: '⊗', oslash: '⊘', odot: '⊙', cap: '∩', cup: '∪', sqcap: '⊓', sqcup: '⊔', vee: '∨', lor: '∨',
  wedge: '∧', land: '∧', setminus: '∖', smallsetminus: '∖', wr: '≀', uplus: '⊎', amalg: '⨿', dotplus: '∔', ltimes: '⋉', rtimes: '⋊',
  // relations
  leq: '≤', le: '≤', geq: '≥', ge: '≥', leqslant: '⩽', geqslant: '⩾', neq: '≠', ne: '≠', approx: '≈', equiv: '≡',
  sim: '∼', simeq: '≃', cong: '≅', propto: '∝', ll: '≪', gg: '≫', lll: '⋘', ggg: '⋙', prec: '≺', succ: '≻',
  preceq: '⪯', succeq: '⪰', subset: '⊂', supset: '⊃', subseteq: '⊆', supseteq: '⊇', subsetneq: '⊊', supsetneq: '⊋',
  nsubseteq: '⊈', sqsubseteq: '⊑', sqsupseteq: '⊒', in: '∈', notin: '∉', ni: '∋', perp: '⊥', parallel: '∥',
  nparallel: '∦', mid: '∣', nmid: '∤', vdash: '⊢', dashv: '⊣', models: '⊨', doteq: '≐', asymp: '≍', approxeq: '≊',
  lesssim: '≲', gtrsim: '≳', nless: '≮', ngtr: '≯', nleq: '≰', ngeq: '≱', triangleq: '≜', coloneqq: '≔', eqqcolon: '≕',
  coloneq: '≔', bowtie: '⋈', smile: '⌣', frown: '⌢', vDash: '⊨', Vdash: '⊩', nvdash: '⊬',
  // arrows
  to: '→', rightarrow: '→', leftarrow: '←', gets: '←', leftrightarrow: '↔', Rightarrow: '⇒', Leftarrow: '⇐',
  Leftrightarrow: '⇔', implies: '⟹', impliedby: '⟸', iff: '⟺', mapsto: '↦', longmapsto: '⟼',
  longrightarrow: '⟶', longleftarrow: '⟵', longleftrightarrow: '⟷', Longrightarrow: '⟹', Longleftarrow: '⟸',
  Longleftrightarrow: '⟺', uparrow: '↑', downarrow: '↓', updownarrow: '↕', Uparrow: '⇑', Downarrow: '⇓',
  Updownarrow: '⇕', nearrow: '↗', searrow: '↘', swarrow: '↙', nwarrow: '↖', hookrightarrow: '↪',
  hookleftarrow: '↩', rightharpoonup: '⇀', rightharpoondown: '⇁', leftharpoonup: '↼', leftharpoondown: '↽',
  rightleftharpoons: '⇌', leftrightharpoons: '⇋', leadsto: '⇝', rightsquigarrow: '⇝', twoheadrightarrow: '↠',
  circlearrowleft: '↺', circlearrowright: '↻', curvearrowright: '↷', curvearrowleft: '↶', nrightarrow: '↛', nRightarrow: '⇏',
  // logic & misc operators
  forall: '∀', exists: '∃', nexists: '∄', neg: '¬', lnot: '¬', therefore: '∴', because: '∵', colon: ':',
  ldots: '…', dots: '…', cdots: '⋯', vdots: '⋮', ddots: '⋱', dotsc: '…', dotsb: '⋯', dotsm: '⋯', dotsi: '⋯', prime: '′',
  // delimiters
  langle: '⟨', rangle: '⟩', lfloor: '⌊', rfloor: '⌋', lceil: '⌈', rceil: '⌉', lvert: '|', rvert: '|', vert: '|',
  lVert: '‖', rVert: '‖', Vert: '‖', '|': '‖', '{': '{', '}': '}', lbrace: '{', rbrace: '}', lbrack: '[', rbrack: ']',
  backslash: '∖', ulcorner: '⌜', urcorner: '⌝', llcorner: '⌞', lrcorner: '⌟', lgroup: '⟮', rgroup: '⟯',
  // escaped characters
  '%': '%', $: '$', '#': '#', '&': '&', _: '_',
};
const BIG_OPS: Record<string, string> = {
  sum: '∑', prod: '∏', coprod: '∐', int: '∫', iint: '∬', iiint: '∭', oint: '∮', oiint: '∯', bigcup: '⋃', bigcap: '⋂',
  bigvee: '⋁', bigwedge: '⋀', bigoplus: '⨁', bigotimes: '⨂', bigodot: '⨀', bigsqcup: '⨆', biguplus: '⨄',
};
const INTEGRALS = new Set(['int', 'iint', 'iiint', 'oint', 'oiint']);
const FUNCS = new Set([
  'sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh', 'coth', 'sech',
  'csch', 'log', 'ln', 'lg', 'exp', 'deg', 'det', 'dim', 'gcd', 'hom', 'ker', 'arg', 'Pr', 'mod', 'bmod', 'tr', 'rank', 'sgn',
]);
const LIMIT_FUNCS = new Set(['lim', 'liminf', 'limsup', 'max', 'min', 'sup', 'inf', 'argmax', 'argmin']);
const SPACES: Record<string, string> = {
  ',': '0.1667em', thinspace: '0.1667em', ':': '0.2222em', '>': '0.2222em', medspace: '0.2222em', ';': '0.2778em',
  thickspace: '0.2778em', ' ': '0.25em', quad: '1em', qquad: '2em', enspace: '0.5em', '!': '-0.1667em',
  negthinspace: '-0.1667em',
};
const ACCENTS: Record<string, [string, boolean]> = {
  hat: ['^', false], widehat: ['^', true], bar: ['¯', false], overline: ['‾', true], vec: ['→', false],
  overrightarrow: ['→', true], overleftarrow: ['←', true], overleftrightarrow: ['↔', true], dot: ['˙', false],
  ddot: ['¨', false], dddot: ['⃛', false], tilde: ['˜', false], widetilde: ['˜', true], acute: ['´', false],
  grave: ['`', false], breve: ['˘', false], check: ['ˇ', false], mathring: ['˚', false], overbrace: ['⏞', true],
};
const UNDER: Record<string, string> = { underline: '‾', underbrace: '⏟', underleftarrow: '←', underrightarrow: '→' };
const BIG_SIZES: Record<string, number> = { big: 1.2, Big: 1.8, bigg: 2.4, Bigg: 3 };
const IGNORED = new Set([
  'displaystyle', 'textstyle', 'scriptstyle', 'scriptscriptstyle', 'nonumber', 'notag', 'hline', 'hdashline',
  'relax', 'allowbreak', 'nobreak', 'mathstrut', 'strut', 'cr',
]);

// Unicode "Mathematical Alphanumeric Symbols" — MathML Core's way to do fonts.
const FONTS: Record<string, { A: number; a: number; d?: number; ex?: Record<string, string> }> = {
  bf: { A: 0x1d400, a: 0x1d41a, d: 0x1d7ce },
  bi: { A: 0x1d468, a: 0x1d482, d: 0x1d7ce },
  cal: { A: 0x1d49c, a: 0x1d4b6, ex: { B: 'ℬ', E: 'ℰ', F: 'ℱ', H: 'ℋ', I: 'ℐ', L: 'ℒ', M: 'ℳ', R: 'ℛ', e: 'ℯ', g: 'ℊ', o: 'ℴ' } },
  frak: { A: 0x1d504, a: 0x1d51e, ex: { C: 'ℭ', H: 'ℌ', I: 'ℑ', R: 'ℜ', Z: 'ℨ' } },
  bb: { A: 0x1d538, a: 0x1d552, d: 0x1d7d8, ex: { C: 'ℂ', H: 'ℍ', N: 'ℕ', P: 'ℙ', Q: 'ℚ', R: 'ℝ', Z: 'ℤ' } },
  sf: { A: 0x1d5a0, a: 0x1d5ba, d: 0x1d7e2 },
  tt: { A: 0x1d670, a: 0x1d68a, d: 0x1d7f6 },
};
const FONT_CMDS: Record<string, string> = {
  mathbf: 'bf', boldsymbol: 'bi', bm: 'bi', mathbb: 'bb', Bbb: 'bb', mathcal: 'cal', mathscr: 'cal', mathfrak: 'frak',
  mathsf: 'sf', mathtt: 'tt', mathrm: 'rm', mathit: 'it', mathnormal: 'it', rm: 'rm', bf: 'bf', cal: 'cal', it: 'it',
};

function styleChar(ch: string, font: string | null): string {
  const f = font && FONTS[font];
  if (!f) return ch;
  if (f.ex?.[ch]) return f.ex[ch];
  const c = ch.charCodeAt(0);
  if (c >= 65 && c <= 90) return String.fromCodePoint(f.A + c - 65);
  if (c >= 97 && c <= 122) return String.fromCodePoint(f.a + c - 97);
  if (c >= 48 && c <= 57 && f.d) return String.fromCodePoint(f.d + c - 48);
  return ch;
}

const ENV_DELIMS: Record<string, [string, string]> = {
  Bmatrix: ['{', '}'], cases: ['{', ''], dcases: ['{', ''], rcases: ['', '}'],
};
const BORDER_MATRICES: Record<string, string> = { pmatrix: 'mat-p', bmatrix: 'mat-b', vmatrix: 'mat-v', Vmatrix: 'mat-vv' };

interface Item {
  ml: string;
  kind?: 'op' | 'limits' | 'int';
  sub?: string;
  sup?: string;
}

class Parser {
  private pos = 0;
  private font: string | null = null;
  constructor(
    private toks: Tok[],
    private display: boolean,
  ) {}

  private peek(skipWs = true): Tok | undefined {
    if (skipWs) while (this.toks[this.pos]?.k === 'ws') this.pos++;
    return this.toks[this.pos];
  }
  private next(skipWs = true): Tok | undefined {
    const t = this.peek(skipWs);
    if (t) this.pos++;
    return t;
  }
  private isCh(t: Tok | undefined, v: string) {
    return !!t && t.k === 'ch' && t.v === v;
  }
  private isCmd(t: Tok | undefined, v: string) {
    return !!t && t.k === 'cmd' && t.v === v;
  }

  parseAll(): string {
    return this.parseExpr(() => false);
  }

  /** Parses a sequence of atoms (with sub/superscripts) until `stop` matches. */
  parseExpr(stop: (t: Tok) => boolean): string {
    const items: Item[] = [];
    for (;;) {
      const t = this.peek();
      if (!t || stop(t)) break;
      if (this.isCh(t, '^') || this.isCh(t, '_')) {
        this.pos++;
        const arg = this.parseArg();
        if (!items.length) items.push({ ml: '<mrow></mrow>' });
        const last = items[items.length - 1];
        if (t.v === '^') last.sup = (last.sup ?? '') + arg;
        else last.sub = (last.sub ?? '') + arg;
        continue;
      }
      if (this.isCh(t, "'")) {
        let n = 0;
        while (this.isCh(this.toks[this.pos], "'")) (n++, this.pos++);
        if (!items.length) items.push({ ml: '<mrow></mrow>' });
        const last = items[items.length - 1];
        last.sup = '<mo>' + ['′', '″', '‴', '⁗'][Math.min(n, 4) - 1] + '</mo>' + (last.sup ?? '');
        continue;
      }
      if (this.isCmd(t, 'limits') || this.isCmd(t, 'nolimits')) {
        this.pos++;
        const last = items[items.length - 1];
        if (last) last.kind = t.v === 'limits' ? 'limits' : 'int';
        continue;
      }
      const item = this.parseAtom();
      if (item) items.push(item);
    }
    return items.map((it) => this.build(it)).join('');
  }

  private build(it: Item): string {
    const { ml, sub, sup } = it;
    if (!sub && !sup) return ml;
    const under = it.kind === 'limits' || (it.kind === 'op' && this.display);
    if (under) {
      if (sub && sup) return `<munderover>${ml}<mrow>${sub}</mrow><mrow>${sup}</mrow></munderover>`;
      if (sub) return `<munder>${ml}<mrow>${sub}</mrow></munder>`;
      return `<mover>${ml}<mrow>${sup}</mrow></mover>`;
    }
    if (sub && sup) return `<msubsup>${ml}<mrow>${sub}</mrow><mrow>${sup}</mrow></msubsup>`;
    if (sub) return `<msub>${ml}<mrow>${sub}</mrow></msub>`;
    return `<msup>${ml}<mrow>${sup}</mrow></msup>`;
  }

  /** A required argument: a {group} or a single token. */
  private parseArg(): string {
    const t = this.peek();
    if (!t) return '<mrow></mrow>';
    if (this.isCh(t, '{')) {
      this.pos++;
      const inner = this.parseExpr((x) => this.isCh(x, '}'));
      this.next();
      return `<mrow>${inner}</mrow>`;
    }
    // TeX takes a single digit: x^10 is x^1 followed by 0, \frac12 is 1/2.
    if (t.k === 'num' && t.v.length > 1) {
      this.toks[this.pos] = { k: 'num', v: t.v.slice(1) };
      return `<mn>${styleDigits(t.v[0], this.font)}</mn>`;
    }
    const it = this.parseAtom();
    if (!it) return '<mrow></mrow>';
    return this.build(it);
  }

  private parseOptArg(): string | null {
    if (!this.isCh(this.peek(), '[')) return null;
    this.pos++;
    const inner = this.parseExpr((x) => this.isCh(x, ']'));
    this.next();
    return inner;
  }

  /** Raw text of a {group}, for \text and friends. */
  private rawArg(): string {
    const t = this.peek();
    if (!this.isCh(t, '{')) {
      this.pos++;
      return t ? (t.k === 'cmd' ? '\\' + t.v : t.v) : '';
    }
    this.pos++;
    let depth = 0;
    let s = '';
    for (;;) {
      const x = this.toks[this.pos++];
      if (!x) break;
      if (this.isCh(x, '{')) depth++;
      if (this.isCh(x, '}')) {
        if (depth === 0) break;
        depth--;
      }
      s += x.k === 'cmd' ? (/^[a-zA-Z]+$/.test(x.v) ? `\\${x.v} ` : x.v) : x.v;
    }
    return s;
  }

  private delimiter(): string {
    const t = this.next();
    if (!t) return '';
    if (t.k === 'ch') return t.v === '.' ? '' : t.v;
    if (t.k === 'cmd') return OPS[t.v] ?? (t.v === '\\' ? '' : t.v);
    return '';
  }

  private withFont<T>(font: string | null, fn: () => T): T {
    const prev = this.font;
    this.font = font;
    try {
      return fn();
    } finally {
      this.font = prev;
    }
  }

  private mi(ch: string): string {
    if (this.font === 'rm') return `<mi mathvariant="normal">${esc(ch)}</mi>`;
    return `<mi>${esc(styleChar(ch, this.font))}</mi>`;
  }

  private parseAtom(): Item | null {
    const t = this.next();
    if (!t) return null;
    switch (t.k) {
      case 'ws':
        return null;
      case 'num':
        return { ml: `<mn>${styleDigits(t.v, this.font)}</mn>` };
      case 'ch':
        return this.parseChar(t.v);
      case 'cmd':
        return this.parseCommand(t.v);
    }
  }

  private parseChar(c: string): Item | null {
    if (c === '{') {
      const inner = this.parseExpr((x) => this.isCh(x, '}'));
      this.next();
      return { ml: `<mrow>${inner}</mrow>` };
    }
    if (c === '}' || c === '&') return null;
    if (/\p{L}/u.test(c)) return { ml: this.mi(c) };
    if (c === '~') return { ml: '<mspace width="0.333em"></mspace>' };
    if ('()[]'.includes(c)) return { ml: `<mo stretchy="false">${c}</mo>` };
    if (c === '|') return { ml: '<mo stretchy="false">|</mo>' };
    const map: Record<string, string> = { '-': '−', '*': '∗', "'": '′' };
    return { ml: `<mo>${esc(map[c] ?? c)}</mo>` };
  }

  private parseCommand(name: string): Item | null {
    if (name in SPACES) return { ml: `<mspace width="${SPACES[name]}"></mspace>` };
    if (name === '\\') return null; // line break outside of an environment
    if (IGNORED.has(name)) {
      if (name === 'displaystyle') this.display = true;
      return null;
    }
    if (name in GREEK) return { ml: this.font === 'bf' || this.font === 'bi' ? `<mi mathvariant="bold">${GREEK[name]}</mi>` : `<mi>${GREEK[name]}</mi>` };
    if (name in GREEK_UPPER) return { ml: `<mi mathvariant="normal">${GREEK_UPPER[name]}</mi>` };
    if (name in IDENT) return { ml: `<mi mathvariant="normal">${IDENT[name]}</mi>` };
    if (name in BIG_OPS) {
      const int = INTEGRALS.has(name);
      return { ml: `<mo largeop="true" movablelimits="${!int}">${BIG_OPS[name]}</mo>`, kind: int ? 'int' : 'op' };
    }
    if (name in OPS) {
      const v = OPS[name];
      const stretch = '⟨⟩⌊⌋⌈⌉|‖{}'.includes(v) ? ' stretchy="false"' : '';
      return { ml: `<mo${stretch}>${esc(v)}</mo>` };
    }
    if (FUNCS.has(name)) {
      if (name === 'bmod' || name === 'mod') return { ml: '<mspace width="0.5em"></mspace><mi>mod</mi><mspace width="0.5em"></mspace>' };
      return { ml: `<mi>${name}</mi><mo>&#x2061;</mo>` };
    }
    if (LIMIT_FUNCS.has(name)) {
      const label = ({ liminf: 'lim inf', limsup: 'lim sup', argmax: 'arg max', argmin: 'arg min' } as Record<string, string>)[name] ?? name;
      return { ml: `<mi>${label}</mi>`, kind: 'op' };
    }
    if (name in FONT_CMDS) {
      const arg = this.withFont(FONT_CMDS[name], () => this.parseArg());
      return { ml: arg };
    }
    if (name in ACCENTS) {
      const [ch, stretchy] = ACCENTS[name];
      const base = this.parseArg();
      return { ml: `<mover accent="true">${base}<mo stretchy="${stretchy}">${ch}</mo></mover>`, kind: name === 'overbrace' ? 'limits' : undefined };
    }
    if (name in UNDER) {
      const base = this.parseArg();
      return { ml: `<munder accentunder="true">${base}<mo stretchy="true">${UNDER[name]}</mo></munder>`, kind: name === 'underbrace' ? 'limits' : undefined };
    }
    const bigMatch = /^(big|Big|bigg|Bigg)[lmr]?$/.exec(name);
    if (bigMatch) {
      const d = this.delimiter();
      return { ml: fence(d, BIG_SIZES[bigMatch[1]]) };
    }

    switch (name) {
      case 'frac':
      case 'dfrac':
      case 'tfrac':
      case 'cfrac': {
        const num = this.parseArg();
        const den = this.parseArg();
        const frac = `<mfrac>${num}${den}</mfrac>`;
        if (name === 'dfrac' || name === 'cfrac') return { ml: `<mstyle displaystyle="true">${frac}</mstyle>` };
        if (name === 'tfrac') return { ml: `<mstyle displaystyle="false">${frac}</mstyle>` };
        return { ml: frac };
      }
      case 'binom':
      case 'dbinom':
      case 'tbinom': {
        const n = this.parseArg();
        const k = this.parseArg();
        const sc = this.display || name === 'dbinom' ? 2.1 : 1.45;
        return { ml: `<mrow>${fence('(', sc)}<mfrac linethickness="0">${n}${k}</mfrac>${fence(')', sc)}</mrow>` };
      }
      case 'sqrt': {
        const idx = this.parseOptArg();
        const base = this.parseArg();
        return { ml: idx ? `<mroot>${base}<mrow>${idx}</mrow></mroot>` : `<msqrt>${base}</msqrt>` };
      }
      case 'left': {
        const open = this.delimiter();
        const inner = this.parseExpr((x) => this.isCmd(x, 'right'));
        this.next();
        const close = this.delimiter();
        const k = fenceScale(inner, this.display);
        return { ml: `<mrow>${fence(open, k)}${inner}${fence(close, k)}</mrow>` };
      }
      case 'right': // unbalanced \right: drop it with its delimiter
        this.delimiter();
        return null;
      case 'middle': {
        const d = this.delimiter();
        return { ml: `<mo stretchy="true" symmetric="true">${esc(d)}</mo>` };
      }
      case 'text':
      case 'textrm':
      case 'textup':
      case 'textnormal':
      case 'mbox':
      case 'hbox':
      case 'textit':
      case 'textbf':
      case 'texttt':
      case 'textsf':
      case 'emph': {
        const raw = this.rawArg().replace(/\\([a-zA-Z]+) ?/g, (_, c) => GREEK[c] ?? IDENT[c] ?? OPS[c] ?? '').replace(/\\(.)/g, '$1');
        const style = ({ textbf: 'font-weight:bold', textit: 'font-style:italic', emph: 'font-style:italic', texttt: 'font-family:monospace', textsf: 'font-family:sans-serif' } as Record<string, string>)[name];
        return { ml: `<mtext${style ? ` style="${style}"` : ''}>${esc(raw).replace(/^ | $/g, ' ')}</mtext>` };
      }
      case 'operatorname':
      case 'operatornamewithlimits': {
        const star = this.isCh(this.toks[this.pos], '*') ? (this.pos++, true) : false;
        const raw = this.rawArg().replace(/\\,|\\ /g, ' ').trim();
        return { ml: `<mi>${esc(raw)}</mi><mo>&#x2061;</mo>`, kind: star || name === 'operatornamewithlimits' ? 'op' : undefined };
      }
      case 'mathop': {
        return { ml: this.parseArg(), kind: 'op' };
      }
      case 'overset':
      case 'stackrel':
      case 'underset': {
        const top = this.parseArg();
        const base = this.parseArg();
        return { ml: name === 'underset' ? `<munder>${base}${top}</munder>` : `<mover>${base}${top}</mover>` };
      }
      case 'xrightarrow':
      case 'xleftarrow': {
        const below = this.parseOptArg();
        const above = this.parseArg();
        const arrow = `<mo stretchy="true" minsize="2em">${name === 'xrightarrow' ? '→' : '←'}</mo>`;
        return { ml: below ? `<munderover>${arrow}<mrow>${below}</mrow>${above}</munderover>` : `<mover>${arrow}${above}</mover>` };
      }
      case 'boxed':
      case 'fbox':
        return { ml: `<mrow class="boxed">${name === 'fbox' ? `<mtext>${esc(this.rawArg())}</mtext>` : this.parseArg()}</mrow>` };
      case 'color':
      case 'textcolor': {
        const color = this.rawArg().trim();
        const safe = /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]+)$/.test(color) ? color : 'inherit';
        const body = name === 'textcolor' || this.isCh(this.peek(), '{') ? this.parseArg() : this.parseExpr((x) => this.isCh(x, '}'));
        return { ml: `<mrow style="color:${safe}">${body}</mrow>` };
      }
      case 'phantom':
      case 'hphantom':
      case 'vphantom':
        return { ml: `<mphantom>${this.parseArg()}</mphantom>` };
      case 'cancel':
      case 'bcancel':
      case 'xcancel':
      case 'sout':
        return { ml: `<mrow class="cancel">${this.parseArg()}</mrow>` };
      case 'not': {
        const t = this.next();
        const v = t ? (t.k === 'cmd' ? (OPS[t.v] ?? t.v) : t.v) : '';
        const neg: Record<string, string> = { '=': '≠', '∈': '∉', '⊂': '⊄', '⊆': '⊈', '≡': '≢', '∼': '≁', '≤': '≰', '≥': '≱', '<': '≮', '>': '≯' };
        return { ml: `<mo>${esc(neg[v] ?? v + '̸')}</mo>` };
      }
      case 'pmod': {
        const arg = this.parseArg();
        return { ml: `<mspace width="0.5em"></mspace><mo>(</mo><mi>mod</mi><mspace width="0.333em"></mspace>${arg}<mo>)</mo>` };
      }
      case 'tag': {
        const raw = this.rawArg();
        return { ml: `<mspace width="2em"></mspace><mtext>(${esc(raw)})</mtext>` };
      }
      case 'label':
      case 'hspace':
      case 'vspace':
        this.rawArg();
        return null;
      case 'begin':
        return { ml: this.parseEnv(this.rawArg().trim()) };
      case 'end':
        this.rawArg();
        return null;
    }
    return { ml: `<mtext class="merr">\\${esc(name)}</mtext>` };
  }

  private parseEnv(env: string): string {
    const base = env.replace(/\*$/, '');
    let colSpec: string[] | null = null;
    if (base === 'array' || base === 'subarray' || base === 'alignedat') {
      const spec = this.rawArg();
      if (base !== 'alignedat') colSpec = spec.replace(/[^lcr]/g, '').split('');
    }
    const rows: string[][] = [];
    let row: string[] = [];
    const endTok = (x: Tok) => this.isCh(x, '&') || this.isCmd(x, '\\') || this.isCmd(x, 'end');
    for (;;) {
      const cell = this.parseExpr(endTok);
      row.push(cell);
      const t = this.next();
      if (!t || this.isCmd(t, 'end')) {
        this.rawArg();
        break;
      }
      if (this.isCmd(t, '\\')) {
        this.parseOptArg(); // \\[2pt]
        rows.push(row);
        row = [];
      }
    }
    if (row.length > 1 || row[0]?.trim()) rows.push(row);

    const aligned = ['aligned', 'align', 'split', 'alignat', 'alignedat', 'eqnarray', 'flalign'].includes(base);
    const isCases = base === 'cases' || base === 'dcases' || base === 'rcases';
    const alignFor = (c: number) => {
      if (colSpec) return ({ l: 'left', c: 'center', r: 'right' } as const)[colSpec[c] as 'l'] ?? 'center';
      if (aligned) return c % 2 === 0 ? 'right' : 'left';
      if (isCases) return 'left';
      return 'center';
    };
    const tight = aligned ? 'padding-left:0;padding-right:0;' : isCases ? 'padding-left:0;padding-right:1em;' : '';
    const display = aligned || base === 'gathered' || base === 'gather' || base === 'dcases' || base === 'equation';
    const body = rows
      .map(
        (r) =>
          '<mtr>' +
          r
            .map((cell, c) => `<mtd columnalign="${alignFor(c)}" style="text-align:${alignFor(c)};${tight}">${cell}</mtd>`)
            .join('') +
          '</mtr>',
      )
      .join('');
    // Matrix delimiters are drawn with CSS borders: stretchy glyphs need a
    // proper OpenType MATH font, which many systems (notably Linux) lack.
    const cssDelim = base in BORDER_MATRICES;
    const cls = cssDelim ? ` class="mat ${BORDER_MATRICES[base]}"` : '';
    const table = `<mtable${cls}${display ? ' displaystyle="true"' : ''}>${body}</mtable>`;
    if (cssDelim) return table;
    const [open, close] = ENV_DELIMS[base] ?? ['', ''];
    if (!open && !close) return table;
    const k = fenceScale(table, this.display);
    return `<mrow>${fence(open, k)}${table}${fence(close, k)}</mrow>`;
  }
}

/**
 * Stretchy fences only grow when the system has an OpenType MATH font with
 * glyph variants; many don't. Estimate the needed height and scale instead.
 */
function fenceScale(inner: string, display: boolean): number {
  const rows = (inner.match(/<mtr>/g) ?? []).length;
  if (rows > 1) return rows * 1.2;
  if (/<mfrac|<munderover|<mover|<munder/.test(inner)) return display ? 2.1 : 1.45;
  if (/<msubsup|<msqrt|<mroot/.test(inner)) return 1.3;
  return 1;
}

function fence(d: string, scale: number) {
  if (!d) return '';
  const style = scale > 1 ? ` style="transform:scaleY(${scale.toFixed(2)})"` : '';
  return `<mo fence="true" stretchy="false"${style}>${esc(d)}</mo>`;
}

function styleDigits(v: string, font: string | null) {
  return esc(font ? [...v].map((c) => styleChar(c, font)).join('') : v);
}

const cache = new Map<string, string | null>();

/** Converts LaTeX to a MathML string, or null when it cannot be parsed. */
export function latexToMathML(tex: string, display: boolean): string | null {
  const key = (display ? 'D' : 'I') + tex;
  if (cache.has(key)) return cache.get(key)!;
  let result: string | null;
  try {
    let src = tex.trim();
    // Multi-line display math without an environment: treat it as aligned.
    if (display && /\\\\/.test(src) && !/\\begin\s*\{/.test(src)) {
      src = `\\begin{${src.includes('&') ? 'aligned' : 'gathered'}}${src}\\end{${src.includes('&') ? 'aligned' : 'gathered'}}`;
    }
    const body = new Parser(tokenize(src), display).parseAll();
    result =
      `<math${display ? ' display="block"' : ''}><semantics><mrow>${body}</mrow>` +
      `<annotation encoding="application/x-tex">${esc(tex)}</annotation></semantics></math>`;
  } catch {
    result = null;
  }
  if (cache.size > 2000) cache.clear();
  cache.set(key, result);
  return result;
}
