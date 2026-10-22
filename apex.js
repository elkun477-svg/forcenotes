/* ForceNotes Apex Lab: a small Apex compiler + interpreter that runs in the browser.
 * Scope: the Apex language itself (classes, interfaces, enums, generics collections, exceptions,
 * properties, inner classes, switch, etc.). It has no org, so SObjects, SOQL, DML and other
 * metadata references are rejected with a clear message. This is a teaching simulator, not
 * Salesforce's compiler. */
(function (root) {
'use strict';

/* ------------------------------------------------------------------ errors */
class ApexSyntaxError extends Error {
  constructor(msg, line, col) { super(msg); this.line = line || 1; this.col = col || 1; this.apex = true; }
}

/* ------------------------------------------------------------------- lexer */
const OPS = ['>>>=', '===', '!==', '>>>', '<<=', '>>=', '??', '?.', '=>', '&&', '||', '==', '!=', '<=', '>=', '++', '--', '+=', '-=', '*=', '/=', '&=', '|=', '^=', '<<', '>>',
  '+', '-', '*', '/', '%', '=', '<', '>', '!', '~', '&', '|', '^', '?', ':', ';', ',', '.', '(', ')', '{', '}', '[', ']', '@'];

function lex(src) {
  const toks = [];
  let i = 0, line = 1, col = 1;
  const n = src.length;
  function adv(k) { for (let j = 0; j < k; j++) { if (src[i] === '\n') { line++; col = 1; } else col++; i++; } }
  while (i < n) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n') { adv(1); continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') adv(1); continue; }
    if (c === '/' && src[i + 1] === '*') {
      const sl = line, sc = col; adv(2);
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) adv(1);
      if (i >= n) throw new ApexSyntaxError('Unterminated comment', sl, sc);
      adv(2); continue;
    }
    const sl = line, sc = col;
    if (/[A-Za-z_$]/.test(c)) {
      let j = i; while (j < n && /[A-Za-z0-9_$]/.test(src[j])) j++;
      const v = src.slice(i, j); adv(j - i);
      toks.push({ t: 'id', v, lc: v.toLowerCase(), line: sl, col: sc });
      continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
      let j = i; while (j < n && /[0-9]/.test(src[j])) j++;
      let isDec = false;
      if (src[j] === '.' && /[0-9]/.test(src[j + 1] || '')) { isDec = true; j++; while (j < n && /[0-9]/.test(src[j])) j++; }
      else if (src[j] === '.' && !/[A-Za-z_]/.test(src[j + 1] || '')) { /* "1." not supported; leave */ }
      let text = src.slice(i, j), kind = isDec ? 'dec' : 'int';
      if (src[j] === 'L' || src[j] === 'l') { kind = 'long'; j++; }
      else if (src[j] === 'D' || src[j] === 'd') { kind = 'dbl'; j++; }
      adv(j - i);
      toks.push({ t: 'num', v: text, kind, line: sl, col: sc });
      continue;
    }
    if (c === "'") {
      let j = i + 1, out = '';
      while (j < n && src[j] !== "'") {
        if (src[j] === '\n') throw new ApexSyntaxError('Unterminated string literal', sl, sc);
        if (src[j] === '\\') {
          const e = src[j + 1];
          if (e === 'n') out += '\n'; else if (e === 't') out += '\t'; else if (e === 'r') out += '\r';
          else if (e === 'b') out += '\b'; else if (e === 'f') out += '\f';
          else if (e === 'u') { out += String.fromCharCode(parseInt(src.substr(j + 2, 4), 16)); j += 4; }
          else out += e;
          j += 2;
        } else { out += src[j]; j++; }
      }
      if (j >= n) throw new ApexSyntaxError('Unterminated string literal', sl, sc);
      adv(j + 1 - i);
      toks.push({ t: 'str', v: out, line: sl, col: sc });
      continue;
    }
    let matched = null;
    for (const op of OPS) { if (src.startsWith(op, i)) { matched = op; break; } }
    if (!matched) throw new ApexSyntaxError("Unexpected character '" + c + "'", sl, sc);
    adv(matched.length);
    toks.push({ t: 'op', v: matched, line: sl, col: sc });
  }
  toks.push({ t: 'eof', v: '<EOF>', line, col });
  return toks;
}

/* ------------------------------------------------------------------ parser */
const RESERVED = new Set(['class', 'interface', 'enum', 'extends', 'implements', 'if', 'else', 'for', 'while', 'do', 'return', 'break', 'continue',
  'throw', 'try', 'catch', 'finally', 'new', 'this', 'super', 'null', 'true', 'false', 'instanceof', 'switch', 'static', 'final', 'abstract', 'virtual',
  'override', 'public', 'private', 'protected', 'global', 'void', 'transient', 'testmethod', 'webservice']);
const MODIFIERS = new Set(['public', 'private', 'protected', 'global', 'static', 'final', 'abstract', 'virtual', 'override', 'transient', 'testmethod', 'webservice']);
const DML_WORDS = new Set(['insert', 'update', 'delete', 'upsert', 'undelete', 'merge']);

class Parser {
  constructor(src) { this.toks = lex(src); this.p = 0; }
  get tok() { return this.toks[this.p]; }
  peek(k) { return this.toks[Math.min(this.p + (k || 0), this.toks.length - 1)]; }
  err(msg, tk) { tk = tk || this.tok; throw new ApexSyntaxError(msg, tk.line, tk.col); }
  isOp(v, k) { const t = this.peek(k); return t.t === 'op' && t.v === v; }
  isKw(v, k) { const t = this.peek(k); return t.t === 'id' && t.lc === v; }
  eatOp(v) { if (this.isOp(v)) { this.p++; return true; } return false; }
  eatKw(v) { if (this.isKw(v)) { this.p++; return true; } return false; }
  expectOp(v) {
    if (this.isOp(v)) return this.toks[this.p++];
    const t = this.tok;
    this.err("Unexpected token '" + (t.t === 'eof' ? 'end of file' : t.v) + "'. Expected '" + v + "'");
  }
  expectKw(v) { if (this.isKw(v)) return this.toks[this.p++]; this.err("Unexpected token '" + this.tok.v + "'. Expected '" + v + "'"); }
  ident(what) {
    const t = this.tok;
    if (t.t !== 'id' || RESERVED.has(t.lc)) this.err("Unexpected token '" + (t.t === 'eof' ? 'end of file' : t.v) + "'" + (what ? '. Expected ' + what : ''));
    this.p++; return t;
  }

  /* ---- annotations & modifiers */
  skipAnnotations() {
    const found = [];
    while (this.isOp('@')) {
      this.p++; const name = this.ident('annotation name'); found.push(name.lc);
      if (this.isOp('(')) { let depth = 0; do { if (this.isOp('(')) depth++; else if (this.isOp(')')) depth--; else if (this.tok.t === 'eof') this.err('Unterminated annotation'); this.p++; } while (depth > 0); }
    }
    return found;
  }
  parseModifiers() {
    const mods = new Set();
    for (;;) {
      this.skipAnnotations();
      const t = this.tok;
      if (t.t === 'id' && MODIFIERS.has(t.lc)) { mods.add(t.lc); this.p++; continue; }
      if (t.t === 'id' && (t.lc === 'with' || t.lc === 'without' || t.lc === 'inherited') && this.isKw('sharing', 1)) { this.p += 2; continue; }
      break;
    }
    return mods;
  }

  /* ---- types */
  parseType() {
    const t = this.tok;
    if (t.t !== 'id' || (RESERVED.has(t.lc) && t.lc !== 'void')) this.err("Unexpected token '" + (t.t === 'eof' ? 'end of file' : t.v) + "'. Expected a type");
    let name = t.v; this.p++;
    while (this.isOp('.') && this.peek(1).t === 'id' && !RESERVED.has(this.peek(1).lc)) { this.p++; name += '.' + this.tok.v; this.p++; }
    const args = [];
    if (this.isOp('<')) {
      this.p++;
      if (!this.isOp('>')) {
        for (;;) { args.push(this.parseType()); if (this.eatOp(',')) continue; break; }
      }
      this.expectGT();
    }
    let dims = 0;
    while (this.isOp('[') && this.isOp(']', 1)) { this.p += 2; dims++; }
    return { name, lc: name.toLowerCase(), args, dims, line: t.line, col: t.col };
  }
  expectGT() {
    const t = this.tok;
    if (t.t === 'op' && t.v === '>') { this.p++; return; }
    if (t.t === 'op' && (t.v === '>>' || t.v === '>>>' || t.v === '>=' || t.v === '>>=')) {
      const rest = t.v.slice(1);
      this.toks.splice(this.p, 1, { t: 'op', v: '>', line: t.line, col: t.col }, { t: 'op', v: rest, line: t.line, col: t.col + 1 });
      this.p++; return;
    }
    this.err("Unexpected token '" + t.v + "'. Expected '>'");
  }
  tryParse(fn) {
    const save = this.p, saveLen = this.toks.length;
    try { return fn(); } catch (e) { if (e && e.apex) { this.p = save; return null; } throw e; }
  }

  /* ---- compilation unit */
  parseUnit() {
    const types = [], anon = [];
    while (this.tok.t !== 'eof') {
      const save = this.p;
      const mods = this.parseModifiers();
      if (this.isKw('class') || this.isKw('interface') || this.isKw('enum')) { types.push(this.parseTypeDecl(mods, null)); continue; }
      this.p = save;
      anon.push(this.parseStatement());
    }
    return { types, anon };
  }
  parseTypeDecl(mods, outer) {
    const kwTok = this.tok;
    const kind = kwTok.lc; this.p++;
    const nameTok = this.ident('a name');
    const decl = { k: 'type', kind, name: nameTok.v, lc: nameTok.lc, mods, ext: null, impl: [], members: [], fields: [], props: [], methods: [], ctors: [], inits: [], inner: [], enumVals: [], outer, line: nameTok.line, col: nameTok.col };
    if (kind === 'enum') {
      this.expectOp('{');
      while (!this.isOp('}')) {
        decl.enumVals.push(this.ident('an enum value').v);
        if (!this.eatOp(',')) break;
      }
      this.expectOp('}');
      return decl;
    }
    if (kind === 'interface') {
      if (this.eatKw('extends')) { for (;;) { decl.impl.push(this.parseType()); if (!this.eatOp(',')) break; } }
    } else {
      if (this.eatKw('extends')) decl.ext = this.parseType();
      if (this.eatKw('implements')) { for (;;) { decl.impl.push(this.parseType()); if (!this.eatOp(',')) break; } }
    }
    this.expectOp('{');
    while (!this.isOp('}')) {
      if (this.tok.t === 'eof') this.err("Unexpected end of file. Expected '}' to close class " + decl.name);
      this.parseMember(decl);
    }
    this.expectOp('}');
    return decl;
  }
  parseMember(decl) {
    const mods = this.parseModifiers();
    if (this.isKw('class') || this.isKw('interface') || this.isKw('enum')) { decl.inner.push(this.parseTypeDecl(mods, decl)); return; }
    if (this.isOp('{')) { const body = this.parseBlock(); decl.inits.push({ body, static: mods.has('static') }); return; }
    const first = this.tok;
    // constructor
    if (first.t === 'id' && first.lc === decl.lc && this.isOp('(', 1) && decl.kind === 'class') {
      this.p++;
      const params = this.parseParams();
      const body = this.parseBlock();
      decl.ctors.push({ params, body, mods, line: first.line, col: first.col });
      return;
    }
    const type = this.parseType();
    const nameTok = this.ident('a member name');
    if (this.isOp('(')) {
      const params = this.parseParams();
      let body = null;
      if (this.isOp('{')) body = this.parseBlock(); else this.expectOp(';');
      decl.methods.push({ name: nameTok.v, lc: nameTok.lc, ret: type, params, body, mods, line: nameTok.line, col: nameTok.col, owner: decl });
      return;
    }
    if (this.isOp('{')) { // property
      this.p++;
      const prop = { name: nameTok.v, lc: nameTok.lc, type, mods, get: null, set: null, hasGet: false, hasSet: false, line: nameTok.line, col: nameTok.col };
      while (!this.isOp('}')) {
        this.parseModifiers();
        const acc = this.ident('get or set');
        if (acc.lc !== 'get' && acc.lc !== 'set') this.err("Unexpected token '" + acc.v + "'. Expected 'get' or 'set'", acc);
        let body = null;
        if (this.isOp('{')) body = this.parseBlock(); else this.expectOp(';');
        if (acc.lc === 'get') { prop.hasGet = true; prop.get = body; } else { prop.hasSet = true; prop.set = body; }
      }
      this.expectOp('}');
      decl.props.push(prop);
      return;
    }
    // field(s)
    let nameT = nameTok;
    for (;;) {
      let init = null;
      if (this.eatOp('=')) init = this.parseExpr();
      decl.fields.push({ name: nameT.v, lc: nameT.lc, type, init, mods, line: nameT.line, col: nameT.col });
      if (this.eatOp(',')) { nameT = this.ident('a field name'); continue; }
      break;
    }
    this.expectOp(';');
  }
  parseParams() {
    this.expectOp('(');
    const params = [];
    if (!this.isOp(')')) {
      for (;;) {
        this.parseModifiers();
        const type = this.parseType();
        const n = this.ident('a parameter name');
        params.push({ type, name: n.v, lc: n.lc });
        if (this.eatOp(',')) continue; break;
      }
    }
    this.expectOp(')');
    return params;
  }

  /* ---- statements */
  parseBlock() {
    const open = this.expectOp('{');
    const body = [];
    while (!this.isOp('}')) {
      if (this.tok.t === 'eof') this.err("Unexpected end of file. Expected '}' to close the block opened at line " + open.line);
      body.push(this.parseStatement());
    }
    this.expectOp('}');
    return { k: 'block', body, line: open.line, col: open.col };
  }
  isDeclStart() {
    // try: Type identifier (= | ; | , | :)
    const save = this.p;
    const t = this.tok;
    if (t.t !== 'id' || (RESERVED.has(t.lc) && t.lc !== 'void')) return false;
    let ok = false;
    try {
      this.parseType();
      const n = this.tok;
      if (n.t === 'id' && !RESERVED.has(n.lc)) {
        const a = this.peek(1);
        ok = a.t === 'op' && (a.v === '=' || a.v === ';' || a.v === ',' || a.v === ':');
      }
    } catch (e) { if (!(e && e.apex)) throw e; ok = false; }
    this.p = save;
    return ok;
  }
  parseStatement() {
    const t = this.tok;
    if (t.t === 'op') {
      if (t.v === '{') return this.parseBlock();
      if (t.v === ';') { this.p++; return { k: 'empty', line: t.line, col: t.col }; }
      if (t.v === '@') { this.skipAnnotations(); return this.parseStatement(); }
      if (t.v === '[') this.soqlError(t);
    }
    if (t.t === 'id') {
      switch (t.lc) {
        case 'if': return this.parseIf();
        case 'for': return this.parseFor();
        case 'while': { this.p++; this.expectOp('('); const cond = this.parseExpr(); this.expectOp(')'); const body = this.parseStatement(); return { k: 'while', cond, body, line: t.line, col: t.col }; }
        case 'do': { this.p++; const body = this.parseStatement(); this.expectKw('while'); this.expectOp('('); const cond = this.parseExpr(); this.expectOp(')'); this.expectOp(';'); return { k: 'dowhile', cond, body, line: t.line, col: t.col }; }
        case 'return': { this.p++; let e = null; if (!this.isOp(';')) e = this.parseExpr(); this.expectOp(';'); return { k: 'return', e, line: t.line, col: t.col }; }
        case 'break': this.p++; this.expectOp(';'); return { k: 'break', line: t.line, col: t.col };
        case 'continue': this.p++; this.expectOp(';'); return { k: 'continue', line: t.line, col: t.col };
        case 'throw': { this.p++; const e = this.parseExpr(); this.expectOp(';'); return { k: 'throw', e, line: t.line, col: t.col }; }
        case 'try': return this.parseTry();
        case 'switch': return this.parseSwitch();
        case 'final': { this.p++; return this.parseStatement(); }
        default: break;
      }
      if (DML_WORDS.has(t.lc)) {
        const nx = this.peek(1);
        const looksCall = nx.t === 'op' && (nx.v === '(' || nx.v === '=' || nx.v === '.' || nx.v === '++' || nx.v === '--');
        if (!looksCall && nx.t !== 'op') throw new ApexSyntaxError("DML statements ('" + t.v + "') aren't available in the playground: there is no org or database. Use collections such as List and Map to hold your data.", t.line, t.col);
      }
      if (this.isDeclStart()) return this.parseLocalDecl();
    }
    const e = this.parseExpr();
    this.expectOp(';');
    return { k: 'expr', e, line: t.line, col: t.col };
  }
  soqlError(t) {
    throw new ApexSyntaxError('SOQL/SOSL queries ([...]) aren\'t available in the playground: there is no org or database. Use collections such as List and Map to hold your data.', t.line, t.col);
  }
  parseLocalDecl() {
    const type = this.parseType();
    const decls = [];
    for (;;) {
      const n = this.ident('a variable name');
      let init = null;
      if (this.eatOp('=')) init = this.parseExpr();
      decls.push({ name: n.v, lc: n.lc, init, line: n.line, col: n.col });
      if (this.eatOp(',')) continue; break;
    }
    this.expectOp(';');
    return { k: 'local', type, decls, line: type.line, col: type.col };
  }
  parseIf() {
    const t = this.tok; this.p++;
    this.expectOp('('); const cond = this.parseExpr(); this.expectOp(')');
    const then = this.parseStatement();
    let els = null;
    if (this.eatKw('else')) els = this.parseStatement();
    return { k: 'if', cond, then, els, line: t.line, col: t.col };
  }
  parseFor() {
    const t = this.tok; this.p++;
    this.expectOp('(');
    // for-each?
    const save = this.p;
    if (this.tok.t === 'id') {
      let each = null;
      try {
        const type = this.parseType();
        const n = this.tok;
        if (n.t === 'id' && !RESERVED.has(n.lc) && this.isOp(':', 1)) { this.p += 2; each = { type, name: n.v, lc: n.lc }; }
      } catch (e) { if (!(e && e.apex)) throw e; }
      if (each) {
        const iter = this.parseExpr(); this.expectOp(')');
        const body = this.parseStatement();
        return { k: 'foreach', type: each.type, name: each.name, lc: each.lc, iter, body, line: t.line, col: t.col };
      }
      this.p = save;
    }
    let init = null;
    if (!this.isOp(';')) {
      if (this.isDeclStart()) {
        const type = this.parseType(); const decls = [];
        for (;;) { const n = this.ident('a variable name'); let i2 = null; if (this.eatOp('=')) i2 = this.parseExpr(); decls.push({ name: n.v, lc: n.lc, init: i2, line: n.line, col: n.col }); if (this.eatOp(',')) continue; break; }
        init = [{ k: 'local', type, decls, line: type.line, col: type.col }];
      } else {
        init = [];
        for (;;) { const e = this.parseExpr(); init.push({ k: 'expr', e, line: e.line, col: e.col }); if (this.eatOp(',')) continue; break; }
      }
    }
    this.expectOp(';');
    const cond = this.isOp(';') ? null : this.parseExpr();
    this.expectOp(';');
    const update = [];
    if (!this.isOp(')')) { for (;;) { update.push(this.parseExpr()); if (this.eatOp(',')) continue; break; } }
    this.expectOp(')');
    const body = this.parseStatement();
    return { k: 'for', init, cond, update, body, line: t.line, col: t.col };
  }
  parseTry() {
    const t = this.tok; this.p++;
    const body = this.parseBlock();
    const catches = [];
    let fin = null;
    while (this.isKw('catch')) {
      const ct = this.tok; this.p++;
      this.expectOp('(');
      const type = this.parseType();
      const n = this.ident('a variable name');
      this.expectOp(')');
      const blk = this.parseBlock();
      catches.push({ type, name: n.v, lc: n.lc, body: blk, line: ct.line, col: ct.col });
    }
    if (this.eatKw('finally')) fin = this.parseBlock();
    if (!catches.length && !fin) this.err("Unexpected token '" + this.tok.v + "'. A try block needs a catch or finally block", this.tok);
    return { k: 'try', body, catches, fin, line: t.line, col: t.col };
  }
  parseSwitch() {
    const t = this.tok; this.p++;
    this.expectKw('on');
    const subject = this.parseExpr();
    this.expectOp('{');
    const whens = [];
    while (!this.isOp('}')) {
      const w = this.tok;
      this.expectKw('when');
      if (this.isKw('else')) {
        this.p++; const body = this.parseBlock();
        whens.push({ kind: 'else', body, line: w.line, col: w.col });
        continue;
      }
      // type match: when Type name {
      const save = this.p;
      let typeMatch = null;
      if (this.tok.t === 'id') {
        try {
          const type = this.parseType();
          const n = this.tok;
          if (n.t === 'id' && !RESERVED.has(n.lc) && this.isOp('{', 1)) { this.p++; typeMatch = { type, name: n.v, lc: n.lc }; }
        } catch (e) { if (!(e && e.apex)) throw e; }
        if (!typeMatch) this.p = save;
      }
      if (typeMatch) {
        const body = this.parseBlock();
        whens.push({ kind: 'type', type: typeMatch.type, name: typeMatch.name, lc: typeMatch.lc, body, line: w.line, col: w.col });
        continue;
      }
      const values = [];
      for (;;) { values.push(this.parseTernary()); if (this.eatOp(',')) continue; break; }
      const body = this.parseBlock();
      whens.push({ kind: 'values', values, body, line: w.line, col: w.col });
    }
    this.expectOp('}');
    return { k: 'switch', subject, whens, line: t.line, col: t.col };
  }

