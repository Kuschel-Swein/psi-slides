// strip-comments.mjs – comments out of the JavaScript and CSS the build
// splices into a view, and nothing else.
//
// The runtime, the diagram compiler, the editor and the stylesheets are
// documented in their own comments, and those comments are the project's
// documentation: they stay in the source. What a browser is handed does not
// need them – measured, they were about 740 KB of every live view, half of
// the 966 KB the compiler and the editor carry. So the build hands each of
// those texts through here on the way into the output (`stripJs`,
// `stripCss`), and `PSI_KEEP_COMMENTS=1` in the environment ships them
// untouched for debugging.
//
// Zero imports and zero Node APIs, like tails.mjs, so the `strip` gate can
// hold it to its cases without an `npm install`.
//
// **It is a tokenizer, not a regex**, because a regex cannot tell a comment
// from the same two characters inside a string ('//' in a URL), a template
// literal (with `${…}` nested to any depth), or a regular expression
// (/[/*]/). It walks the text once and knows which of those it is in; the
// one ambiguity JavaScript's lexical grammar leaves to the parser – whether a
// slash is a division or starts a regular expression – is decided from the
// token before it, the way every tokenizer short of a parser does it:
//
// - after an identifier, a number, a string, a template, a regex, `)` or
//   `]`, a slash divides; after a keyword that takes an expression (`return`,
//   `typeof`, `case`, …) or any other punctuator, it starts a regex;
// - `)` is the one place that rule is wrong in practice – `if (x) /re/` –
//   so a parenthesis remembers whether `if`, `while`, `for` or `with`
//   opened it;
// - `}` is taken as the end of a block (a regex may follow), and a regex
//   cannot cross a line, so a slash read as one that meets a line end before
//   its closing slash is re-read as a division. Between them, a guess that
//   is wrong costs a comment left in, never code taken out.
//
// What a strip does to the text, and nothing more:
//
// - a `//` comment goes, up to and not including its line end;
// - a `/* */` comment on one line becomes nothing, or one space where the
//   two tokens either side would otherwise run together; one that spans a
//   line becomes a line end, which keeps automatic semicolon insertion
//   reading the code as it did;
// - trailing blanks go, and a line that is blank once its comments are
//   gone goes – outside strings and templates only, so a template literal's
//   text is never touched;
// - a comment that is load-bearing stays: `/*!`, `@license` / `@preserve`,
//   and `//# sourceURL=` / `//# sourceMappingURL=`.
//
// Indentation and every line that holds code stay as they are, so a stack
// trace still names a recognisable line, and test/settings.mjs, which lifts
// helpers out of a built page as text, still finds them.