  /* ---- expressions */
  parseExpr() { return this.parseAssign(); }
  parseAssign() {
    const left = this.parseTernary();
    const t = this.tok;
    if (t.t === 'op' && ['=', '+=', '-=', '*=', '/=', '&=', '|=', '^=', '<<=', '>>=', '>>>='].includes(t.v)) {
      this.p++;
      const right = this.parseAssign();
      if (!['id', 'member', 'index'].includes(left.k)) throw new ApexSyntaxError('Expression cannot be assigned', left.line, left.col);
      return { k: 'assign', op: t.v, target: left, value: right, line: t.line, col: t.col };
    }
    return left;
  }
  parseTernary() {
    const cond = this.parseCoalesce();
    if (this.isOp('?')) {
      const t = this.tok; this.p++;
      const a = this.parseAssign(); this.expectOp(':'); const b = this.parseAssign();
      return { k: 'ternary', cond, a, b, line: t.line, col: t.col };
    }
    return cond;
  }
  parseCoalesce() {
    let left = this.parseBin(0);
    while (this.isOp('??')) { const t = this.tok; this.p++; const right = this.parseBin(0); left = { k: 'coalesce', left, right, line: t.line, col: t.col }; }
    return left;
  }
  parseBin(level) {
    const LEVELS = [['||'], ['&&'], ['|'], ['^'], ['&'], ['==', '!=', '===', '!=='], ['<', '>', '<=', '>=', 'instanceof'], ['<<', '>>', '>>>'], ['+', '-'], ['*', '/', '%']];
    if (level >= LEVELS.length) return this.parseUnary();
    let left = this.parseBin(level + 1);
    for (;;) {
      const t = this.tok;
      const ops = LEVELS[level];
      if (t.t === 'op' && ops.includes(t.v)) {
        this.p++;
        const right = this.parseBin(level + 1);
        left = { k: 'bin', op: t.v, left, right, line: t.line, col: t.col };
      } else if (t.t === 'id' && t.lc === 'instanceof' && ops.includes('instanceof')) {
        this.p++;
        const type = this.parseType();
        left = { k: 'instanceof', e: left, type, line: t.line, col: t.col };
      } else break;
    }
    return left;
  }
  isCastAhead() {
    // at '(' : ( Type ) followed by an operand start
    const save = this.p;
    let ok = false;
    try {
      this.p++;
      const first = this.tok;
      if (first.t === 'id' && !RESERVED.has(first.lc)) {
        this.parseType();
        if (this.isOp(')')) {
          const nx = this.peek(1);
          const startsOperand = nx.t === 'str' || nx.t === 'num' ||
            (nx.t === 'id' && !['instanceof'].includes(nx.lc)) || (nx.t === 'op' && (nx.v === '(' || nx.v === '!' || nx.v === '~'));
          const typeLooksRight = /^[A-Z]/.test(first.v) || ['integer', 'string', 'decimal', 'double', 'long', 'boolean', 'object', 'date', 'datetime', 'id'].includes(first.lc);
          ok = startsOperand && typeLooksRight;
        }
      }
    } catch (e) { if (!(e && e.apex)) throw e; ok = false; }
    this.p = save;
    return ok;
  }
  parseUnary() {
    const t = this.tok;
    if (t.t === 'op') {
      if (t.v === '!' || t.v === '-' || t.v === '+' || t.v === '~') { this.p++; const e = this.parseUnary(); return { k: 'unary', op: t.v, e, line: t.line, col: t.col }; }
      if (t.v === '++' || t.v === '--') { this.p++; const e = this.parseUnary(); return { k: 'incdec', op: t.v, prefix: true, target: e, line: t.line, col: t.col }; }
      if (t.v === '(' && this.isCastAhead()) {
        this.p++; const type = this.parseType(); this.expectOp(')');
        const e = this.parseUnary();
        return { k: 'cast', type, e, line: t.line, col: t.col };
      }
    }
    return this.parsePostfix();
  }
  parseArgs() {
    this.expectOp('(');
    const args = [];
    if (!this.isOp(')')) { for (;;) { args.push(this.parseExpr()); if (this.eatOp(',')) continue; break; } }
    this.expectOp(')');
    return args;
  }
  parsePostfix() {
    let e = this.parsePrimary();
    for (;;) {
      const t = this.tok;
      if (t.t !== 'op') break;
      if (t.v === '.' || t.v === '?.') {
        this.p++;
        const n = this.tok;
        if (n.t !== 'id') this.err("Unexpected token '" + n.v + "'. Expected a member name");
        this.p++;
        if (this.isOp('(')) {
          const args = this.parseArgs();
          e = { k: 'call', obj: e, name: n.v, lc: n.lc, args, safe: t.v === '?.', line: n.line, col: n.col };
        } else {
          e = { k: 'member', obj: e, name: n.v, lc: n.lc, safe: t.v === '?.', line: n.line, col: n.col };
        }
        continue;
      }
      if (t.v === '[') {
        this.p++;
        if (this.isKw('select') || this.isKw('find')) this.soqlError(t);
        const idx = this.parseExpr(); this.expectOp(']');
        e = { k: 'index', obj: e, idx, line: t.line, col: t.col };
        continue;
      }
      if (t.v === '++' || t.v === '--') {
        this.p++;
        e = { k: 'incdec', op: t.v, prefix: false, target: e, line: t.line, col: t.col };
        continue;
      }
      break;
    }
    return e;
  }
  parsePrimary() {
    const t = this.tok;
    if (t.t === 'num') {
      this.p++;
      return { k: 'num', kind: t.kind, text: t.v, line: t.line, col: t.col };
    }
    if (t.t === 'str') { this.p++; return { k: 'str', v: t.v, line: t.line, col: t.col }; }
    if (t.t === 'op') {
      if (t.v === '(') { this.p++; const e = this.parseExpr(); this.expectOp(')'); return { k: 'paren', e, line: t.line, col: t.col }; }
      if (t.v === '[') this.soqlError(t);
    }
    if (t.t === 'id') {
      switch (t.lc) {
        case 'null': this.p++; return { k: 'null', line: t.line, col: t.col };
        case 'true': this.p++; return { k: 'bool', v: true, line: t.line, col: t.col };
        case 'false': this.p++; return { k: 'bool', v: false, line: t.line, col: t.col };
        case 'this':
          this.p++;
          if (this.isOp('(')) return { k: 'ctorcall', which: 'this', args: this.parseArgs(), line: t.line, col: t.col };
          return { k: 'this', line: t.line, col: t.col };
        case 'super':
          this.p++;
          if (this.isOp('(')) return { k: 'ctorcall', which: 'super', args: this.parseArgs(), line: t.line, col: t.col };
          return { k: 'super', line: t.line, col: t.col };
        case 'new': return this.parseNew();
        default: break;
      }
      if (RESERVED.has(t.lc)) this.err("Unexpected token '" + t.v + "'");
      this.p++;
      if (this.isOp('(')) { const args = this.parseArgs(); return { k: 'call', obj: null, name: t.v, lc: t.lc, args, line: t.line, col: t.col }; }
      // Type.class
      return { k: 'id', name: t.v, lc: t.lc, line: t.line, col: t.col };
    }
    this.err("Unexpected token '" + (t.t === 'eof' ? 'end of file' : t.v) + "'");
  }
  parseNew() {
    const t = this.tok; this.p++;
    const type = this.parseTypeNoDims();
    // array: new T[n] | new T[]{...}
    if (this.isOp('[')) {
      this.p++;
      if (this.isOp(']')) {
        this.p++;
        this.expectOp('{');
        const items = [];
        while (!this.isOp('}')) { items.push(this.parseExpr()); if (!this.eatOp(',')) break; }
        this.expectOp('}');
        return { k: 'newlist', type: { name: 'List', lc: 'list', args: [type], dims: 0 }, items, line: t.line, col: t.col };
      }
      const size = this.parseExpr(); this.expectOp(']');
      return { k: 'newarray', type, size, line: t.line, col: t.col };
    }
    if (this.isOp('(')) {
      const args = this.parseArgs();
      return { k: 'new', type, args, line: t.line, col: t.col };
    }
    if (this.isOp('{')) {
      this.p++;
      if (type.lc === 'map') {
        const pairs = [];
        while (!this.isOp('}')) {
          const k = this.parseExpr(); this.expectOp('=>'); const v = this.parseExpr();
          pairs.push([k, v]); if (!this.eatOp(',')) break;
        }
        this.expectOp('}');
        return { k: 'newmap', type, pairs, line: t.line, col: t.col };
      }
      const items = [];
      while (!this.isOp('}')) { items.push(this.parseExpr()); if (!this.eatOp(',')) break; }
      this.expectOp('}');
      return { k: type.lc === 'set' ? 'newset' : 'newlist', type, items, line: t.line, col: t.col };
    }
    this.err("Unexpected token '" + this.tok.v + "'. Expected '(' after new " + type.name);
  }
  parseTypeNoDims() {
    const t = this.tok;
    if (t.t !== 'id' || RESERVED.has(t.lc)) this.err("Unexpected token '" + t.v + "'. Expected a type");
    let name = t.v; this.p++;
    while (this.isOp('.') && this.peek(1).t === 'id' && !RESERVED.has(this.peek(1).lc)) { this.p++; name += '.' + this.tok.v; this.p++; }
    const args = [];
    if (this.isOp('<')) {
      this.p++;
      if (!this.isOp('>')) { for (;;) { args.push(this.parseType()); if (this.eatOp(',')) continue; break; } }
      this.expectGT();
    }
    return { name, lc: name.toLowerCase(), args, dims: 0, line: t.line, col: t.col };
  }
}

function parse(src) { return new Parser(src).parseUnit(); }

/* ------------------------------------------------------------ value model */
let OBJ_ID = 0;
class Dec { constructor(v, s) { this.v = v; this.s = s; } }          // s >= 0: Decimal with scale; s < 0: Double
class ApexList { constructor(a) { this.a = a || []; } }
class ApexSet { constructor() { this.m = new Map(); } }
class ApexMap { constructor() { this.m = new Map(); } }
class Obj { constructor(cls) { this.cls = cls; this.f = new Map(); this.id = ++OBJ_ID; this.line = 0; this.stack = null; } }
class EnumVal { constructor(en, name, ord) { this.en = en; this.name = name; this.ord = ord; } }
class ClsRef { constructor(cls) { this.cls = cls; } }
class NsRef { constructor(ns) { this.ns = ns; } }
class TypeRef { constructor(name, cls) { this.name = name; this.cls = cls; } }
class ApexDate { constructor(y, m, d) { this.y = y; this.m = m; this.d = d; } }
class ApexDatetime { constructor(ms) { this.ms = ms; } }
class ApexThrow { constructor(obj) { this.obj = obj; } }
class StopRun { constructor(msg) { this.msg = msg; } }

const isNum = v => typeof v === 'number' || v instanceof Dec;
const numVal = v => (v instanceof Dec ? v.v : v);
const pad2 = n => (n < 10 ? '0' : '') + n;

function fmtDec(d) {
  if (d.s >= 0) return Math.abs(d.v) < 1e21 ? d.v.toFixed(Math.min(d.s, 20)) : String(d.v);
  if (Number.isInteger(d.v)) return d.v.toFixed(1);
  return String(d.v);
}
function roundHalfEven(v, scale) {
  const f = Math.pow(10, scale); const x = v * f; const fl = Math.floor(x); const diff = x - fl;
  let r;
  if (Math.abs(diff - 0.5) < 1e-9) r = (fl % 2 === 0) ? fl : fl + 1; else r = Math.round(x);
  return r / f;
}
function fmtDate(d) { return d.y + '-' + pad2(d.m) + '-' + pad2(d.d); }
function fmtDatetime(dt) {
  const d = new Date(dt.ms);
  return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate()) + ' ' + pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes()) + ':' + pad2(d.getUTCSeconds());
}

/* ---- keys / equality / strings (need interpreter for user methods: set at run) */
let RT = null; // current interpreter

function keyOf(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'string') return 's:' + v;
  if (typeof v === 'number') return 'n:' + v;
  if (v instanceof Dec) return 'n:' + v.v;
  if (typeof v === 'boolean') return 'b:' + v;
  if (v instanceof Obj) {
    const m = RT && RT.findMethod(v.cls, 'hashcode', 0);
    if (m) return 'h:' + RT.invoke(m.cls, m.m, v, [], null);
    return 'o:' + v.id;
  }
  if (v instanceof EnumVal) return 'e:' + v.en.name + '.' + v.name;
  if (v instanceof ApexList) return 'l:[' + v.a.map(keyOf).join(',') + ']';
  if (v instanceof ApexSet) return 'S:{' + Array.from(v.m.keys()).sort().join(',') + '}';
  if (v instanceof ApexMap) return 'M:{' + Array.from(v.m.keys()).sort().map(k => k + '=' + keyOf(v.m.get(k)[1])).join(',') + '}';
  if (v instanceof ApexDate) return 'd:' + fmtDate(v);
  if (v instanceof ApexDatetime) return 'dt:' + v.ms;
  return 'x:' + String(v);
}
function valEq(a, b) {
  if (a === null || a === undefined) return b === null || b === undefined;
  if (b === null || b === undefined) return false;
  if (typeof a === 'string' && typeof b === 'string') return a.toLowerCase() === b.toLowerCase();
  if (isNum(a) && isNum(b)) return numVal(a) === numVal(b);
  if (a instanceof Obj && b instanceof Obj) {
    if (a === b) return true;
    const m = RT && RT.findMethod(a.cls, 'equals', 1);
    if (m) return RT.truthy(RT.invoke(m.cls, m.m, a, [b], null));
    return false;
  }
  if (a instanceof ApexList && b instanceof ApexList) return a.a.length === b.a.length && a.a.every((x, i) => valEq(x, b.a[i]));
  if (a instanceof ApexSet && b instanceof ApexSet) return a.m.size === b.m.size && Array.from(a.m.keys()).every(k => b.m.has(k));
  if (a instanceof ApexMap && b instanceof ApexMap) return a.m.size === b.m.size && Array.from(a.m.keys()).every(k => b.m.has(k) && valEq(a.m.get(k)[1], b.m.get(k)[1]));
  if (a instanceof ApexDate && b instanceof ApexDate) return fmtDate(a) === fmtDate(b);
  if (a instanceof ApexDatetime && b instanceof ApexDatetime) return a.ms === b.ms;
  return a === b;
}
function exactEq(a, b) {
  if (typeof a === 'string' && typeof b === 'string') return a === b;
  return valEq(a, b);
}
function str(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (v instanceof Dec) return fmtDec(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (v instanceof ApexList) return '(' + v.a.map(str).join(', ') + ')';
  if (v instanceof ApexSet) return '{' + Array.from(v.m.values()).map(str).join(', ') + '}';
  if (v instanceof ApexMap) return '{' + Array.from(v.m.values()).map(p => str(p[0]) + '=' + str(p[1])).join(', ') + '}';
  if (v instanceof EnumVal) return v.name;
  if (v instanceof ApexDate) return fmtDate(v);
  if (v instanceof ApexDatetime) return fmtDatetime(v);
  if (v instanceof TypeRef) return v.name;
  if (v instanceof ClsRef) return v.cls.name;
  if (v instanceof Obj) {
    const m = RT && RT.findMethod(v.cls, 'tostring', 0);
    if (m && !m.cls.builtin) return str(RT.invoke(m.cls, m.m, v, [], null));
    if (v.cls.isExc) { return v.cls.name + ': ' + str(v.f.get('__msg')); }
    const parts = [];
    for (const [k, val] of v.f) { if (k.startsWith('__')) continue; parts.push(RT.fieldDisplayName(v.cls, k) + '=' + str(val)); }
    return v.cls.name + ':[' + parts.join(', ') + ']';
  }
  return String(v);
}
function typeNameOf(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'string') return 'String';
  if (typeof v === 'number') return 'Integer';
  if (v instanceof Dec) return v.s < 0 ? 'Double' : 'Decimal';
  if (typeof v === 'boolean') return 'Boolean';
  if (v instanceof ApexList) return 'List';
  if (v instanceof ApexSet) return 'Set';
  if (v instanceof ApexMap) return 'Map';
  if (v instanceof Obj) return v.cls.name;
  if (v instanceof EnumVal) return v.en.name;
  if (v instanceof ApexDate) return 'Date';
  if (v instanceof ApexDatetime) return 'Datetime';
  return 'Object';
}

/* ------------------------------------------------------------ numbers */
function mkDecimal(v, s) { return new Dec(v, s); }
function arith(op, a, b, node, rt) {
  if (op === '+' && (typeof a === 'string' || typeof b === 'string')) return str(a) + str(b);
  if (a === null || a === undefined || b === null || b === undefined) rt.throwEx('NullPointerException', 'Attempt to de-reference a null object', node);
  if (op === '+' && a instanceof ApexDate && typeof b === 'number') return addDays(a, b);
  if (op === '-' && a instanceof ApexDate && typeof b === 'number') return addDays(a, -b);
  if (!isNum(a) || !isNum(b)) rt.throwEx('TypeException', "Illegal operands for '" + op + "': " + typeNameOf(a) + ' and ' + typeNameOf(b), node);
  const x = numVal(a), y = numVal(b);
  if (typeof a === 'number' && typeof b === 'number') {
    switch (op) {
      case '+': return x + y; case '-': return x - y; case '*': return x * y;
      case '/': if (y === 0) rt.throwEx('MathException', 'Divide by 0', node); return Math.trunc(x / y);
      case '%': if (y === 0) rt.throwEx('MathException', 'Divide by 0', node); return x % y;
    }
  }
  const isDouble = (a instanceof Dec && a.s < 0) || (b instanceof Dec && b.s < 0);
  const sa = a instanceof Dec ? a.s : 0, sb = b instanceof Dec ? b.s : 0;
  let r, s;
  switch (op) {
    case '+': r = x + y; s = Math.max(sa, sb); break;
    case '-': r = x - y; s = Math.max(sa, sb); break;
    case '*': r = x * y; s = sa + sb; break;
    case '/':
      if (y === 0) rt.throwEx('MathException', 'Divide by 0', node);
      r = x / y; s = Math.max(sa, sb);
      if (!isDouble) { const t = parseFloat(r.toFixed(8)); const dp = (String(t).split('.')[1] || '').length; s = Math.max(s, dp); r = t; }
      break;
    case '%': if (y === 0) rt.throwEx('MathException', 'Divide by 0', node); r = x % y; s = Math.max(sa, sb); break;
  }
  if (isDouble) return new Dec(r, -1);
  r = parseFloat(r.toFixed(Math.min(s, 20)));
  return new Dec(r, s);
}
function compareVals(a, b) {
  if (isNum(a) && isNum(b)) { const x = numVal(a), y = numVal(b); return x < y ? -1 : x > y ? 1 : 0; }
  if (typeof a === 'string' && typeof b === 'string') { const x = a.toLowerCase(), y = b.toLowerCase(); return x < y ? -1 : x > y ? 1 : 0; }
  if (a instanceof ApexDate && b instanceof ApexDate) { const x = fmtDate(a), y = fmtDate(b); return x < y ? -1 : x > y ? 1 : 0; }
  if (a instanceof ApexDatetime && b instanceof ApexDatetime) return a.ms < b.ms ? -1 : a.ms > b.ms ? 1 : 0;
  return null;
}

/* ------------------------------------------------------------ dates */
function addDays(d, n) { const j = new Date(Date.UTC(d.y, d.m - 1, d.d + n)); return new ApexDate(j.getUTCFullYear(), j.getUTCMonth() + 1, j.getUTCDate()); }
function addMonths(d, n) { const j = new Date(Date.UTC(d.y, d.m - 1 + n, 1)); const dim = new Date(Date.UTC(j.getUTCFullYear(), j.getUTCMonth() + 1, 0)).getUTCDate(); return new ApexDate(j.getUTCFullYear(), j.getUTCMonth() + 1, Math.min(d.d, dim)); }
function dateMs(d) { return Date.UTC(d.y, d.m - 1, d.d); }

/* ------------------------------------------------------------ builtin static classes */
function listOf(arr) { return new ApexList(arr); }
function toArrayIter(v, rt, node) {
  if (v instanceof ApexList) return v.a.slice();
  if (v instanceof ApexSet) return Array.from(v.m.values());
  if (v === null || v === undefined) rt.throwEx('NullPointerException', 'Attempt to de-reference a null object', node);
  rt.throwEx('TypeException', 'Value is not iterable', node);
}
function parseIntStrict(s, rt, node) {
  if (typeof s !== 'string' || !/^\s*[+-]?\d+\s*$/.test(s)) rt.throwEx('TypeException', 'Invalid integer: ' + str(s), node);
  return parseInt(s, 10);
}
function parseNumStrict(s, rt, node) {
  if (typeof s !== 'string' || s.trim() === '' || isNaN(Number(s))) rt.throwEx('TypeException', 'Invalid decimal: ' + str(s), node);
  return Number(s);
}
function scaleOfText(s) { const p = String(s).trim().split('.'); return p.length > 1 ? p[1].length : 0; }

const STATIC = {
  math: {
    abs: ([x]) => (x instanceof Dec ? new Dec(Math.abs(x.v), x.s) : Math.abs(x)),
    max: ([a, b]) => (typeof a === 'number' && typeof b === 'number' ? Math.max(a, b) : new Dec(Math.max(numVal(a), numVal(b)), Math.max(a.s || 0, b.s || 0))),
    min: ([a, b]) => (typeof a === 'number' && typeof b === 'number' ? Math.min(a, b) : new Dec(Math.min(numVal(a), numVal(b)), Math.max(a.s || 0, b.s || 0))),
    pow: ([a, b]) => new Dec(Math.pow(numVal(a), numVal(b)), -1),
    sqrt: ([a]) => new Dec(Math.sqrt(numVal(a)), -1),
    floor: ([a]) => Math.floor(numVal(a)), ceil: ([a]) => Math.ceil(numVal(a)),
    round: ([a]) => { const x = numVal(a); return x < 0 ? -Math.round(-x) : Math.round(x); },
    rint: ([a]) => Math.round(numVal(a)),
    mod: ([a, b], rt, n) => { if (numVal(b) === 0) rt.throwEx('MathException', 'Divide by 0', n); return numVal(a) % numVal(b); },
    signum: ([a]) => Math.sign(numVal(a)),
    log: ([a]) => new Dec(Math.log(numVal(a)), -1), log10: ([a]) => new Dec(Math.log10(numVal(a)), -1), exp: ([a]) => new Dec(Math.exp(numVal(a)), -1),
    sin: ([a]) => new Dec(Math.sin(numVal(a)), -1), cos: ([a]) => new Dec(Math.cos(numVal(a)), -1), tan: ([a]) => new Dec(Math.tan(numVal(a)), -1),
    random: () => new Dec(Math.random(), -1),
    cbrt: ([a]) => new Dec(Math.cbrt(numVal(a)), -1)
  },
  string: {
    valueof: ([x]) => str(x),
    isblank: ([s]) => s === null || s === undefined || String(s).trim() === '',
    isnotblank: ([s]) => !(s === null || s === undefined || String(s).trim() === ''),
    isempty: ([s]) => s === null || s === undefined || s === '',
    isnotempty: ([s]) => !(s === null || s === undefined || s === ''),
    join: ([it, sep], rt, n) => toArrayIter(it, rt, n).map(str).join(sep === null ? '' : sep),
    format: ([pat, args], rt, n) => {
      const arr = args instanceof ApexList ? args.a : [];
      return String(pat).replace(/\{(\d+)\}/g, (m, i) => (i < arr.length ? str(arr[i]) : m)).replace(/''/g, "'");
    },
    escapesinglequotes: ([s]) => String(s).replace(/'/g, "\\'"),
    fromchararray: ([l]) => l.a.map(c => String.fromCharCode(c)).join(''),
    valueofgmt: ([x]) => str(x)
  },
  integer: {
    valueof: ([x], rt, n) => (typeof x === 'string' ? parseIntStrict(x, rt, n) : Math.trunc(numVal(x))),
    parseint: ([x], rt, n) => parseIntStrict(x, rt, n)
  },
  long: { valueof: ([x], rt, n) => (typeof x === 'string' ? parseIntStrict(x, rt, n) : Math.trunc(numVal(x))) },
  decimal: {
    valueof: ([x], rt, n) => (typeof x === 'string' ? new Dec(parseNumStrict(x, rt, n), scaleOfText(x)) : new Dec(numVal(x), x instanceof Dec ? x.s : 0))
  },
  double: {
    valueof: ([x], rt, n) => new Dec(typeof x === 'string' ? parseNumStrict(x, rt, n) : numVal(x), -1)
  },
  boolean: {
    valueof: ([x], rt, n) => { if (typeof x === 'boolean') return x; const s = String(x).toLowerCase(); if (s === 'true') return true; if (s === 'false') return false; rt.throwEx('TypeException', 'Invalid conversion from runtime type String to Boolean', n); }
  },
  date: {
    today: () => { const d = new Date(); return new ApexDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); },
    newinstance: ([y, m, d]) => new ApexDate(y, m, d),
    valueof: ([s], rt, n) => { const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(String(s)); if (!m) rt.throwEx('TypeException', 'Invalid date: ' + s, n); return new ApexDate(+m[1], +m[2], +m[3]); }
  },
  datetime: {
    now: () => new ApexDatetime(Date.now()),
    newinstance: ([y, m, d, h, mi, s]) => new ApexDatetime(Date.UTC(y, m - 1, d, h || 0, mi || 0, s || 0))
  },
  system: {
    debug: (args, rt, n) => { rt.debug(args.length > 1 ? args[1] : args[0], n); return null; },
    assert: ([c, msg], rt, n) => { if (c !== true) rt.throwEx('AssertException', 'Assertion Failed' + (msg !== undefined && msg !== null ? ': ' + str(msg) : ''), n); return null; },
    assertequals: ([e, a, msg], rt, n) => { if (!valEq(e, a)) rt.throwEx('AssertException', 'Assertion Failed: Expected: ' + str(e) + ', Actual: ' + str(a) + (msg ? ' - ' + str(msg) : ''), n); return null; },
    assertnotequals: ([e, a, msg], rt, n) => { if (valEq(e, a)) rt.throwEx('AssertException', 'Assertion Failed: Same value: ' + str(e) + (msg ? ' - ' + str(msg) : ''), n); return null; },
    now: () => new ApexDatetime(Date.now()),
    today: () => STATIC.date.today(),
    currenttimemillis: () => Date.now(),
    hashcode: ([o]) => hashStr(keyOf(o)),
    isbatch: () => false, isfuture: () => false, isqueueable: () => false, isscheduled: () => false
  },
  assert: {
    areequal: ([e, a, msg], rt, n) => { if (!valEq(e, a)) rt.throwEx('AssertException', 'Assertion Failed: Expected: ' + str(e) + ', Actual: ' + str(a) + (msg ? ' - ' + str(msg) : ''), n); return null; },
    arenotequal: ([e, a, msg], rt, n) => { if (valEq(e, a)) rt.throwEx('AssertException', 'Assertion Failed: Same value: ' + str(e) + (msg ? ' - ' + str(msg) : ''), n); return null; },
    istrue: ([c, msg], rt, n) => { if (c !== true) rt.throwEx('AssertException', 'Assertion Failed: Expected true' + (msg ? ' - ' + str(msg) : ''), n); return null; },
    isfalse: ([c, msg], rt, n) => { if (c !== false) rt.throwEx('AssertException', 'Assertion Failed: Expected false' + (msg ? ' - ' + str(msg) : ''), n); return null; },
    isnull: ([v, msg], rt, n) => { if (v !== null && v !== undefined) rt.throwEx('AssertException', 'Assertion Failed: Expected null, Actual: ' + str(v) + (msg ? ' - ' + str(msg) : ''), n); return null; },
    isnotnull: ([v, msg], rt, n) => { if (v === null || v === undefined) rt.throwEx('AssertException', 'Assertion Failed: Expected not null' + (msg ? ' - ' + str(msg) : ''), n); return null; },
    fail: ([msg], rt, n) => { rt.throwEx('AssertException', 'Assertion Failed' + (msg ? ': ' + str(msg) : ''), n); }
  },
  json: {
    serialize: ([v]) => jsonSer(v, false),
    serializepretty: ([v]) => jsonSer(v, true),
    deserializeuntyped: ([s], rt, n) => { try { return fromJs(JSON.parse(s)); } catch (e) { rt.throwEx('JSONException', 'Unexpected character in JSON: ' + e.message, n); } }
  },
  type: {
    forname: ([nm], rt) => { const c = rt.lookupClass(String(nm).toLowerCase()); return c ? new TypeRef(c.name, c) : null; }
  },
  pattern: {
    matches: ([re, s]) => new RegExp('^(?:' + re + ')$').test(s),
    quote: ([s]) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  },
  logginglevel: new Proxy({}, { get: (t, k) => k }),
  uuid: {}, userinfo: null
};
STATIC.string.valueof = ([x]) => str(x);
STATIC.object = {};
function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }
function jsonSer(v, pretty) {
  function conv(x) {
    if (x === null || x === undefined) return null;
    if (typeof x === 'string' || typeof x === 'boolean') return x;
    if (typeof x === 'number') return x;
    if (x instanceof Dec) return x.v;
    if (x instanceof ApexList) return x.a.map(conv);
    if (x instanceof ApexSet) return Array.from(x.m.values()).map(conv);
    if (x instanceof ApexMap) { const o = {}; for (const p of x.m.values()) o[str(p[0])] = conv(p[1]); return o; }
    if (x instanceof EnumVal) return x.name;
    if (x instanceof ApexDate) return fmtDate(x);
    if (x instanceof Obj) { const o = {}; for (const [k, val] of x.f) { if (!k.startsWith('__')) o[RT.fieldDisplayName(x.cls, k)] = conv(val); } return o; }
    return str(x);
  }
  return JSON.stringify(conv(v), null, pretty ? 2 : 0);
}
function fromJs(x) {
  if (x === null) return null;
  if (typeof x === 'string' || typeof x === 'boolean') return x;
  if (typeof x === 'number') return Number.isInteger(x) ? x : new Dec(x, scaleOfText(String(x)));
  if (Array.isArray(x)) return new ApexList(x.map(fromJs));
  const m = new ApexMap();
  for (const k of Object.keys(x)) m.m.set(keyOf(k), [k, fromJs(x[k])]);
  return m;
}

/* ------------------------------------------------------------ instance methods on builtin values */
function idxCheck(rt, list, i, node) {
  if (typeof i !== 'number' || i < 0 || i >= list.a.length) rt.throwEx('ListException', 'List index out of bounds: ' + str(i), node);
}
function sortList(rt, list, cmp, node) {
  const a = list.a;
  let f;
  if (cmp) {
    f = (x, y) => numVal(rt.invokeMethod(cmp, 'compare', [x, y], node));
  } else {
    f = (x, y) => {
      if (x === null || x === undefined) return (y === null || y === undefined) ? 0 : -1;
      if (y === null || y === undefined) return 1;
      if (typeof x === 'string' && typeof y === 'string') return x < y ? -1 : x > y ? 1 : 0;
      const c = compareVals(x, y);
      if (c !== null) return c;
      if (x instanceof Obj) return numVal(rt.invokeMethod(x, 'compareTo', [y], node));
      if (typeof x === 'boolean') return (x === y) ? 0 : (x ? 1 : -1);
      return 0;
    };
  }
  list.a = a.map((v, i) => [v, i]).sort((p, q) => f(p[0], q[0]) || (p[1] - q[1])).map(p => p[0]);
}
function patOf(s) { return new RegExp(s); }