const KEEP_BLOCK = /^\/\*!|@license|@preserve/;
const KEEP_LINE = /^\/\/[#@]\s*source(?:Mapping)?URL=/;

// Keywords after which an expression – and so a regex – may begin.
const REGEX_AFTER_WORD = new Set([
  'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void',
  'throw', 'case', 'do', 'else', 'yield', 'await', 'extends',
]);
// Keywords whose parenthesised head may be followed by a regex statement.
const PAREN_HEAD = new Set(['if', 'while', 'for', 'with']);

const isIdStart = (c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')
  || c === '_' || c === '$' || c === '\\' || c > '\u007f';
const isIdPart = (c) => isIdStart(c) || (c >= '0' && c <= '9');
const isDigit = (c) => c >= '0' && c <= '9';
const isLineEnd = (c) => c === '\n' || c === '\r' || c === '\u2028' || c === '\u2029';
const isBlank = (c) => c === ' ' || c === '\t' || c === '\f' || c === '\v'
  || c === '\u00a0' || c === '\ufeff';

// Strip the comments out of `src`, a JavaScript program (script or module).
export function stripJs(src) {
  // The output as pieces, joined once at the end, and the blanks read since
  // the last token, held back until a token follows them on the same line:
  // that is how a trailing blank, or the indentation of a line that turns
  // out to hold only a comment, never reaches the output.
  const parts = [];
  let pending = '';
  let i = 0;
  const n = src.length;
  // The last significant token: its kind and its text.
  let prevKind = 'start', prevText = '';
  // One entry per open ( [ {: '(' / '(head' / '[' / '{' / '${'.
  const stack = [];
  // Whether the current output line holds anything yet (code-level lines only).
  let lineHasCode = false;
  // A comment that stood between two blanks leaves one of them.
  let dropBlank = false;
  // The word before a `(`, to know whether it opened a statement head.
  let lastWord = '';

  const raw = (text) => {
    if (pending) { parts.push(pending); pending = ''; }
    parts.push(text);
    lineHasCode = true;
    dropBlank = false;
  };
  const emit = (text, kind) => {
    raw(text);
    prevKind = kind; prevText = text;
  };
  // A line end at code level: trailing blanks go, and so does a line that
  // is blank.
  const lineEnd = (le) => {
    pending = '';
    if (lineHasCode) parts.push(le);
    lineHasCode = false;
    dropBlank = false;
  };
  const regexAllowed = () => {
    switch (prevKind) {
      case 'start': return true;
      case 'word': return REGEX_AFTER_WORD.has(prevText);
      case 'name': case 'num': case 'str': case 'tpl': case 'regex': case 'postfix': return false;
      case 'close': return prevText === ')head' || prevText === '}';
      default: return true; // a punctuator
    }
  };
  // Scan a template literal's text from i (just past ` or }) to its end or
  // its next ${. Returns true when a substitution opened.
  const templateText = (start) => {
    let k = i;
    while (k < n) {
      const c = src[k];
      if (c === '\\') { k += 2; continue; }
      if (c === '`') { k++; emit(src.slice(start, k), 'tpl'); i = k; return false; }
      if (c === '$' && src[k + 1] === '{') {
        k += 2; emit(src.slice(start, k), 'punct'); stack.push('${'); i = k; return true;
      }
      k++;
    }
    throw new Error('strip-comments: unterminated template literal');
  };

  while (i < n) {
    const c = src[i];
    if (isLineEnd(c)) {
      const le = (c === '\r' && src[i + 1] === '\n') ? '\r\n' : c;
      i += le.length;
      lineEnd(le);
      continue;
    }
    if (isBlank(c)) {
      let k = i + 1;
      while (k < n && isBlank(src[k])) k++;
      if (!dropBlank) pending += src.slice(i, k);
      i = k;
      continue;
    }
    if (c === '/' && src[i + 1] === '/') {
      let k = i + 2;
      while (k < n && !isLineEnd(src[k])) k++;
      const text = src.slice(i, k);
      if (KEEP_LINE.test(text)) raw(text);
      i = k;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      if (end === -1) throw new Error('strip-comments: unterminated block comment');
      const text = src.slice(i, end + 2);
      i = end + 2;
      if (KEEP_BLOCK.test(text)) { raw(text); continue; }
      if (/[\n\r\u2028\u2029]/.test(text)) { lineEnd('\n'); continue; }
      // Between two tokens at code level a space never changes what they
      // mean, and leaving none could join them (a/**/b, +/**/+, 1/**/.5).
      const after = src[i];
      if (pending) dropBlank = true;
      else if (lineHasCode && after && !isBlank(after) && !isLineEnd(after)) pending = ' ';
      continue;
    }
    if (c === '"' || c === "'") {
      let k = i + 1;
      while (k < n && src[k] !== c) {
        if (src[k] === '\\') k++;
        else if (src[k] === '\n') throw new Error('strip-comments: unterminated string');
        k++;
      }
      k++;
      emit(src.slice(i, k), 'str');
      i = k;
      continue;
    }
    if (c === '`') {
      const start = i; i++;
      templateText(start);
      continue;
    }
    if (isDigit(c) || (c === '.' && isDigit(src[i + 1] || ''))) {
      let k = i + 1;
      while (k < n) {
        const d = src[k];
        if (isIdPart(d) || d === '.') k++;
        else if ((d === '+' || d === '-') && /[eE]/.test(src[k - 1])
          && !/^0[xX]/.test(src.slice(i, k))) k++;
        else break;
      }
      emit(src.slice(i, k), 'num');
      i = k;
      continue;
    }
    if (isIdStart(c) || c === '#') {
      let k = i + 1;
      while (k < n && (isIdPart(src[k]) || (src[k] === '\\' && src[k + 1] === 'u'))) k++;
      const word = src.slice(i, k);
      // A property name after a dot is a name, never a keyword: x.return / 2.
      const afterDot = prevKind === 'punct' && (prevText === '.' || prevText === '?.');
      emit(word, !afterDot && REGEX_AFTER_WORD.has(word) ? 'word' : 'name');
      lastWord = afterDot ? '' : word;
      i = k;
      continue;
    }
    if (c === '/') {
      if (regexAllowed()) {
        // A regex literal: to the closing slash outside a class, then flags.
        let k = i + 1, inClass = false, ok = false;
        while (k < n && !isLineEnd(src[k])) {
          const d = src[k];
          if (d === '\\') { k += 2; continue; }
          if (d === '[') inClass = true;
          else if (d === ']') inClass = false;
          else if (d === '/' && !inClass) { ok = true; break; }
          k++;
        }
        if (ok) {
          k++;
          while (k < n && isIdPart(src[k])) k++;
          emit(src.slice(i, k), 'regex');
          i = k;
          continue;
        }
        // Met a line end first: it was a division after all.
      }
      const op = src[i + 1] === '=' ? '/=' : '/';
      emit(op, 'punct');
      i += op.length;
      continue;
    }
    if (c === '(') {
      stack.push(PAREN_HEAD.has(lastWord) && prevKind === 'name' ? '(head' : '(');
      emit(c, 'punct'); lastWord = ''; i++;
      continue;
    }
    if (c === '[' || c === '{') {
      stack.push(c);
      emit(c, 'punct'); lastWord = ''; i++;
      continue;
    }
    if (c === ')' || c === ']') {
      const open = stack.pop();
      emit(c, 'close');
      if (open === '(head') prevText = ')head';
      lastWord = ''; i++;
      continue;
    }
    if (c === '}') {
      const open = stack.pop();
      if (open === '${') {
        const start = i; i++;
        templateText(start);
        lastWord = '';
        continue;
      }
      emit(c, 'close'); lastWord = ''; i++;
      continue;
    }
    // Any other punctuator, longest match not needed: only slashes matter,
    // and a slash is never part of a longer operator but /=.
    // a++ / 2 divides; after a prefix ++ an expression follows.
    if ((c === '+' || c === '-') && src[i + 1] === c) {
      const postfix = prevKind === 'name' || prevKind === 'num' || (prevKind === 'close' && prevText !== '}');
      emit(c + c, postfix ? 'postfix' : 'punct'); lastWord = ''; i += 2;
      continue;
    }
    if (c === '?' && src[i + 1] === '.' && !isDigit(src[i + 2] || '')) {
      emit('?.', 'punct'); lastWord = ''; i += 2;
      continue;
    }
    if (c === '.') { emit(c, 'punct'); lastWord = ''; i++; continue; }
    // A run of the punctuators nothing above cares about, as one token.
    let k = i + 1;
    while (k < n && OTHER_PUNCT.includes(src[k])) k++;
    emit(src.slice(i, k), 'punct'); lastWord = ''; i = k;
  }
  lineEnd('');
  return parts.join('');
}
const OTHER_PUNCT = '=,;:!<>&|*%^~@';

// Strip the comments out of `src`, a stylesheet. Strings and an unquoted
// url(…) are read as such, so a /* inside either stays. `/*!` stays.
export function stripCss(src) {
  const parts = [];
  let pending = '';
  let lineHasCode = false;
  let dropBlank = false;
  let i = 0;
  const n = src.length;
  const raw = (text) => {
    if (pending) { parts.push(pending); pending = ''; }
    parts.push(text);
    lineHasCode = true;
    dropBlank = false;
  };
  const lineEnd = (le) => {
    pending = '';
    if (lineHasCode) parts.push(le);
    lineHasCode = false;
    dropBlank = false;
  };
  while (i < n) {
    const c = src[i];
    if (c === '\n' || c === '\r' || c === '\f') {
      const le = (c === '\r' && src[i + 1] === '\n') ? '\r\n' : c;
      i += le.length;
      lineEnd(le);
      continue;
    }
    if (c === ' ' || c === '\t') {
      let k = i + 1;
      while (k < n && (src[k] === ' ' || src[k] === '\t')) k++;
      if (!dropBlank) pending += src.slice(i, k);
      i = k;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      if (end === -1) throw new Error('strip-comments: unterminated CSS comment');
      const text = src.slice(i, end + 2);
      i = end + 2;
      if (/^\/\*!/.test(text)) { raw(text); continue; }
      // A comment between two words separates them (a/**/b is two tokens);
      // nothing else in CSS reads a comment as a space, and a space would
      // be a descendant combinator in a selector. So it stays, emptied.
      const before = pending ? ' ' : (parts.length ? parts[parts.length - 1].slice(-1) : '');
      const after = src[i] || '';
      if (/[\w-]/.test(before) && /[\w-]/.test(after)) raw('/**/');
      else if (pending) dropBlank = true;
      if (/[\n\r\f]/.test(text)) lineEnd('\n');
      continue;
    }
    if (c === '"' || c === "'") {
      let k = i + 1;
      while (k < n && src[k] !== c) {
        if (src[k] === '\\') k++;
        else if (src[k] === '\n') break; // a bad string ends at the line, as in CSS
        k++;
      }
      k++;
      raw(src.slice(i, k));
      i = k;
      continue;
    }
    if ((c === 'u' || c === 'U') && /^url\(\s*[^\s"')]/i.test(src.slice(i, i + 6))) {
      const end = src.indexOf(')', i);
      const k = end === -1 ? n : end + 1;
      raw(src.slice(i, k));
      i = k;
      continue;
    }
    // Everything else is copied in runs, up to the next character that
    // could start one of the above.
    let k = i + 1;
    if (c === '\\') k = i + 2;
    else while (k < n && !CSS_STOP.includes(src[k])) k++;
    raw(src.slice(i, k));
    i = k;
  }
  lineEnd('');
  return parts.join('');
}
const CSS_STOP = '\n\r\f \t/"\'uU\\';