const INSTANCE = {
  string: {
    length: s => s.length,
    substring: (s, [a, b], rt, n) => { if (b === undefined) b = s.length; if (a < 0 || b > s.length || a > b) rt.throwEx('StringException', 'Ending position out of bounds: ' + b, n); return s.substring(a, b); },
    substringbefore: (s, [x]) => { const i = s.indexOf(x); return i < 0 ? '' : s.substring(0, i); },
    substringafter: (s, [x]) => { const i = s.indexOf(x); return i < 0 ? '' : s.substring(i + x.length); },
    substringbetween: (s, [a, b]) => { const i = s.indexOf(a); if (i < 0) return null; const j = s.indexOf(b, i + a.length); return j < 0 ? null : s.substring(i + a.length, j); },
    touppercase: s => s.toUpperCase(), tolowercase: s => s.toLowerCase(),
    trim: s => s.trim(), normalizespace: s => s.trim().replace(/\s+/g, ' '),
    contains: (s, [x]) => s.includes(x),
    containsignorecase: (s, [x]) => s.toLowerCase().includes(String(x).toLowerCase()),
    startswith: (s, [x]) => s.startsWith(x), endswith: (s, [x]) => s.endsWith(x),
    startswithignorecase: (s, [x]) => s.toLowerCase().startsWith(String(x).toLowerCase()),
    endswithignorecase: (s, [x]) => s.toLowerCase().endsWith(String(x).toLowerCase()),
    indexof: (s, [x, from]) => s.indexOf(x, from || 0), lastindexof: (s, [x]) => s.lastIndexOf(x),
    replace: (s, [a, b]) => s.split(a).join(b),
    replaceall: (s, [a, b]) => s.replace(new RegExp(a, 'g'), String(b).replace(/\$(\d)/g, '$$$1')),
    replacefirst: (s, [a, b]) => s.replace(new RegExp(a), b),
    split: (s, [sep]) => new ApexList(s.split(new RegExp(sep))),
    equals: (s, [x]) => s === x, equalsignorecase: (s, [x]) => typeof x === 'string' && s.toLowerCase() === x.toLowerCase(),
    isblank: s => s.trim() === '', isempty: s => s === '', isnotblank: s => s.trim() !== '', isnotempty: s => s !== '',
    reverse: s => s.split('').reverse().join(''),
    left: (s, [n]) => s.substring(0, n), right: (s, [n]) => s.substring(Math.max(0, s.length - n)),
    capitalize: s => s.charAt(0).toUpperCase() + s.slice(1),
    uncapitalize: s => s.charAt(0).toLowerCase() + s.slice(1),
    repeat: (s, [n, sep]) => Array(n).fill(s).join(sep || ''),
    deletewhitespace: s => s.replace(/\s+/g, ''), remove: (s, [x]) => s.split(x).join(''),
    abbreviate: (s, [n]) => (s.length <= n ? s : s.substring(0, n - 3) + '...'),
    countmatches: (s, [x]) => (x === '' ? 0 : s.split(x).length - 1),
    comparetoo: () => 0,
    compareto: (s, [x]) => (s < x ? -1 : s > x ? 1 : 0),
    charat: (s, [i]) => s.charCodeAt(i), codepointat: (s, [i]) => s.codePointAt(i),
    chars: s => new ApexList(Array.from(s).map(c => c.charCodeAt(0))),
    isnumeric: s => /^\d+$/.test(s), isalpha: s => /^[A-Za-z]+$/.test(s), isalphanumeric: s => /^[A-Za-z0-9]+$/.test(s),
    isalphaspace: s => /^[A-Za-z ]+$/.test(s), isalphanumericspace: s => /^[A-Za-z0-9 ]+$/.test(s),
    isuppercase: s => s === s.toUpperCase() && s !== s.toLowerCase(), islowercase: s => s === s.toLowerCase() && s !== s.toUpperCase(),
    leftpad: (s, [n, c]) => s.padStart(n, c === undefined ? ' ' : c), rightpad: (s, [n, c]) => s.padEnd(n, c === undefined ? ' ' : c),
    center: (s, [n, c]) => { const ch = c === undefined ? ' ' : c; const total = Math.max(0, n - s.length); const l = Math.floor(total / 2); return ch.repeat(l) + s + ch.repeat(total - l); },
    hashcode: s => hashStr(s), tostring: s => s, trimleft: s => s.trimStart(), trimright: s => s.trimEnd(),
    escapehtml4: s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    format: (s, args) => String(s).replace(/\{(\d+)\}/g, (m, i) => (i < args.length ? str(args[i]) : m)),
    tolowercase2: s => s.toLowerCase(),
    matches: (s, [re]) => new RegExp('^(?:' + re + ')$').test(s),
    containsonly: (s, [x]) => Array.from(s).every(c => x.includes(c)),
    containsany: (s, [x]) => Array.from(s).some(c => x.includes(c)),
    getchars: s => new ApexList(Array.from(s).map(c => c.charCodeAt(0)))
  },
  integer: {
    tostring: v => String(v), format: v => v.toLocaleString('en-US'),
    intvalue: v => v, longvalue: v => v, doublevalue: v => new Dec(v, -1),
    addmonths: () => null, hashcode: v => v, equals: (v, [x]) => valEq(v, x),
    format2: v => String(v)
  },
  decimal: {
    tostring: v => fmtDec(v), format: v => v.v.toLocaleString('en-US', { minimumFractionDigits: Math.max(0, v.s), maximumFractionDigits: Math.max(0, v.s) }),
    intvalue: v => Math.trunc(v.v), longvalue: v => Math.trunc(v.v), doublevalue: v => new Dec(v.v, -1),
    scale: v => (v.s < 0 ? 0 : v.s),
    setscale: (v, [n, mode]) => new Dec(mode === 'DOWN' ? Math.trunc(v.v * Math.pow(10, n)) / Math.pow(10, n) : mode === 'UP' ? (v.v < 0 ? -1 : 1) * Math.ceil(Math.abs(v.v) * Math.pow(10, n)) / Math.pow(10, n) : mode === 'HALF_UP' ? (v.v < 0 ? -1 : 1) * Math.round(Math.abs(v.v) * Math.pow(10, n)) / Math.pow(10, n) : mode === 'FLOOR' ? Math.floor(v.v * Math.pow(10, n)) / Math.pow(10, n) : mode === 'CEILING' ? Math.ceil(v.v * Math.pow(10, n)) / Math.pow(10, n) : roundHalfEven(v.v, n), n),
    round: v => { const x = v.v; return x < 0 ? -Math.round(-x) : Math.round(x); },
    divide: (v, [d, scale], rt, n) => { if (numVal(d) === 0) rt.throwEx('MathException', 'Divide by 0', n); return new Dec(roundHalfEven(v.v / numVal(d), scale), scale); },
    abs: v => new Dec(Math.abs(v.v), v.s), pow: (v, [e]) => new Dec(Math.pow(v.v, e), v.s * e),
    negate: v => new Dec(-v.v, v.s), hashcode: v => hashStr(String(v.v)), equals: (v, [x]) => valEq(v, x),
    stripTrailingZeros: v => new Dec(v.v, 0)
  },
  boolean: { tostring: v => String(v), equals: (v, [x]) => v === x, hashcode: v => (v ? 1231 : 1237) },
  date: {
    adddays: (d, [n]) => addDays(d, n), addmonths: (d, [n]) => addMonths(d, n), addyears: (d, [n]) => addMonths(d, 12 * n),
    year: d => d.y, month: d => d.m, day: d => d.d,
    daysbetween: (d, [o]) => Math.round((dateMs(o) - dateMs(d)) / 86400000),
    issamedate: (d, [o]) => fmtDate(d) === fmtDate(o), isleapyear: d => (d.y % 4 === 0 && d.y % 100 !== 0) || d.y % 400 === 0,
    tostring: d => fmtDate(d), format: d => fmtDate(d), todatestart: d => new ApexDatetime(dateMs(d)),
    dayofyear: d => Math.round((dateMs(d) - Date.UTC(d.y, 0, 1)) / 86400000) + 1,
    adddays2: d => d, equals: (d, [o]) => valEq(d, o), hashcode: d => hashStr(fmtDate(d))
  },
  datetime: {
    adddays: (d, [n]) => new ApexDatetime(d.ms + n * 86400000), addhours: (d, [n]) => new ApexDatetime(d.ms + n * 3600000),
    addminutes: (d, [n]) => new ApexDatetime(d.ms + n * 60000), addseconds: (d, [n]) => new ApexDatetime(d.ms + n * 1000),
    gettime: d => d.ms, date: d => { const j = new Date(d.ms); return new ApexDate(j.getUTCFullYear(), j.getUTCMonth() + 1, j.getUTCDate()); },
    year: d => new Date(d.ms).getUTCFullYear(), month: d => new Date(d.ms).getUTCMonth() + 1, day: d => new Date(d.ms).getUTCDate(),
    hour: d => new Date(d.ms).getUTCHours(), minute: d => new Date(d.ms).getUTCMinutes(), second: d => new Date(d.ms).getUTCSeconds(),
    tostring: d => fmtDatetime(d), format: d => fmtDatetime(d), equals: (d, [o]) => valEq(d, o)
  },
  list: {
    add: (l, args, rt, n) => { if (args.length === 2) { if (args[0] < 0 || args[0] > l.a.length) rt.throwEx('ListException', 'List index out of bounds: ' + args[0], n); l.a.splice(args[0], 0, args[1]); } else l.a.push(args[0]); return null; },
    addall: (l, [x], rt, n) => { l.a.push(...toArrayIter(x, rt, n)); return true; },
    get: (l, [i], rt, n) => { idxCheck(rt, l, i, n); return l.a[i]; },
    set: (l, [i, v], rt, n) => { idxCheck(rt, l, i, n); l.a[i] = v; return null; },
    size: l => l.a.length, isempty: l => l.a.length === 0, clear: l => { l.a.length = 0; return null; },
    remove: (l, [i], rt, n) => { idxCheck(rt, l, i, n); return l.a.splice(i, 1)[0]; },
    contains: (l, [v]) => l.a.some(x => valEq(x, v)),
    indexof: (l, [v]) => l.a.findIndex(x => valEq(x, v)),
    sort: (l, args, rt, n) => { sortList(rt, l, args[0], n); return null; },
    clone: l => new ApexList(l.a.slice()), deepclone: l => new ApexList(l.a.slice()),
    sublist: (l, [a, b], rt, n) => { if (a < 0 || b > l.a.length || a > b) rt.throwEx('ListException', 'List index out of bounds: ' + b, n); return new ApexList(l.a.slice(a, b)); },
    equals: (l, [o]) => valEq(l, o), tostring: l => str(l), hashcode: l => hashStr(keyOf(l)),
    removeall: (l, [x], rt, n) => { const ks = toArrayIter(x, rt, n); l.a = l.a.filter(v => !ks.some(k => valEq(k, v))); return true; },
    retainall: (l, [x], rt, n) => { const ks = toArrayIter(x, rt, n); l.a = l.a.filter(v => ks.some(k => valEq(k, v))); return true; },
    containsall: (l, [x], rt, n) => toArrayIter(x, rt, n).every(k => l.a.some(v => valEq(k, v))),
    reverse: l => { l.a.reverse(); return null; },
    iterator: l => l
  },
  set: {
    add: (s, [v]) => { const k = keyOf(v); if (s.m.has(k)) return false; s.m.set(k, v); return true; },
    addall: (s, [x], rt, n) => { let ch = false; for (const v of toArrayIter(x, rt, n)) { const k = keyOf(v); if (!s.m.has(k)) { s.m.set(k, v); ch = true; } } return ch; },
    contains: (s, [v]) => s.m.has(keyOf(v)),
    containsall: (s, [x], rt, n) => toArrayIter(x, rt, n).every(v => s.m.has(keyOf(v))),
    remove: (s, [v]) => s.m.delete(keyOf(v)),
    removeall: (s, [x], rt, n) => { let ch = false; for (const v of toArrayIter(x, rt, n)) ch = s.m.delete(keyOf(v)) || ch; return ch; },
    retainall: (s, [x], rt, n) => { const keep = new Set(toArrayIter(x, rt, n).map(keyOf)); let ch = false; for (const k of Array.from(s.m.keys())) if (!keep.has(k)) { s.m.delete(k); ch = true; } return ch; },
    size: s => s.m.size, isempty: s => s.m.size === 0, clear: s => { s.m.clear(); return null; },
    clone: s => { const r = new ApexSet(); for (const [k, v] of s.m) r.m.set(k, v); return r; },
    equals: (s, [o]) => valEq(s, o), tostring: s => str(s), hashcode: s => hashStr(keyOf(s))
  },
  map: {
    put: (m, [k, v]) => { const key = keyOf(k); const old = m.m.get(key); m.m.set(key, [k, v]); return old ? old[1] : null; },
    get: (m, [k]) => { const e = m.m.get(keyOf(k)); return e ? e[1] : null; },
    containskey: (m, [k]) => m.m.has(keyOf(k)),
    keyset: m => { const s = new ApexSet(); for (const [key, p] of m.m) s.m.set(key, p[0]); return s; },
    values: m => new ApexList(Array.from(m.m.values()).map(p => p[1])),
    remove: (m, [k]) => { const key = keyOf(k); const e = m.m.get(key); m.m.delete(key); return e ? e[1] : null; },
    size: m => m.m.size, isempty: m => m.m.size === 0, clear: m => { m.m.clear(); return null; },
    putall: (m, [o], rt, n) => { if (o instanceof ApexMap) { for (const [k, p] of o.m) m.m.set(k, [p[0], p[1]]); } else rt.throwEx('TypeException', 'putAll expects a Map in the playground', n); return null; },
    clone: m => { const r = new ApexMap(); for (const [k, p] of m.m) r.m.set(k, [p[0], p[1]]); return r; },
    deepclone: m => INSTANCE.map.clone(m),
    equals: (m, [o]) => valEq(m, o), tostring: m => str(m), hashcode: m => hashStr(keyOf(m))
  },
  enumval: {
    name: e => e.name, ordinal: e => e.ord, tostring: e => e.name, equals: (e, [o]) => e === o, hashcode: e => hashStr(e.name)
  },
  typeref: {
    newinstance: (t, a, rt, n) => rt.instantiate(t.cls, [], n), getname: t => t.name, tostring: t => t.name, equals: (t, [o]) => o instanceof TypeRef && o.cls === t.cls
  }
};
INSTANCE.long = INSTANCE.integer; INSTANCE.double = INSTANCE.decimal;
INSTANCE.id = INSTANCE.string;

delete STATIC.userinfo; delete STATIC.uuid;

/* ------------------------------------------------------------ registry */
const PRELUDE = `
public virtual class Exception {
  private String __msg; private Exception __cause;
  public String getMessage() { return __msg; }
  public void setMessage(String m) { __msg = m; }
  public Exception getCause() { return __cause; }
  public void initCause(Exception c) { __cause = c; }
  public String getTypeName() { return __typeName(this); }
  public String getStackTraceString() { return __stack(this); }
  public Integer getLineNumber() { return __line(this); }
}
${['AssertException', 'CalloutException', 'DmlException', 'JSONException', 'LimitException', 'ListException', 'MathException', 'NoAccessException',
  'NoDataFoundException', 'NoSuchElementException', 'NullPointerException', 'QueryException', 'SecurityException', 'SerializationException',
  'StringException', 'TypeException', 'InvalidParameterValueException', 'UnsupportedOperationException'].map(n => 'public virtual class ' + n + ' extends Exception {}').join('\n')}
`;
const PRIMS = new Set(['string', 'integer', 'long', 'decimal', 'double', 'boolean', 'date', 'datetime', 'object', 'id', 'void', 'blob', 'time']);
const COLLS = new Set(['list', 'set', 'map']);
const BUILTIN_IFACES = {
  comparable: [['compareto', 1]],
  iterable: [['iterator', 0]],
  iterator: [['hasnext', 0], ['next', 0]],
  comparator: [['compare', 2]]
};
const SOBJECT_NAMES = new Set(['account', 'contact', 'lead', 'opportunity', 'case', 'user', 'task', 'event', 'campaign', 'product2', 'order', 'contract', 'asset', 'pricebook2',
  'opportunitylineitem', 'quote', 'sobject', 'recordtype', 'profile', 'group', 'attachment', 'note', 'solution', 'entitlement', 'organization', 'database', 'schema', 'test', 'trigger', 'userinfo', 'limits', 'apexpages', 'messaging', 'site', 'label', 'crypto', 'encodingutil', 'url', 'http', 'httprequest', 'httpresponse', 'restcontext']);

class Cls {
  constructor(decl, outer, builtin) {
    this.decl = decl; this.outer = outer; this.builtin = !!builtin;
    this.name = outer ? outer.name + '.' + decl.name : decl.name;
    this.lc = decl.lc; this.kind = decl.kind;
    this.sup = null; this.ifaceNames = []; this.ifaces = [];
    this.statics = new Map(); this.inited = false; this.inner = new Map();
    this.methods = new Map(); this.props = new Map(); this.fieldTypes = new Map(); this.fieldNames = new Map();
    this.allTypes = new Set(); this.isExc = false; this.enumVals = null;
    for (const m of decl.methods) { if (!this.methods.has(m.lc)) this.methods.set(m.lc, []); this.methods.get(m.lc).push(m); }
    for (const p of decl.props) { this.props.set(p.lc, p); this.fieldTypes.set(p.lc, p.type); this.fieldNames.set(p.lc, p.name); }
    for (const f of decl.fields) { this.fieldTypes.set(f.lc, f.type); this.fieldNames.set(f.lc, f.name); }
  }
}

class Registry {
  constructor() { this.byQual = new Map(); this.bySimple = new Map(); this.all = []; this.dupes = []; }
  add(decl, outer, builtin) {
    const c = new Cls(decl, outer, builtin);
    const q = c.name.toLowerCase();
    if (this.byQual.has(q)) this.dupes.push(c);
    this.byQual.set(q, c);
    if (!outer) this.bySimple.set(c.lc, c);
    else if (!this.bySimple.has(c.lc)) this.bySimple.set(c.lc, c);
    this.all.push(c);
    if (outer) outer.inner.set(c.lc, c);
    for (const inn of decl.inner) this.add(inn, c, builtin);
    return c;
  }
  lookup(name, from) {
    let lc = name.toLowerCase();
    if (lc.startsWith('system.') || lc.startsWith('schema.')) lc = lc.slice(lc.indexOf('.') + 1);
    if (lc.indexOf('.') >= 0) { const hit = this.byQual.get(lc); if (hit) return hit; lc = lc.slice(lc.lastIndexOf('.') + 1); }
    for (let c = from; c; c = c.outer) { if (c.lc === lc) return c; if (c.inner.has(lc)) return c.inner.get(lc); }
    return this.bySimple.get(lc) || null;
  }
  link() {
    for (const c of this.all) {
      const d = c.decl;
      if (d.ext) { const s = this.lookup(d.ext.name, c.outer || c); c.sup = s; c.extUnresolved = !s; }
      for (const t of d.impl) {
        const it = this.lookup(t.name, c.outer || c);
        if (it) c.ifaces.push(it); else c.ifaceNames.push(t.lc.slice(t.lc.lastIndexOf('.') + 1));
        if (!it && !BUILTIN_IFACES[t.lc.slice(t.lc.lastIndexOf('.') + 1)]) c.badIface = t;
      }
    }
    const memo = new Set();
    const compute = (c, seen) => {
      if (c.allDone) return;
      if (seen.has(c)) return; seen.add(c);
      c.allTypes.add(c.lc); c.allTypes.add(c.name.toLowerCase());
      if (c.sup) { compute(c.sup, seen); c.sup.allTypes.forEach(t => c.allTypes.add(t)); }
      for (const i of c.ifaces) { compute(i, seen); i.allTypes.forEach(t => c.allTypes.add(t)); }
      for (const n of c.ifaceNames) c.allTypes.add(n);
      c.allTypes.add('object');
      c.isExc = c.allTypes.has('exception');
      c.allDone = true;
    };
    for (const c of this.all) compute(c, new Set());
  }
}

/* ------------------------------------------------------------ scopes */
class Scope {
  constructor(p) { this.p = p; this.v = new Map(); }
  find(lc) { for (let s = this; s; s = s.p) { const b = s.v.get(lc); if (b) return b; } return null; }
}

/* ------------------------------------------------------------ interpreter */
const STEP_LIMIT = 4000000;
const MAX_OUT = 3000;

class Interp {
  constructor(reg) {
    this.reg = reg; this.out = []; this.steps = 0; this.frames = []; this.curLine = 0; this.depth = 0;
  }
  lookupClass(lc, from) { return this.reg.lookup(lc, from); }
  tick(n) { if (++this.steps > STEP_LIMIT) this.throwEx('LimitException', 'Maximum CPU time exceeded', n); }
  debug(v, node) {
    if (this.out.length >= MAX_OUT) { if (this.out.length === MAX_OUT) this.out.push({ k: 'info', text: 'Output truncated after ' + MAX_OUT + ' lines.' }); return; }
    this.out.push({ k: 'debug', text: str(v), line: node ? node.line : this.curLine });
  }
  truthy(v, node) {
    if (v === true) return true; if (v === false) return false;
    this.throwEx('NullPointerException', 'Attempt to de-reference a null object', node);
  }
  fieldDisplayName(cls, lc) { for (let c = cls; c; c = c.sup) { const n = c.fieldNames.get(lc); if (n) return n; } return lc; }

  /* ---- exceptions */
  captureStack(node) {
    const lines = [];
    let line = node && node.line ? node.line : this.curLine;
    for (let i = this.frames.length - 1; i >= 0; i--) { lines.push(this.frames[i].name + ': line ' + line); line = this.frames[i].ret; }
    lines.push('anonymous: line ' + line);
    return lines;
  }
  makeEx(name, msg, node) {
    const cls = this.reg.lookup(name);
    const o = new Obj(cls);
    this.initFields(cls, o);
    o.f.set('__msg', msg === undefined ? null : msg);
    o.line = node && node.line ? node.line : this.curLine; o.stack = this.captureStack(node);
    return o;
  }
  throwEx(name, msg, node) { throw new ApexThrow(this.makeEx(name, msg, node)); }

  /* ---- class helpers */
  ensureStatic(cls) {
    if (cls.inited) return; cls.inited = true;
    if (cls.sup) this.ensureStatic(cls.sup);
    const d = cls.decl;
    if (d.kind === 'enum') {
      cls.enumVals = d.enumVals.map((nm, i) => new EnumVal(cls, nm, i));
      cls.enumVals.forEach(ev => cls.statics.set(ev.name.toLowerCase(), ev));
      return;
    }
    const env = { scope: new Scope(null), self: null, cls };
    for (const f of d.fields) if (f.mods.has('static')) cls.statics.set(f.lc, null);
    for (const p of d.props) if (p.mods.has('static') && !p.get && !p.set) cls.statics.set(p.lc, null);
    for (const f of d.fields) {
      if (f.mods.has('static') && f.init) { this.curLine = f.line; cls.statics.set(f.lc, this.coerce(this.ev(f.init, env), f.type, f)); }
    }
    for (const b of d.inits) if (b.static) this.ex(b.body, env);
  }
  initFields(cls, obj) {
    if (cls.sup) this.initFields(cls.sup, obj);
    for (const f of cls.decl.fields) if (!f.mods.has('static')) obj.f.set(f.lc, null);
    for (const p of cls.decl.props) if (!p.mods.has('static') && (!p.get && !p.set || (p.hasGet && !p.get && p.hasSet && !p.set))) obj.f.set(p.lc, null);
    for (const p of cls.decl.props) if (!p.mods.has('static') && !obj.f.has(p.lc) && (p.hasGet && !p.get)) obj.f.set(p.lc, null);
  }
  runFieldInits(cls, obj) {
    const env = { scope: new Scope(null), self: obj, cls };
    for (const f of cls.decl.fields) {
      if (!f.mods.has('static') && f.init) { this.curLine = f.line; obj.f.set(f.lc, this.coerce(this.ev(f.init, env), f.type, f)); }
    }
    for (const b of cls.decl.inits) if (!b.static) this.ex(b.body, env);
  }
  findProp(cls, lc) { for (let c = cls; c; c = c.sup) { const p = c.props.get(lc); if (p) return { p, cls: c }; } return null; }
  findStaticOwner(cls, lc) {
    for (let c = cls; c; c = c.outer) {
      for (let k = c; k; k = k.sup) { this.ensureStatic(k); if (k.statics.has(lc)) return k; }
    }
    return null;
  }
  findMethod(cls, lc, argc) {
    for (let c = cls; c; c = c.sup) {
      const list = c.methods.get(lc);
      if (list) for (const m of list) if (m.params.length === argc && m.body) return { cls: c, m };
    }
    return null;
  }
  matchScore(v, t) {
    if (v === null || v === undefined) return 1;
    const lc = t.dims > 0 ? 'list' : t.lc.slice(t.lc.lastIndexOf('.') + 1);
    switch (lc) {
      case 'object': return 1;
      case 'string': case 'id': return typeof v === 'string' ? 3 : -1;
      case 'integer': return typeof v === 'number' ? 3 : -1;
      case 'long': return typeof v === 'number' ? 2 : -1;
      case 'decimal': return v instanceof Dec && v.s >= 0 ? 3 : (typeof v === 'number' ? 2 : (v instanceof Dec ? 2 : -1));
      case 'double': return v instanceof Dec && v.s < 0 ? 3 : (isNum(v) ? 2 : -1);
      case 'boolean': return typeof v === 'boolean' ? 3 : -1;
      case 'list': return v instanceof ApexList ? 3 : -1;
      case 'set': return v instanceof ApexSet ? 3 : -1;
      case 'map': return v instanceof ApexMap ? 3 : -1;
      case 'date': return v instanceof ApexDate ? 3 : -1;
      case 'datetime': return v instanceof ApexDatetime ? 3 : -1;
      default:
        if (v instanceof Obj) return v.cls.allTypes.has(lc) ? (v.cls.lc === lc ? 3 : 2) : -1;
        if (v instanceof EnumVal) return v.en.lc === lc ? 3 : -1;
        if (v instanceof ApexList && (lc === 'iterable' )) return 2;
        if (v instanceof ApexSet && lc === 'iterable') return 2;
        return -1;
    }
  }
  pickBest(cands, args) {
    let best = null, bs = -1;
    for (const m of cands) {
      let s = 0, ok = true;
      for (let i = 0; i < args.length; i++) { const sc = this.matchScore(args[i], m.params[i].type); if (sc < 0) { ok = false; break; } s += sc; }
      if (ok && s > bs) { best = m; bs = s; }
    }
    return best;
  }
  findMethodBest(cls, lc, args) {
    for (let c = cls; c; c = c.sup) {
      const list = c.methods.get(lc);
      if (!list) continue;
      const cands = list.filter(m => m.params.length === args.length && m.body);
      if (cands.length) { const m = this.pickBest(cands, args); if (m) return { cls: c, m }; }
    }
    return null;
  }
  invokeMethod(objVal, lc, args, node) {
    if (objVal instanceof Obj) {
      const hit = this.findMethodBest(objVal.cls, lc.toLowerCase(), args);
      if (!hit) this.throwEx('TypeException', 'Method does not exist or incorrect signature: ' + lc + ' on ' + objVal.cls.name, node);
      return this.invoke(hit.cls, hit.m, objVal, args, node);
    }
    return this.dispatch(objVal, { lc: lc.toLowerCase(), name: lc, line: node && node.line }, args, { cls: null, self: null });
  }

  invoke(cls, m, self, args, node) {
    if (++this.depth > 1000) { this.depth = 0; this.throwEx('LimitException', 'Maximum stack depth has been reached.', node); }
    const sc = new Scope(null);
    for (let i = 0; i < m.params.length; i++) sc.v.set(m.params[i].lc, { v: this.coerce(args[i], m.params[i].type, node), t: m.params[i].type });
    this.frames.push({ name: cls.name + '.' + m.name, ret: this.curLine });
    const env = { scope: sc, self, cls };
    let res;
    try { res = this.execList(m.body.body, env); }
    finally { const f = this.frames.pop(); this.curLine = f.ret; this.depth--; }
    if (res && res.t === 'ret') return m.ret.lc === 'void' ? null : this.coerce(res.v, m.ret, node);
    return null;
  }
  invokeAccessor(cls, body, self, valueArg, node) {
    const sc = new Scope(null);
    if (valueArg !== undefined) sc.v.set('value', { v: valueArg, t: null });
    this.frames.push({ name: cls.name + '.accessor', ret: this.curLine });
    let res;
    try { res = this.execList(body.body, { scope: sc, self, cls }); }
    finally { const f = this.frames.pop(); this.curLine = f.ret; }
    return res && res.t === 'ret' ? res.v : null;
  }

  instantiate(cls, args, node) {
    if (cls.kind === 'interface') this.throwEx('TypeException', 'Interfaces cannot be instantiated: ' + cls.name, node);
    if (cls.decl.mods.has('abstract')) this.throwEx('TypeException', 'Abstract classes cannot be instantiated: ' + cls.name, node);
    if (cls.kind === 'enum') this.throwEx('TypeException', 'Enums cannot be instantiated: ' + cls.name, node);
    this.ensureStatic(cls);
    const obj = new Obj(cls);
    this.initFields(cls, obj);
    if (cls.isExc) { obj.line = node && node.line; obj.stack = this.captureStack(node); }
    this.runCtor(cls, obj, args, node);
    return obj;
  }
  runCtor(cls, obj, args, node) {
    if (cls.builtin && cls.lc === 'exception') {
      if (args.length === 1 && args[0] instanceof Obj && args[0].cls.isExc) { obj.f.set('__cause', args[0]); obj.f.set('__msg', args[0].f.get('__msg')); }
      else if (args.length >= 1) { obj.f.set('__msg', args[0] === null ? null : str(args[0])); if (args[1] instanceof Obj) obj.f.set('__cause', args[1]); }
      return;
    }
    const ctors = cls.decl.ctors;
    if (!ctors.length) {
      if (cls.sup) this.runCtor(cls.sup, obj, cls.isExc ? args : [], node);
      else if (args.length) this.throwEx('TypeException', 'Constructor not defined: [' + cls.name + '].<Constructor>(' + args.map(typeNameOf).join(', ') + ')', node);
      this.runFieldInits(cls, obj);
      return;
    }
    const cands = ctors.filter(c => c.params.length === args.length);
    const best = this.pickBest(cands, args);
    if (!best) this.throwEx('TypeException', 'Constructor not defined: [' + cls.name + '].<Constructor>(' + args.map(typeNameOf).join(', ') + ')', node);
    const sc = new Scope(null);
    best.params.forEach((p, i) => sc.v.set(p.lc, { v: this.coerce(args[i], p.type, node), t: p.type }));
    const env = { scope: sc, self: obj, cls };
    const body = best.body.body;
    let start = 0, delegated = false;
    this.frames.push({ name: cls.name + '.<init>', ret: this.curLine });
    try {
      const first = body[0];
      if (first && first.k === 'expr' && first.e.k === 'ctorcall') {
        start = 1;
        const cargs = first.e.args.map(a => this.ev(a, env));
        if (first.e.which === 'this') { this.runCtor(cls, obj, cargs, first.e); delegated = true; }
        else { if (cls.sup) this.runCtor(cls.sup, obj, cargs, first.e); }
      } else if (cls.sup) this.runCtor(cls.sup, obj, [], node);
      if (!delegated) this.runFieldInits(cls, obj);
      this.execList(body.slice(start), env);
    } finally { const f = this.frames.pop(); this.curLine = f.ret; }
  }

  /* ---- coercion */
  coerce(v, t, node) {
    if (!t || v === undefined) return v === undefined ? null : v;
    const lc = t.dims > 0 ? 'list' : t.lc.slice(t.lc.lastIndexOf('.') + 1);
    switch (lc) {
      case 'decimal': if (typeof v === 'number') return new Dec(v, 0); if (v instanceof Dec) return v.s < 0 ? new Dec(v.v, Math.min(8, (String(v.v).split('.')[1] || '').length)) : v; if (v === null) return v; break;
      case 'double': if (typeof v === 'number') return new Dec(v, -1); if (v instanceof Dec) return v.s < 0 ? v : new Dec(v.v, -1); if (v === null) return v; break;
      case 'integer': case 'long': if (typeof v === 'number' || v === null) return v; break;
      case 'string': case 'id': if (typeof v === 'string' || v === null) return v; break;
      case 'boolean': if (typeof v === 'boolean' || v === null) return v; break;
      case 'object': case 'list': case 'set': case 'map': case 'date': case 'datetime': case 'void': return v;
      default:
        if (v instanceof Obj) {
          const target = this.reg.lookup(t.name);
          if (target && !v.cls.allTypes.has(target.lc) && !v.cls.allTypes.has(target.name.toLowerCase())) break;
          return v;
        }
        return v;
    }
    this.throwEx('TypeException', 'Illegal assignment from ' + typeNameOf(v) + ' to ' + t.name, node);
  }
  instanceOfType(v, t) {
    if (v === null || v === undefined) return false;
    const lc = t.dims > 0 ? 'list' : t.lc.slice(t.lc.lastIndexOf('.') + 1);
    switch (lc) {
      case 'object': return true;
      case 'string': case 'id': return typeof v === 'string';
      case 'integer': case 'long': return typeof v === 'number';
      case 'decimal': return typeof v === 'number' || (v instanceof Dec && v.s >= 0);
      case 'double': return v instanceof Dec && v.s < 0;
      case 'boolean': return typeof v === 'boolean';
      case 'list': return v instanceof ApexList; case 'set': return v instanceof ApexSet; case 'map': return v instanceof ApexMap;
      case 'date': return v instanceof ApexDate; case 'datetime': return v instanceof ApexDatetime;
      default:
        if (v instanceof Obj) return v.cls.allTypes.has(lc) || v.cls.allTypes.has(t.lc);
        if (v instanceof EnumVal) return v.en.lc === lc;
        return false;
    }
  }

  /* ---- statements */
  execList(list, env) {
    for (let i = 0; i < list.length; i++) { const r = this.ex(list[i], env); if (r) return r; }
    return undefined;
  }
  ex(n, env) {
    this.tick(n); this.curLine = n.line;
    switch (n.k) {
      case 'expr': this.ev(n.e, env); return undefined;
      case 'local': {
        for (const d of n.decls) {
          const v = d.init ? this.coerce(this.ev(d.init, env), n.type, d) : null;
          env.scope.v.set(d.lc, { v, t: n.type });
        }
        return undefined;
      }
      case 'block': return this.execList(n.body, { scope: new Scope(env.scope), self: env.self, cls: env.cls });
      case 'empty': return undefined;
      case 'if': {
        if (this.truthy(this.ev(n.cond, env), n.cond)) return this.ex(n.then, env);
        if (n.els) return this.ex(n.els, env);
        return undefined;
      }
      case 'while': {
        while (this.truthy(this.ev(n.cond, env), n.cond)) {
          const r = this.ex(n.body, env);
          if (r) { if (r.t === 'brk') break; if (r.t === 'cnt') continue; return r; }
          this.tick(n);
        }
        return undefined;
      }
      case 'dowhile': {
        do {
          const r = this.ex(n.body, env);
          if (r) { if (r.t === 'brk') break; if (r.t === 'cnt') continue; return r; }
          this.tick(n);
        } while (this.truthy(this.ev(n.cond, env), n.cond));
        return undefined;
      }
      case 'for': {
        const e2 = { scope: new Scope(env.scope), self: env.self, cls: env.cls };
        if (n.init) for (const s of n.init) this.ex(s, e2);
        for (;;) {
          if (n.cond && !this.truthy(this.ev(n.cond, e2), n.cond)) break;
          const r = this.ex(n.body, e2);
          if (r) { if (r.t === 'brk') break; if (r.t !== 'cnt') return r; }
          for (const u of n.update) this.ev(u, e2);
          this.tick(n);
        }
        return undefined;
      }
      case 'foreach': {
        const coll = this.ev(n.iter, env);
        const run = (item) => {
          const e2 = { scope: new Scope(env.scope), self: env.self, cls: env.cls };
          e2.scope.v.set(n.lc, { v: this.coerce(item, n.type, n), t: n.type });
          return this.ex(n.body, e2);
        };
        if (coll === null || coll === undefined) this.throwEx('NullPointerException', 'Attempt to de-reference a null object', n.iter);
        if (coll instanceof ApexList || coll instanceof ApexSet) {
          const items = coll instanceof ApexList ? coll.a.slice() : Array.from(coll.m.values());
          for (const item of items) {
            const r = run(item);
            if (r) { if (r.t === 'brk') break; if (r.t !== 'cnt') return r; }
          }
          return undefined;
        }
        if (coll instanceof Obj) {
          let it = this.invokeMethod(coll, 'iterator', [], n);
          if (it instanceof ApexList) { for (const item of it.a.slice()) { const r = run(item); if (r) { if (r.t === 'brk') break; if (r.t !== 'cnt') return r; } } return undefined; }
          while (this.truthy(this.invokeMethod(it, 'hasNext', [], n), n)) {
            const r = run(this.invokeMethod(it, 'next', [], n));
            if (r) { if (r.t === 'brk') break; if (r.t !== 'cnt') return r; }
            this.tick(n);
          }
          return undefined;
        }
        this.throwEx('TypeException', 'Illegal for-each target: ' + typeNameOf(coll), n.iter);
        return undefined;
      }
      case 'return': return { t: 'ret', v: n.e ? this.ev(n.e, env) : null };
      case 'break': return { t: 'brk' };
      case 'continue': return { t: 'cnt' };
      case 'throw': {
        const v = this.ev(n.e, env);
        if (v === null) this.throwEx('NullPointerException', 'Attempt to de-reference a null object', n);
        if (!(v instanceof Obj) || !v.cls.isExc) this.throwEx('TypeException', 'Only exception objects can be thrown', n);
        if (!v.stack) { v.stack = this.captureStack(n); v.line = n.line; }
        throw new ApexThrow(v);
      }
      case 'try': return this.exTry(n, env);
      case 'switch': return this.exSwitch(n, env);
      default: throw new Error('Unknown statement ' + n.k);
    }
  }
  exTry(n, env) {
    let res;
    try {
      try { res = this.ex(n.body, env); }
      catch (e) {
        if (!(e instanceof ApexThrow)) throw e;
        const exObj = e.obj;
        let handled = false;
        if (!exObj.cls.allTypes.has('limitexception')) {
          for (const c of n.catches) {
            if (this.instanceOfType(exObj, c.type)) {
              const e2 = { scope: new Scope(env.scope), self: env.self, cls: env.cls };
              e2.scope.v.set(c.lc, { v: exObj, t: c.type });
              res = this.ex(c.body, e2); handled = true; break;
            }
          }
        }
        if (!handled) throw e;
      }
    } finally {
      if (n.fin) { const f = this.ex(n.fin, env); if (f) return f; }
    }
    return res;
  }
  exSwitch(n, env) {
    const subj = this.ev(n.subject, env);
    for (const w of n.whens) {
      if (w.kind === 'else') return this.ex(w.body, env);
      if (w.kind === 'type') {
        if (this.instanceOfType(subj, w.type)) {
          const e2 = { scope: new Scope(env.scope), self: env.self, cls: env.cls };
          e2.scope.v.set(w.lc, { v: subj, t: w.type });
          return this.ex(w.body, e2);
        }
        continue;
      }
      for (const vn of w.values) {
        let match;
        if (subj instanceof EnumVal && vn.k === 'id') match = vn.lc === subj.name.toLowerCase();
        else { const v = this.ev(vn, env); match = (typeof subj === 'string' && typeof v === 'string') ? subj === v : valEq(subj, v); }
        if (match) return this.ex(w.body, env);
      }
    }
    return undefined;
  }
}

STATIC.math.pi = new Dec(Math.PI, -1); STATIC.math.e = new Dec(Math.E, -1);
const NPE_MSG = 'Attempt to de-reference a null object';
const lastSeg = s => s.slice(s.lastIndexOf('.') + 1);

Object.assign(Interp.prototype, {
  ev(n, env) {
    switch (n.k) {
      case 'num':
        if (n.val === undefined) n.val = (n.kind === 'int' || n.kind === 'long') ? parseInt(n.text, 10) : new Dec(parseFloat(n.text), n.kind === 'dbl' ? -1 : scaleOfText(n.text));
        return n.val;
      case 'str': return n.v;
      case 'bool': return n.v;
      case 'null': return null;
      case 'paren': return this.ev(n.e, env);
      case 'id': return this.evId(n, env);
      case 'this': return env.self;
      case 'super': return env.self;
      case 'member': return this.evMember(n, env);
      case 'call': return this.evCall(n, env);
      case 'index': {
        const o = this.ev(n.obj, env);
        const i = this.ev(n.idx, env);
        if (o === null) this.throwEx('NullPointerException', NPE_MSG, n);
        if (o instanceof ApexList) { idxCheck(this, o, i, n); return o.a[i]; }
        this.throwEx('TypeException', 'Only Lists can be indexed with [ ]', n);
        return null;
      }
      case 'unary': {
        const v = this.ev(n.e, env);
        if (n.op === '!') return !this.truthy(v, n);
        if (v === null) this.throwEx('NullPointerException', NPE_MSG, n);
        if (n.op === '-') return v instanceof Dec ? new Dec(-v.v, v.s) : -v;
        if (n.op === '~') return ~v;
        return v;
      }
      case 'bin': return this.evBin(n, env);
      case 'ternary': return this.truthy(this.ev(n.cond, env), n.cond) ? this.ev(n.a, env) : this.ev(n.b, env);
      case 'coalesce': { const l = this.ev(n.left, env); return l !== null && l !== undefined ? l : this.ev(n.right, env); }
      case 'assign': return this.evAssign(n, env);
      case 'incdec': {
        const cur = this.ev(n.target, env);
        const nv = arith(n.op === '++' ? '+' : '-', cur, 1, n, this);
        this.writeTarget(n.target, nv, env, n);
        return n.prefix ? nv : cur;
      }
      case 'cast': return this.evCast(n, env);
      case 'instanceof': return this.instanceOfType(this.ev(n.e, env), n.type);
      case 'new': return this.evNew(n, env);
      case 'newlist': return new ApexList(n.items.map(i => this.ev(i, env)));
      case 'newset': { const s = new ApexSet(); for (const i of n.items) { const v = this.ev(i, env); s.m.set(keyOf(v), v); } return s; }
      case 'newmap': { const m = new ApexMap(); for (const [k, v] of n.pairs) { const kv = this.ev(k, env); m.m.set(keyOf(kv), [kv, this.ev(v, env)]); } return m; }
      case 'newarray': {
        const sz = this.ev(n.size, env);
        if (sz === null) this.throwEx('NullPointerException', NPE_MSG, n);
        if (sz < 0) this.throwEx('ListException', 'List size cannot be negative: ' + sz, n);
        return new ApexList(new Array(sz).fill(null));
      }
      case 'ctorcall': this.throwEx('TypeException', 'Constructor calls must be the first statement of a constructor', n); return null;
      default: throw new Error('Unknown expression ' + n.k);
    }
  },

  evId(n, env) {
    const b = env.scope.find(n.lc);
    if (b) return b.v;
    if (env.self) {
      const pr = this.findProp(env.self.cls, n.lc);
      if (pr) return pr.p.get ? this.invokeAccessor(pr.cls, pr.p.get, env.self, undefined, n) : env.self.f.get(n.lc);
      if (env.self.f.has(n.lc)) return env.self.f.get(n.lc);
    }
    if (env.cls) {
      const owner = this.findStaticOwner(env.cls, n.lc);
      if (owner) return owner.statics.get(n.lc);
    }
    const c = this.reg.lookup(n.name, env.cls);
    if (c) { this.ensureStatic(c); return new ClsRef(c); }
    if (STATIC[n.lc] !== undefined) return new NsRef(n.lc);
    this.throwEx('TypeException', 'Variable does not exist: ' + n.name, n);
    return null;
  },

  evMember(n, env) {
    const t = this.ev(n.obj, env);
    if (t === null || t === undefined) { if (n.safe) return null; this.throwEx('NullPointerException', NPE_MSG, n); }
    return this.getMember(t, n);
  },
  getMember(t, n) {
    if (t instanceof Obj) {
      const pr = this.findProp(t.cls, n.lc);
      if (pr) return pr.p.get ? this.invokeAccessor(pr.cls, pr.p.get, t, undefined, n) : t.f.get(n.lc);
      if (t.f.has(n.lc)) return t.f.get(n.lc);
    } else if (t instanceof ClsRef) {
      if (n.lc === 'class') return new TypeRef(t.cls.name, t.cls);
      this.ensureStatic(t.cls);
      const owner = this.findStaticOwner(t.cls, n.lc);
      if (owner) return owner.statics.get(n.lc);
      const inner = t.cls.inner.get(n.lc);
      if (inner) { this.ensureStatic(inner); return new ClsRef(inner); }
    } else if (t instanceof NsRef) {
      const v = STATIC[t.ns][n.lc];
      if (v !== undefined && typeof v !== 'function') return v;
    }
    this.throwEx('TypeException', 'Variable does not exist: ' + n.name, n);
    return null;
  },

  evCall(n, env) {
    const args = n.args.map(a => this.ev(a, env));
    this.curLine = n.line;
    if (!n.obj) {
      if (n.lc.charAt(0) === '_' && n.lc.charAt(1) === '_') return this.nativeCall(n, args);
      if (env.self) {
        const hit = this.findMethodBest(env.self.cls, n.lc, args);
        if (hit) return this.invoke(hit.cls, hit.m, hit.m.mods.has('static') ? null : env.self, args, n);
      }
      for (let c = env.cls; c; c = c.outer) {
        const hit = this.findMethodBest(c, n.lc, args);
        if (hit) return this.invoke(hit.cls, hit.m, hit.m.mods.has('static') ? null : (c === env.cls ? env.self : null), args, n);
      }
      this.throwEx('TypeException', 'Method does not exist or incorrect signature: void ' + n.name + '(' + args.map(typeNameOf).join(', ') + ')', n);
    }
    if (n.obj.k === 'super') {
      const sup = env.cls && env.cls.sup;
      const hit = sup ? this.findMethodBest(sup, n.lc, args) : null;
      if (!hit) this.throwEx('TypeException', 'Method does not exist or incorrect signature: super.' + n.name, n);
      return this.invoke(hit.cls, hit.m, env.self, args, n);
    }
    const target = this.ev(n.obj, env);
    if ((target === null || target === undefined) && n.safe) return null;
    return this.dispatch(target, n, args, env);
  },

  nativeCall(n, args) {
    const o = args[0];
    if (n.lc === '__typename') return o.cls.name;
    if (n.lc === '__stack') return (o.stack || []).join('\n');
    if (n.lc === '__line') return o.line || 0;
    return null;
  },

  dispatch(target, n, args, env) {
    const lc = n.lc;
    if (target === null || target === undefined) this.throwEx('NullPointerException', NPE_MSG, n);
    if (target instanceof Obj) {
      const hit = this.findMethodBest(target.cls, lc, args);
      if (hit) return this.invoke(hit.cls, hit.m, target, args, n);
      if (lc === 'equals' && args.length === 1) return target === args[0];
      if (lc === 'hashcode' && args.length === 0) return target.id;
      if (lc === 'tostring' && args.length === 0) return str(target);
      this.throwEx('TypeException', 'Method does not exist or incorrect signature: void ' + n.name + '(' + args.map(typeNameOf).join(', ') + ') from the type ' + target.cls.name, n);
    }
    if (target instanceof ClsRef) {
      const cls = target.cls;
      this.ensureStatic(cls);
      if (cls.kind === 'enum') {
        if (lc === 'values') return new ApexList(cls.enumVals.slice());
        if (lc === 'valueof') {
          const ev = cls.enumVals.find(e => e.name === args[0]);
          if (!ev) this.throwEx('NoSuchElementException', 'No enum constant ' + cls.name + '.' + str(args[0]), n);
          return ev;
        }
      }
      const hit = this.findMethodBest(cls, lc, args);
      if (!hit) this.throwEx('TypeException', 'Method does not exist or incorrect signature: void ' + n.name + '(' + args.map(typeNameOf).join(', ') + ') from the type ' + cls.name, n);
      return this.invoke(hit.cls, hit.m, null, args, n);
    }
    if (target instanceof NsRef) {
      const fn = STATIC[target.ns] && STATIC[target.ns][lc];
      if (typeof fn !== 'function') this.throwEx('TypeException', 'Method does not exist or incorrect signature: void ' + n.name + '() from the type ' + target.ns, n);
      return fn(args, this, n);
    }
    let tbl;
    if (typeof target === 'string') tbl = INSTANCE.string;
    else if (typeof target === 'number') tbl = INSTANCE.integer;
    else if (target instanceof Dec) tbl = target.s < 0 ? INSTANCE.double : INSTANCE.decimal;
    else if (typeof target === 'boolean') tbl = INSTANCE.boolean;
    else if (target instanceof ApexList) tbl = INSTANCE.list;
    else if (target instanceof ApexSet) tbl = INSTANCE.set;
    else if (target instanceof ApexMap) tbl = INSTANCE.map;
    else if (target instanceof ApexDate) tbl = INSTANCE.date;
    else if (target instanceof ApexDatetime) tbl = INSTANCE.datetime;
    else if (target instanceof EnumVal) tbl = INSTANCE.enumval;
    else if (target instanceof TypeRef) tbl = INSTANCE.typeref;
    const fn = tbl && tbl[lc];
    if (typeof fn !== 'function') this.throwEx('TypeException', 'Method does not exist or incorrect signature: void ' + n.name + '() from the type ' + typeNameOf(target), n);
    return fn(target, args, this, n);
  },

  evBin(n, env) {
    const op = n.op;
    if (op === '&&') { return this.truthy(this.ev(n.left, env), n.left) ? this.truthy(this.ev(n.right, env), n.right) : false; }
    if (op === '||') { return this.truthy(this.ev(n.left, env), n.left) ? true : this.truthy(this.ev(n.right, env), n.right); }
    const a = this.ev(n.left, env), b = this.ev(n.right, env);
    return this.binop(op, a, b, n);
  },
  binop(op, a, b, n) {
    switch (op) {
      case '+': case '-': case '*': case '/': case '%': return arith(op, a, b, n, this);
      case '==': return valEq(a, b);
      case '!=': return !valEq(a, b);
      case '===': return exactEq(a, b);
      case '!==': return !exactEq(a, b);
      case '<': case '>': case '<=': case '>=': {
        if (a === null || a === undefined || b === null || b === undefined) return false;
        const c = compareVals(a, b);
        if (c === null) this.throwEx('TypeException', 'Comparison arguments must be compatible types: ' + typeNameOf(a) + ', ' + typeNameOf(b), n);
        return op === '<' ? c < 0 : op === '>' ? c > 0 : op === '<=' ? c <= 0 : c >= 0;
      }
      case '&': return typeof a === 'boolean' ? a && b : a & b;
      case '|': return typeof a === 'boolean' ? a || b : a | b;
      case '^': return typeof a === 'boolean' ? a !== b : a ^ b;
      case '<<': return a << b; case '>>': return a >> b; case '>>>': return a >>> b;
    }
    throw new Error('Unknown operator ' + op);
  },

  evAssign(n, env) {
    const t = n.target;
    let val;
    if (n.op === '=') val = this.ev(n.value, env);
    else { const cur = this.ev(t, env); val = this.binop(n.op.slice(0, -1), cur, this.ev(n.value, env), n); }
    return this.writeTarget(t, val, env, n);
  },
  setField(obj, lc, val, n) {
    const pr = this.findProp(obj.cls, lc);
    if (pr) {
      if (pr.p.set) { this.invokeAccessor(pr.cls, pr.p.set, obj, this.coerce(val, pr.p.type, n), n); return val; }
      if (!pr.p.hasSet) this.throwEx('TypeException', 'Property ' + pr.p.name + ' is read-only', n);
      val = this.coerce(val, pr.p.type, n); obj.f.set(lc, val); return val;
    }
    if (obj.f.has(lc)) {
      let t = null; for (let c = obj.cls; c && !t; c = c.sup) t = c.fieldTypes.get(lc) || null;
      val = this.coerce(val, t, n); obj.f.set(lc, val); return val;
    }
    this.throwEx('TypeException', 'Variable does not exist: ' + lc, n);
  },
  writeTarget(t, val, env, n) {
    if (t.k === 'id') {
      const b = env.scope.find(t.lc);
      if (b) { b.v = this.coerce(val, b.t, n); return b.v; }
      if (env.self && (env.self.f.has(t.lc) || this.findProp(env.self.cls, t.lc))) return this.setField(env.self, t.lc, val, n);
      if (env.cls) {
        const owner = this.findStaticOwner(env.cls, t.lc);
        if (owner) {
          let ty = null; for (let c = owner; c && !ty; c = c.sup) ty = c.fieldTypes.get(t.lc) || null;
          val = this.coerce(val, ty, n); owner.statics.set(t.lc, val); return val;
        }
      }
      this.throwEx('TypeException', 'Variable does not exist: ' + t.name, n);
    }
    if (t.k === 'member') {
      const o = this.ev(t.obj, env);
      if (o === null || o === undefined) this.throwEx('NullPointerException', NPE_MSG, n);
      if (o instanceof Obj) return this.setField(o, t.lc, val, n);
      if (o instanceof ClsRef) {
        this.ensureStatic(o.cls);
        const owner = this.findStaticOwner(o.cls, t.lc);
        if (owner) {
          let ty = null; for (let c = owner; c && !ty; c = c.sup) ty = c.fieldTypes.get(t.lc) || null;
          val = this.coerce(val, ty, n); owner.statics.set(t.lc, val); return val;
        }
      }
      this.throwEx('TypeException', 'Variable does not exist: ' + t.name, n);
    }
    if (t.k === 'index') {
      const o = this.ev(t.obj, env), i = this.ev(t.idx, env);
      if (o === null) this.throwEx('NullPointerException', NPE_MSG, n);
      if (o instanceof ApexList) { idxCheck(this, o, i, n); o.a[i] = val; return val; }
    }
    this.throwEx('TypeException', 'Expression cannot be assigned', n);
  },

  evCast(n, env) {
    const v = this.ev(n.e, env);
    if (v === null || v === undefined) return null;
    const lc = n.type.dims > 0 ? 'list' : lastSeg(n.type.lc);
    if (['object', 'list', 'set', 'map'].includes(lc)) return v;
    if (!this.instanceOfType(v, n.type)) {
      if ((lc === 'decimal' || lc === 'double') && isNum(v)) return this.coerce(v, n.type, n);
      this.throwEx('TypeException', 'Invalid conversion from runtime type ' + typeNameOf(v) + ' to ' + n.type.name, n);
    }
    return this.coerce(v, n.type, n);
  },

  evNew(n, env) {
    const args = n.args.map(a => this.ev(a, env));
    const lc = lastSeg(n.type.lc);
    const user = this.reg.lookup(n.type.name, env.cls);
    if (user) return this.instantiate(user, args, n);
    if (lc === 'list') {
      const l = new ApexList();
      if (args[0] instanceof ApexList) l.a = args[0].a.slice(); else if (args[0] instanceof ApexSet) l.a = Array.from(args[0].m.values());
      return l;
    }
    if (lc === 'set') {
      const s = new ApexSet();
      if (args[0] instanceof ApexList) for (const v of args[0].a) s.m.set(keyOf(v), v);
      else if (args[0] instanceof ApexSet) for (const [k, v] of args[0].m) s.m.set(k, v);
      return s;
    }
    if (lc === 'map') { const m = new ApexMap(); if (args[0] instanceof ApexMap) for (const [k, p] of args[0].m) m.m.set(k, [p[0], p[1]]); return m; }
        this.throwEx('TypeException', 'Invalid type: ' + n.type.name, n);
    return null;
  }
});

/* ------------------------------------------------------------ analyzer (compile-time checks) */
class AScope {
  constructor(p) { this.p = p; this.v = new Map(); }
  find(lc) { for (let s = this; s; s = s.p) { const t = s.v.get(lc); if (t !== undefined) return t; } return undefined; }
}
const NUM_RANK = { integer: 1, long: 2, decimal: 3, double: 3 };
const SUBSET_NOTE = ' (the playground supports a subset of the Apex library)';

function tLc(t) { return t.dims > 0 ? 'list' : lastSeg(t.lc); }

function analyze(unit, reg) {
  const errs = [];
  const seen = new Set();
  const err = (node, msg) => {
    const key = (node.line || 1) + ':' + msg;
    if (errs.length >= 12 || seen.has(key)) return; seen.add(key);
    errs.push({ line: node.line || 1, col: node.col || 1, message: msg });
  };

  function clsOf(name, from) { return reg.lookup(name, from); }
  function validType(t, from, node, allowVoid) {
    const lc = lastSeg(t.lc);
    if (lc === 'void' && allowVoid) return;
    if (PRIMS.has(lc) && lc !== 'void') { /* ok */ }
    else if (COLLS.has(lc)) { /* ok */ }
    else if (lc === 'type' || BUILTIN_IFACES[lc]) { /* ok */ }
    else if (clsOf(t.name, from)) { /* ok */ }
    else if (SOBJECT_NAMES.has(lc)) err(t, "'" + t.name + "' is an org object or platform class that needs a Salesforce org (metadata). It isn't available in the playground: use your own classes instead.");
    else err(t, 'Invalid type: ' + t.name);
    for (const a of t.args || []) validType(a, from, node, false);
  }
  function compat(tgt, src) {
    if (!tgt || !src || tgt === src) return true;
    if (src === 'null' || tgt === 'object') return true;
    if (NUM_RANK[tgt] && NUM_RANK[src]) {
      if (tgt === 'integer') return src === 'integer';
      if (tgt === 'long') return src === 'integer' || src === 'long';
      return true;
    }
    if ((tgt === 'string' && src === 'id') || (tgt === 'id' && src === 'string')) return true;
    if (COLLS.has(tgt) || COLLS.has(src)) return tgt === src || tgt === 'iterable' || tgt === 'object';
    if ((tgt === 'datetime' && src === 'date')) return true;
    const t = reg.bySimple.get(tgt), s = reg.bySimple.get(src);
    if (t && s) return s.allTypes.has(t.lc);
    if (t && PRIMS.has(src)) return false;
    if (s && PRIMS.has(tgt)) return false;
    if (BUILTIN_IFACES[tgt] && s) return s.allTypes.has(tgt);
    if (PRIMS.has(tgt) && PRIMS.has(src)) return false;
    return true;
  }
  const show = lc => (lc === 'null' ? 'null' : (reg.bySimple.get(lc) ? reg.bySimple.get(lc).name : lc.charAt(0).toUpperCase() + lc.slice(1)));
  const sigArgs = types => types.map(t => (typeof t === 'string' ? show(t) : 'Object')).join(', ');

  function classMethods(c, lc) { const out = []; for (let k = c; k; k = k.sup) { const l = k.methods.get(lc); if (l) l.forEach(m => out.push({ m, cls: k })); } return out; }
  function ifaceMethods(c, out, seenI) {
    for (const i of c.ifaces) {
      if (seenI.has(i)) continue; seenI.add(i);
      for (const m of i.decl.methods) out.push({ lc: m.lc, argc: m.params.length, m, from: i.name });
      ifaceMethods(i, out, seenI);
    }
    for (const nm of c.ifaceNames) if (BUILTIN_IFACES[nm]) for (const [lc, argc] of BUILTIN_IFACES[nm]) out.push({ lc, argc, m: null, from: nm });
  }
  function methodSig(m) { return (m.ret ? m.ret.name : 'void') + ' ' + m.name + '(' + m.params.map(p => p.type.name).join(', ') + ')'; }

  function canComplete(s) {
    if (!s) return true;
    switch (s.k) {
      case 'return': case 'throw': return false;
      case 'block': { for (const x of s.body) if (!canComplete(x)) return false; return true; }
      case 'if': return !s.els || canComplete(s.then) || canComplete(s.els);
      case 'while': return !(s.cond.k === 'bool' && s.cond.v === true);
      case 'dowhile': return !(s.cond.k === 'bool' && s.cond.v === true) && canComplete(s.body);
      case 'for': return !(s.cond === null);
      case 'try': {
        if (s.fin && !canComplete(s.fin)) return false;
        return canComplete(s.body) || s.catches.some(c => canComplete(c.body));
      }
      case 'switch': return !s.whens.some(w => w.kind === 'else') || s.whens.some(w => canComplete(w.body));
      default: return true;
    }
  }

  function checkClass(c) {
    const d = c.decl;
    if (d.ext) {
      if (c.extUnresolved) validType(d.ext, c.outer, d);
      else if (c.sup.kind === 'interface') err(d.ext, 'Class ' + c.name + ' cannot extend an interface. Use implements instead');
      else if (c.sup.kind === 'enum') err(d.ext, 'Enums cannot be extended');
      else if (!c.sup.decl.mods.has('virtual') && !c.sup.decl.mods.has('abstract')) err(d.ext, 'Class ' + c.sup.name + ' cannot be extended: declare it virtual or abstract');
    }
    for (const t of d.impl) {
      const it = clsOf(t.name, c.outer || c);
      if (!it) { if (!BUILTIN_IFACES[lastSeg(t.lc)]) validType(t, c.outer || c, d); }
      else if (it.kind !== 'interface' && d.kind === 'class') err(t, "Class '" + it.name + "' is not an interface, so it can't be used with implements");
    }
    if (d.kind === 'class' && !d.mods.has('abstract')) {
      const need = [];
      for (let k = c; k; k = k.sup) ifaceMethods(k, need, new Set());
      for (const r of need) {
        const found = classMethods(c, r.lc).some(x => x.m.params.length === r.argc && x.m.body);
        if (!found) err(d, 'Class ' + c.name + ' must implement the method: ' + (r.m ? methodSig(r.m) : r.lc + '(...)') + ' from ' + r.from);
      }
      for (let k = c.sup; k; k = k.sup) {
        for (const m of k.decl.methods) {
          if (!m.body && m.mods.has('abstract')) {
            const impl = classMethods(c, m.lc).some(x => x.m.params.length === m.params.length && x.m.body);
            if (!impl) err(d, 'Class ' + c.name + ' must implement the abstract method: ' + methodSig(m) + ' from ' + k.name);
          }
        }
      }
    }
    const memberNames = new Map();
    for (const x of [...d.fields, ...d.props]) {
      if (memberNames.has(x.lc)) err(x, 'Duplicate field: ' + x.name + ' (names are not case-sensitive in Apex)');
      memberNames.set(x.lc, true);
    }
    const sigs = new Map();
    for (const m of d.methods) {
      const key = m.lc + '(' + m.params.map(p => tLc(p.type)).join(',') + ')';
      if (sigs.has(key)) err(m, 'Duplicate method: ' + methodSig(m));
      sigs.set(key, true);
    }
    for (const m of d.methods) {
      if (m.mods.has('override')) {
        const objectMethod = (m.lc === 'tostring' && m.params.length === 0) || (m.lc === 'equals' && m.params.length === 1) || (m.lc === 'hashcode' && m.params.length === 0);
        const inherited = objectMethod || (c.sup ? classMethods(c.sup, m.lc).some(x => x.m.params.length === m.params.length && (x.m.mods.has('virtual') || x.m.mods.has('abstract') || x.m.mods.has('override'))) : false);
        if (!inherited) err(m, 'Method does not override an inherited method: ' + methodSig(m));
      }
      if (c.sup && !m.mods.has('override') && !m.mods.has('static')) {
        const parent = classMethods(c.sup, m.lc).find(x => x.m.params.length === m.params.length && (x.m.mods.has('virtual') || x.m.mods.has('abstract')));
        if (parent) err(m, 'Overriding method must use the override keyword: ' + methodSig(m));
      }
      validType(m.ret, c, m, true);
      for (const p of m.params) validType(p.type, c, m);
      if (m.body) {
        const sc = new AScope(null);
        for (const p of m.params) sc.v.set(p.lc, { type: tLc(p.type), node: p });
        const ctx = { cls: c, static: m.mods.has('static'), ret: m.ret.lc === 'void' ? 'void' : tLc(m.ret), loop: 0 };
        checkBlockBody(m.body.body, sc, ctx);
        if (ctx.ret !== 'void' && canComplete(m.body)) err(m, 'Missing return statement in method ' + m.name);
      } else if (d.kind === 'class' && !m.mods.has('abstract') && !m.mods.has('global') && !m.mods.has('webservice')) {
        if (!d.mods.has('abstract')) err(m, 'Method ' + m.name + ' must have a body (or be declared abstract)');
      }
    }
    for (const k of d.ctors) {
      const sc = new AScope(null);
      for (const p of k.params) { validType(p.type, c, k); sc.v.set(p.lc, { type: tLc(p.type), node: p }); }
      const ctx = { cls: c, static: false, ret: 'void', loop: 0, inCtor: true };
      const body = k.body.body;
      body.forEach((st, i) => {
        if (st.k === 'expr' && st.e.k === 'ctorcall') {
          if (i !== 0) err(st, 'Constructor call must be the first statement of a constructor');
          st.e.args.forEach(a => checkExpr(a, sc, ctx));
        } else checkStmt(st, sc, ctx);
      });
    }
    for (const f of d.fields) {
      validType(f.type, c, f);
      if (f.init) {
        const t = checkExpr(f.init, new AScope(null), { cls: c, static: f.mods.has('static'), ret: 'void', loop: 0 });
        if (typeof t === 'string' && !compat(tLc(f.type), t)) err(f.init, 'Illegal assignment from ' + show(t) + ' to ' + show(tLc(f.type)));
      }
    }
    for (const p of d.props) {
      validType(p.type, c, p);
      for (const body of [p.get, p.set]) if (body) {
        const sc = new AScope(null); if (body === p.set) sc.v.set('value', { type: tLc(p.type) });
        checkBlockBody(body.body, sc, { cls: c, static: p.mods.has('static'), ret: body === p.get ? tLc(p.type) : 'void', loop: 0 });
      }
    }
    for (const b of d.inits) checkBlockBody(b.body.body, new AScope(null), { cls: c, static: b.static, ret: 'void', loop: 0 });
  }

  function declare(sc, lc, type, node) {
    if (sc.find(lc) !== undefined) err(node, 'Duplicate variable: ' + node.name);
    sc.v.set(lc, { type, node });
  }
  function checkBlockBody(list, sc, ctx) { for (const s of list) checkStmt(s, sc, ctx); }
  function condCheck(e, sc, ctx) {
    const t = checkExpr(e, sc, ctx);
    if (typeof t === 'string' && t !== 'boolean' && t !== 'null') err(e, 'Condition expression must be of type Boolean, not ' + show(t));
  }

  function checkStmt(s, sc, ctx) {
    switch (s.k) {
      case 'expr': checkExpr(s.e, sc, ctx); return;
      case 'local': {
        validType(s.type, ctx.cls, s);
        for (const d of s.decls) {
          if (d.init) {
            const t = checkExpr(d.init, sc, ctx);
            if (typeof t === 'string' && !compat(tLc(s.type), t)) err(d.init, 'Illegal assignment from ' + show(t) + ' to ' + show(tLc(s.type)));
          }
          declare(sc, d.lc, tLc(s.type), d);
        }
        return;
      }
      case 'block': checkBlockBody(s.body, new AScope(sc), ctx); return;
      case 'if': condCheck(s.cond, sc, ctx); checkStmt(s.then, new AScope(sc), ctx); if (s.els) checkStmt(s.els, new AScope(sc), ctx); return;
      case 'while': case 'dowhile': condCheck(s.cond, sc, ctx); ctx.loop++; checkStmt(s.body, new AScope(sc), ctx); ctx.loop--; return;
      case 'for': {
        const s2 = new AScope(sc);
        (s.init || []).forEach(i => checkStmt(i, s2, ctx));
        if (s.cond) condCheck(s.cond, s2, ctx);
        s.update.forEach(u => checkExpr(u, s2, ctx));
        ctx.loop++; checkStmt(s.body, new AScope(s2), ctx); ctx.loop--; return;
      }
      case 'foreach': {
        const s2 = new AScope(sc);
        validType(s.type, ctx.cls, s);
        const it = checkExpr(s.iter, sc, ctx);
        if (typeof it === 'string' && ['string', 'integer', 'long', 'decimal', 'double', 'boolean', 'map'].includes(it)) err(s.iter, 'Illegal for-each target: ' + show(it) + ' is not iterable. Use a List or Set (for a Map use map.keySet() or map.values())');
        declare(s2, s.lc, tLc(s.type), s);
        ctx.loop++; checkStmt(s.body, new AScope(s2), ctx); ctx.loop--; return;
      }
      case 'return': {
        if (s.e) {
          const t = checkExpr(s.e, sc, ctx);
          if (ctx.ret === 'void') err(s, 'Illegal return value in a void method or constructor');
          else if (typeof t === 'string' && !compat(ctx.ret, t)) err(s.e, 'Illegal assignment from ' + show(t) + ' to ' + show(ctx.ret));
        } else if (ctx.ret !== 'void' && ctx.ret !== undefined) err(s, 'Return value expected');
        return;
      }
      case 'break': case 'continue': if (!ctx.loop) err(s, (s.k === 'break' ? 'break' : 'continue') + ' must be inside a loop'); return;
      case 'throw': {
        const t = checkExpr(s.e, sc, ctx);
        if (typeof t === 'string') { const c = reg.bySimple.get(t); if ((c && !c.isExc) || PRIMS.has(t)) err(s.e, 'Only exceptions can be thrown, not ' + show(t)); }
        return;
      }
      case 'try': {
        checkStmt(s.body, new AScope(sc), ctx);
        for (const c of s.catches) {
          validType(c.type, ctx.cls, c);
          const cc = clsOf(c.type.name, ctx.cls);
          if (cc && !cc.isExc) err(c.type, 'Catch type must be an Exception, not ' + cc.name);
          const s2 = new AScope(sc); declare(s2, c.lc, tLc(c.type), c);
          checkStmt(c.body, s2, ctx);
        }
        if (s.fin) checkStmt(s.fin, new AScope(sc), ctx);
        return;
      }
      case 'switch': {
        checkExpr(s.subject, sc, ctx);
        for (const w of s.whens) {
          if (w.kind === 'values') w.values.forEach(v => { if (v.k !== 'id') checkExpr(v, sc, ctx); });
          if (w.kind === 'type') { validType(w.type, ctx.cls, w); const s2 = new AScope(sc); declare(s2, w.lc, tLc(w.type), w); checkStmt(w.body, s2, ctx); continue; }
          checkStmt(w.body, new AScope(sc), ctx);
        }
        return;
      }
      default: return;
    }
  }

  const fieldType = (c, lc) => { for (let k = c; k; k = k.sup) { const t = k.fieldTypes.get(lc); if (t) return { t, cls: k }; } return null; };
  const isStaticField = (k, lc) => {
    const f = k.decl.fields.find(x => x.lc === lc); if (f) return f.mods.has('static');
    const p = k.decl.props.find(x => x.lc === lc); return p ? p.mods.has('static') : false;
  };

  function checkArgsAgainst(cands, argTypes, node, name, fromName) {
    // cands: method decls with right name. Report mismatch when arity fits but types clearly clash.
    const byArity = cands.filter(m => m.params.length === argTypes.length);
    if (!byArity.length) return false;
    const ok = byArity.some(m => m.params.every((p, i) => compat(tLc(p.type), typeof argTypes[i] === 'string' ? argTypes[i] : null)));
    return ok;
  }

  function checkExpr(e, sc, ctx) {
    switch (e.k) {
      case 'num': return e.kind === 'int' ? 'integer' : e.kind === 'long' ? 'long' : e.kind === 'dbl' ? 'double' : 'decimal';
      case 'str': return 'string';
      case 'bool': return 'boolean';
      case 'null': return 'null';
      case 'paren': return checkExpr(e.e, sc, ctx);
      case 'this': if (ctx.static) err(e, 'Illegal use of this in a static context'); return ctx.cls ? ctx.cls.lc : null;
      case 'super': return null;
      case 'ctorcall': err(e, 'Constructor call must be the first statement of a constructor'); return null;
      case 'id': {
        const local = sc.find(e.lc);
        if (local !== undefined) return local.type;
        if (ctx.cls) {
          const f = fieldType(ctx.cls, e.lc);
          if (f) { if (ctx.static && !isStaticField(f.cls, e.lc)) err(e, 'Non-static variable cannot be referenced from a static context: ' + e.name); return tLc(f.t); }
          for (let c = ctx.cls.outer; c; c = c.outer) { const g = fieldType(c, e.lc); if (g) return tLc(g.t); }
          for (let k = ctx.cls; k; k = k.outer) for (let s = k; s; s = s.sup) { if (s.decl.kind === 'enum' && s.decl.enumVals.some(v => v.toLowerCase() === e.lc)) return s.lc; }
        }
        const c = clsOf(e.name, ctx.cls);
        if (c) return { ref: c };
        if (STATIC[e.lc] !== undefined) return { ns: e.lc };
        if (SOBJECT_NAMES.has(e.lc)) { err(e, "'" + e.name + "' needs a Salesforce org (metadata) and isn't available in the playground."); return null; }
        err(e, 'Variable does not exist: ' + e.name);
        return null;
      }
      case 'member': {
        const ot = checkExpr(e.obj, sc, ctx);
        if (ot && typeof ot === 'object' && ot.ref) {
          const c = ot.ref;
          if (e.lc === 'class') return 'type';
          const ok = fieldType(c, e.lc) || c.inner.has(e.lc) || (c.decl.kind === 'enum' && c.decl.enumVals.some(v => v.toLowerCase() === e.lc));
          if (!ok) err(e, 'Variable does not exist: ' + c.name + '.' + e.name);
          if (c.decl.kind === 'enum') return c.lc;
          const f = fieldType(c, e.lc); return f ? tLc(f.t) : null;
        }
        if (ot && typeof ot === 'object' && ot.ns) { const v = STATIC[ot.ns][e.lc]; if (v === undefined) err(e, 'Variable does not exist: ' + e.name); return null; }
        if (typeof ot === 'string') {
          const c = reg.bySimple.get(ot);
          if (c) { const f = fieldType(c, e.lc); if (!f) { err(e, 'Variable does not exist: ' + e.name); return null; } return tLc(f.t); }
        }
        return null;
      }
      case 'call': return checkCall(e, sc, ctx);
      case 'index': { checkExpr(e.obj, sc, ctx); checkExpr(e.idx, sc, ctx); return null; }
      case 'unary': { const t = checkExpr(e.e, sc, ctx); return e.op === '!' ? 'boolean' : t; }
      case 'bin': {
        const a = checkExpr(e.left, sc, ctx), b = checkExpr(e.right, sc, ctx);
        const op = e.op;
        if (['==', '!=', '===', '!==', '<', '>', '<=', '>=', '&&', '||'].includes(op)) {
          if ((op === '&&' || op === '||')) {
            if (typeof a === 'string' && a !== 'boolean') err(e.left, "Operator '" + op + "' needs Boolean operands, not " + show(a));
            if (typeof b === 'string' && b !== 'boolean') err(e.right, "Operator '" + op + "' needs Boolean operands, not " + show(b));
          }
          return 'boolean';
        }
        if (op === '+' && (a === 'string' || b === 'string')) return 'string';
        if (NUM_RANK[a] && NUM_RANK[b]) {
          if (a === 'double' || b === 'double') return 'double';
          if (a === 'decimal' || b === 'decimal') return 'decimal';
          if (a === 'long' || b === 'long') return 'long';
          return 'integer';
        }
        if (typeof a === 'string' && typeof b === 'string' && ['-', '*', '/', '%'].includes(op) && (a === 'string' || b === 'string')) err(e, "Operator '" + op + "' cannot be applied to " + show(a) + ', ' + show(b));
        return null;
      }
      case 'ternary': { condCheck(e.cond, sc, ctx); const a = checkExpr(e.a, sc, ctx), b = checkExpr(e.b, sc, ctx); return a === b ? a : null; }
      case 'coalesce': { const a = checkExpr(e.left, sc, ctx); checkExpr(e.right, sc, ctx); return typeof a === 'string' ? a : null; }
      case 'assign': {
        const tt = checkExpr(e.target, sc, ctx);
        const vt = checkExpr(e.value, sc, ctx);
        if (e.op === '=' && typeof tt === 'string' && typeof vt === 'string' && !compat(tt, vt)) err(e, 'Illegal assignment from ' + show(vt) + ' to ' + show(tt));
        if (e.target.k === 'id') {
          const loc = sc.find(e.target.lc);
          if (loc && loc.node && loc.node.final) err(e, 'Final variable cannot be reassigned: ' + e.target.name);
        }
        return tt;
      }
      case 'incdec': return checkExpr(e.target, sc, ctx);
      case 'cast': { validType(e.type, ctx.cls, e); checkExpr(e.e, sc, ctx); return tLc(e.type); }
      case 'instanceof': { validType(e.type, ctx.cls, e); checkExpr(e.e, sc, ctx); return 'boolean'; }
      case 'new': {
        validType(e.type, ctx.cls, e);
        const c = clsOf(e.type.name, ctx.cls);
        const lcT = lastSeg(e.type.lc);
        if (!c && !COLLS.has(lcT) && !PRIMS.has(lcT)) return null;
        const types = e.args.map(a => checkExpr(a, sc, ctx));
        if (c) {
          if (c.kind === 'interface') err(e, 'Interfaces cannot be instantiated: ' + c.name);
          else if (c.kind === 'enum') err(e, 'Enums cannot be instantiated: ' + c.name);
          else if (c.decl.mods.has('abstract')) err(e, 'Abstract classes cannot be instantiated: ' + c.name);
          else if (c.decl.ctors.length) {
            const ok = c.decl.ctors.filter(k => k.params.length === types.length).some(k => k.params.every((p, i) => compat(tLc(p.type), typeof types[i] === 'string' ? types[i] : null)));
            if (!ok) err(e, 'Constructor not defined: [' + c.name + '].<Constructor>(' + sigArgs(types) + ')');
          } else if (types.length && !c.isExc) err(e, 'Constructor not defined: [' + c.name + '].<Constructor>(' + sigArgs(types) + ')');
          return c.lc;
        }
        return lastSeg(e.type.lc);
      }
      case 'newlist': e.items.forEach(i => checkExpr(i, sc, ctx)); validType(e.type, ctx.cls, e); return 'list';
      case 'newset': e.items.forEach(i => checkExpr(i, sc, ctx)); validType(e.type, ctx.cls, e); return 'set';
      case 'newmap': e.pairs.forEach(([k, v]) => { checkExpr(k, sc, ctx); checkExpr(v, sc, ctx); }); validType(e.type, ctx.cls, e); return 'map';
      case 'newarray': validType(e.type, ctx.cls, e); checkExpr(e.size, sc, ctx); return 'list';
      default: return null;
    }
  }

  function checkCall(e, sc, ctx) {
    const argTypes = e.args.map(a => checkExpr(a, sc, ctx));
    const nameSig = (from) => 'Method does not exist or incorrect signature: void ' + e.name + '(' + sigArgs(argTypes) + ')' + (from ? ' from the type ' + from : '');
    const retOf = (m) => (m.ret.lc === 'void' ? 'void' : tLc(m.ret));
    if (!e.obj) {
      if (e.lc.startsWith('__')) return null;
      const cands = [];
      let sawInstanceOnly = false;
      for (let c = ctx.cls; c; c = c.outer) {
        for (let k = c; k; k = k.sup) { (k.methods.get(e.lc) || []).forEach(m => cands.push({ m, cls: c })); }
      }
      if (!cands.length && ctx.cls) {
        const ims = []; for (let k = ctx.cls; k; k = k.sup) ifaceMethods(k, ims, new Set());
        const hit = ims.find(x => x.lc === e.lc && x.argc === argTypes.length);
        if (hit) return hit.m ? retOf(hit.m) : null;
        if (['equals', 'hashcode', 'tostring'].includes(e.lc)) return null;
        if (ctx.cls.isExc || ctx.cls.decl.kind === 'enum') { if (['getmessage', 'name', 'ordinal'].includes(e.lc)) return null; }
      }
      if (!cands.length) { err(e, nameSig(ctx.cls ? ctx.cls.name : '')); return null; }
      const byArity = cands.filter(x => x.m.params.length === argTypes.length);
      if (!byArity.length || !byArity.some(x => x.m.params.every((p, i) => compat(tLc(p.type), typeof argTypes[i] === 'string' ? argTypes[i] : null)))) {
        err(e, nameSig(ctx.cls.name)); return null;
      }
      if (ctx.static && byArity.every(x => !x.m.mods.has('static') && x.cls === ctx.cls)) err(e, 'Non-static method cannot be referenced from a static context: ' + e.name);
      return byArity.length === 1 ? retOf(byArity[0].m) : null;
    }
    if (e.obj.k === 'super') return null;
    const ot = checkExpr(e.obj, sc, ctx);
    if (ot && typeof ot === 'object' && ot.ref) {
      const c = ot.ref;
      if (c.decl.kind === 'enum' && (e.lc === 'values' || e.lc === 'valueof')) return e.lc === 'values' ? 'list' : c.lc;
      const cands = classMethods(c, e.lc).filter(x => x.m.mods.has('static') || true);
      if (!cands.length) { err(e, nameSig(c.name)); return null; }
      const byArity = cands.filter(x => x.m.params.length === argTypes.length);
      if (!byArity.length || !byArity.some(x => x.m.params.every((p, i) => compat(tLc(p.type), typeof argTypes[i] === 'string' ? argTypes[i] : null)))) { err(e, nameSig(c.name)); return null; }
      if (byArity.every(x => !x.m.mods.has('static'))) err(e, 'Non-static method cannot be referenced from a static context: ' + c.name + '.' + e.name);
      return byArity.length === 1 ? retOf(byArity[0].m) : null;
    }
    if (ot && typeof ot === 'object' && ot.ns) {
      const tbl = STATIC[ot.ns];
      if (tbl && typeof tbl === 'object' && Object.keys(tbl).length && typeof tbl[e.lc] !== 'function' && ot.ns !== 'logginglevel') err(e, nameSig(ot.ns.charAt(0).toUpperCase() + ot.ns.slice(1)) + SUBSET_NOTE);
      if (ot.ns === 'string' && e.lc === 'valueof') return 'string';
      if (ot.ns === 'integer' && e.lc === 'valueof') return 'integer';
      if (ot.ns === 'decimal' && e.lc === 'valueof') return 'decimal';
      if (ot.ns === 'math' && ['abs', 'max', 'min'].includes(e.lc)) return null;
      return null;
    }
    if (typeof ot === 'string') {
      const uc = reg.bySimple.get(ot);
      if (uc) {
        let cands = classMethods(uc, e.lc);
        if (!cands.length) { const ims = []; for (let k = uc; k; k = k.sup) ifaceMethods(k, ims, new Set()); const hit = ims.find(x => x.lc === e.lc && x.argc === argTypes.length); if (hit) return hit.m ? retOf(hit.m) : null; }
        const enumM = uc.decl.kind === 'enum' && ['name', 'ordinal', 'tostring', 'equals', 'hashcode'].includes(e.lc);
        if (enumM) return e.lc === 'name' || e.lc === 'tostring' ? 'string' : e.lc === 'ordinal' || e.lc === 'hashcode' ? 'integer' : 'boolean';
        if (!cands.length && !['equals', 'hashcode', 'tostring'].includes(e.lc)) { err(e, nameSig(uc.name)); return null; }
        if (cands.length) {
          const byArity = cands.filter(x => x.m.params.length === argTypes.length);
          if (!byArity.length || !byArity.some(x => x.m.params.every((p, i) => compat(tLc(p.type), typeof argTypes[i] === 'string' ? argTypes[i] : null)))) { err(e, nameSig(uc.name)); return null; }
          return byArity.length === 1 ? retOf(byArity[0].m) : null;
        }
        return null;
      }
      const tbl = INSTANCE[ot];
      if (tbl && typeof tbl[e.lc] !== 'function' && ot !== 'object') { err(e, nameSig(show(ot)) + SUBSET_NOTE); return null; }
      if (ot === 'string') {
        if (['length', 'indexof', 'lastindexof', 'compareto', 'hashcode', 'countmatches'].includes(e.lc)) return 'integer';
        if (['contains', 'startswith', 'endswith', 'equals', 'equalsignorecase', 'isblank', 'isempty', 'isnumeric', 'matches', 'isalpha'].includes(e.lc)) return 'boolean';
        if (['substring', 'toupperCase', 'touppercase', 'tolowercase', 'trim', 'replace', 'replaceall', 'reverse', 'left', 'right', 'capitalize', 'repeat'].includes(e.lc)) return 'string';
      }
      if (ot === 'list' || ot === 'set' || ot === 'map') {
        if (e.lc === 'size') return 'integer';
        if (['isempty', 'contains', 'containskey'].includes(e.lc)) return 'boolean';
      }
    }
    return null;
  }

  for (const c of reg.dupes) err(c.decl, 'Duplicate type: ' + c.name);
  for (const c of reg.all) if (!c.builtin) checkClass(c);
  // anonymous statements
  const anonScope = new AScope(null);
  const anonCtx = { cls: null, static: true, ret: undefined, loop: 0 };
  for (const s of unit.anon) checkStmt(s, anonScope, anonCtx);
  return errs;
}

/* ------------------------------------------------------------ public API */
function run(code) {
  const t0 = Date.now();
  const result = { ok: false, errors: [], output: [], stats: {}, info: '' };
  let unit;
  try { unit = parse(code); }
  catch (e) {
    if (e && e.apex) { result.errors.push({ line: e.line, col: e.col, message: e.message }); return result; }
    result.errors.push({ line: 1, col: 1, message: 'Internal parser error: ' + (e && e.message) }); return result;
  }
  const reg = new Registry();
  for (const d of parse(PRELUDE).types) reg.add(d, null, true);
  for (const d of unit.types) reg.add(d, null, false);
  reg.link();
  const errs = analyze(unit, reg);
  if (errs.length) { errs.sort((a, b) => a.line - b.line || a.col - b.col); result.errors = errs; return result; }

  const it = new Interp(reg);
  RT = it;
  const env = { scope: new Scope(null), self: null, cls: null };
  try {
    if (unit.anon.length) {
      for (const s of unit.anon) { const r = it.ex(s, env); if (r && r.t === 'ret') break; }
    } else {
      let entry = null;
      for (const c of reg.all) {
        if (c.builtin) continue;
        for (const nm of ['main', 'run', 'execute', 'demo', 'start']) {
          const m = (c.methods.get(nm) || []).find(x => x.mods.has('static') && x.params.length === 0 && x.body);
          if (m) { entry = { c, m }; break; }
        }
        if (entry) break;
      }
      if (entry) { it.ensureStatic(entry.c); it.invoke(entry.c, entry.m, null, [], entry.m); result.info = 'Ran ' + entry.c.name + '.' + entry.m.name + '()'; }
      else result.info = 'Compiled successfully. To run something, add statements below your classes (like System.debug(new MyClass().hello());) or add a static method called main().';
    }
    result.ok = true;
  } catch (e) {
    if (e instanceof ApexThrow) {
      const o = e.obj;
      result.ok = false;
      it.out.push({ k: 'error', text: 'System.' + o.cls.name.replace(/^System\./, '') + ': ' + str(o.f.get('__msg')), stack: (o.stack || []).slice(), line: o.line });
    } else if (e instanceof RangeError) {
      it.out.push({ k: 'error', text: 'System.LimitException: Maximum stack depth has been reached.', stack: [] });
    } else {
      it.out.push({ k: 'error', text: 'Internal error: ' + (e && e.message), stack: [] });
    }
  }
  result.output = it.out;
  result.stats = { steps: it.steps, ms: Date.now() - t0 };
  RT = null;
  return result;
}

const api = { run, parse, version: '1.0' };
root.ApexLab = api;
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof WorkerGlobalScope !== 'undefined' && typeof self !== 'undefined' && self instanceof WorkerGlobalScope) {
  self.onmessage = function (e) {
    let res;
    try { res = run(e.data.code); } catch (err) { res = { ok: false, errors: [{ line: 1, col: 1, message: 'Internal error: ' + err.message }], output: [], stats: {} }; }
    self.postMessage({ id: e.data.id, result: res });
  };
}
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this));
