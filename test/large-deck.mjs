#!/usr/bin/env node
/*
 * node test/large-deck.mjs
 *
 * A deck far larger than any lecture in this repository, built and linted
 * end to end. Every other suite builds decks of a handful of chunks, or the
 * real lectures, the largest of which has about forty; a pass over the
 * chunks that is quadratic in their number would cost nothing on any of
 * them and minutes on a semester's worth of slides in one file. So this
 * builds a generated deck of several hundred chunks in a dozen parts, with
 * the constructs that carry their own per-chunk work – reveal segments,
 * notes, code (Shiki), formulas (KaTeX), stepped figures, a figure inside a
 * `::: side` pane, card rows, columns, expansions and footnotes – and asks:
 *
 *   - it builds: exit 0, no stack trace, all four views written;
 *   - nothing is lost: every chunk id stands in the projection and the
 *     document, and every figure in the projection;
 *   - the linter reads it without an error;
 *   - it scales: four times the chunks cost less than SCALE_LIMIT times the
 *     time. Measured as the cost above a deck of eight chunks, because the
 *     fixed start-up (Node, Shiki, KaTeX, the fonts) is most of a build of
 *     a few hundred, and a ratio of totals would let a quadratic pass hide
 *     behind it. Linear growth is about x4, a quadratic pass x16; each size
 *     is the faster of two builds, since noise only ever adds time.
 *     Measured on the machine this was written on: 0.27 s for eight chunks,
 *     then about a third of a millisecond per chunk, x4.0.
 *
 * PSI_LARGE_CHUNKS=<n> sets the large deck's chunk count (default 2400; the
 * middle deck is a quarter of it), for a run by hand at another size.
 *
 * It runs build.js as a subprocess, so it needs `npm install` and is not a
 * gate (see test/README.md); it needs no browser.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpDir } from './tmp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = path.join(ROOT, 'build.js');
const LINT = path.join(ROOT, 'lint.js');
const CHUNKS = Math.max(256, Number(process.env.PSI_LARGE_CHUNKS) || 2400);
const PARTS = 12;
const SCALE_LIMIT = 10;

let passed = 0;
const failures = [];
function ok(cond, what, detail = '') {
  if (cond) { passed++; return; }
  failures.push(detail ? `${what}\n      ${String(detail).split('\n').slice(0, 4).join(' / ')}` : what);
}

function run(script, args, { timeout = 600000 } = {}) {
  return new Promise((resolve) => {
    const t0 = process.hrtime.bigint();
    const child = spawn(process.execPath, [script, ...args], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    const timer = setTimeout(() => child.kill('SIGKILL'), timeout);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, out, err, ms: Number(process.hrtime.bigint() - t0) / 1e6 });
    });
  });
}

// ── the deck ─────────────────────────────────────────────────────────
// Eight chunk shapes, taken in turn, so every construct recurs about
// CHUNKS / 8 times and every part holds each of them.
const figure = (n) => `::: draw
box a${n} "Request ${n}" at 0,0
box b${n} "Server" right of a${n} gap 1.2
box c${n} "Store" below b${n} gap 0.8
edge a${n} -> b${n}
edge b${n} -> c${n}
step ask
  emph b${n}
step keep
  emph c${n}
:::`;

const SHAPES = [
  (n) => `## statement: Claim ${n} {#c${n}}

**Claim ${n} stands on its own in one sentence.** The rest of the paragraph
is the prose a reader of the handout gets and the room does not.

---

**A second beat for claim ${n}** arrives on the next press.

> note: Say claim ${n} slowly; the second beat is the example.`,

  (n) => `## definition: Term ${n} {#c${n}}

**Term ${n} is the quantity $x_{${n}} = \\sum_{i=1}^{n} a_i^2$**, read as a sum
of squares.

$$
f_{${n}}(x) = \\frac{1}{\\sqrt{2\\pi}} e^{-x^2/2}
$$`,

  (n) => `## example: Code ${n} {#c${n}}

**The loop in example ${n} counts what it reads.**

\`\`\`python
def count_${n}(items):
    seen = {}
    for item in items:
        seen[item] = seen.get(item, 0) + 1
    return seen
\`\`\``,

  (n) => `## free: Figure ${n} {.wide #c${n}}

${figure(n)}`,

  (n) => `## free: Pane ${n} | a figure beside the words {.wide #c${n}}

**The pane on the right of chunk ${n} carries a figure.**

::: side

The words stay on the left while the figure steps through its two beats.

::: flip

${figure(n)}

:::`,

  (n) => `## example: Cards ${n} {.wide #c${n}}

**Three cards, one row, chunk ${n}.**

::: cards 3 {.small}
- **first**\\
  the opening case
- **second**\\
  the one that goes wrong
- **third**\\
  the repair
:::`,

  (n) => `## principle: Columns ${n} {.wide #c${n}}

**Principle ${n} reads in two columns on paper.**

::: cols 2
The first column of principle ${n} says what holds.

The second column says when it stops holding.
:::`,

  (n) => `## question: Question ${n} {#c${n}}

**Why does question ${n} have an answer behind a label?**

::: expand The answer
Because the answer to question ${n} is for the handout and for a click.
:::

::: footnote
A footnote on question ${n}, written under the body.
:::`,
];

function deck(chunks) {
  const per = Math.ceil(chunks / PARTS);
  const out = [`---
title: A large deck
lang: en
---

<!-- linter: ignore reveal-overuse, density -->

## title: A large deck | ${chunks} chunks in ${PARTS} parts {#top}`];
  let n = 0;
  let figures = 0;
  for (let p = 1; p <= PARTS && n < chunks; p++) {
    out.push(`# Part ${p} {#part-${p}}`);
    for (let i = 0; i < per && n < chunks; i++, n++) {
      const md = SHAPES[n % SHAPES.length](n);
      figures += (md.match(/^::: draw/gm) || []).length;
      out.push(md);
    }
  }
  return { text: out.join('\n\n') + '\n', chunks: n, figures };
}

// Built twice; the faster run is the one timed.
async function buildDeck(chunks, name) {
  const dir = path.join(tmpDir('psi-large-'), name);
  fs.mkdirSync(dir);
  const { text, chunks: made, figures } = deck(chunks);
  fs.writeFileSync(path.join(dir, 'source.md'), text);
  const args = [path.join(dir, 'source.md'), '--no-optimize-images'];
  const a = await run(BUILD, args);
  const b = a.code === 0 ? await run(BUILD, args) : a;
  return { dir, made, figures, ...b, ms: Math.min(a.ms, b.ms) };
}

const STACK = /\bat .*\(.*:\d+:\d+\)|\n\s+at /;

// Smallest first: the first build also warms the disk cache for build.js and
// node_modules, so no size is timed cold against the others warm.
const tiny = await buildDeck(8, 'tiny');
ok(tiny.code === 0, 'a deck of eight chunks builds', tiny.err);
const middle = await buildDeck(Math.round(CHUNKS / 4), 'middle');
ok(middle.code === 0, `the middle deck builds (${middle.made} chunks)`, middle.err);

const large = await buildDeck(CHUNKS, 'large');
ok(large.code === 0, `the large deck builds (${large.made} chunks)`, large.err || large.out);
ok(!STACK.test(large.err), 'without a stack trace', large.err);
const views = ['audience', 'print', 'print-notes', 'speaker'];
const written = views.filter(v => fs.existsSync(path.join(large.dir, v + '.html')));
ok(written.length === 4, 'all four views are written', written.join(', '));

if (written.length === 4) {
  const audience = fs.readFileSync(path.join(large.dir, 'audience.html'), 'utf8');
  const print = fs.readFileSync(path.join(large.dir, 'print.html'), 'utf8');
  const missing = (html) => {
    const lost = [];
    for (let n = 0; n < large.made; n++) if (!html.includes(`id="c${n}"`)) lost.push(`c${n}`);
    return lost;
  };
  const lostA = missing(audience);
  ok(!lostA.length, `every chunk id stands in audience.html (${large.made})`, lostA.slice(0, 8).join(', '));
  const lostP = missing(print);
  ok(!lostP.length, `every chunk id stands in print.html (${large.made})`, lostP.slice(0, 8).join(', '));
  for (let p = 1; p <= PARTS; p++) {
    if (!audience.includes(`Part ${p}`)) { ok(false, `part ${p} reaches the projection`); break; }
  }
  const drawn = (audience.match(/<svg id="psiINT-dg\d+-root" class="psi-diagram"/g) || []).length;
  ok(drawn === large.figures, `every figure is drawn in audience.html (${drawn} of ${large.figures})`);
}

const lint = await run(LINT, [path.join(large.dir, 'source.md')]);
ok(lint.code === 0 && /\b0 error\(s\)/.test(lint.out + lint.err), 'lint.js reads it without an error',
  (lint.out + lint.err).split('\n').filter(l => /error/i.test(l)).slice(0, 4).join('\n'));

const s = (r) => (r.ms / 1000).toFixed(2) + ' s';
const ratio = (large.ms - tiny.ms) / Math.max(1, middle.ms - tiny.ms);
console.log(`large-deck: ${tiny.made} chunks in ${s(tiny)}, ${middle.made} in ${s(middle)}, `
  + `${large.made} in ${s(large)}; above the eight, x${ratio.toFixed(1)} for x4 the chunks`);
ok(ratio < SCALE_LIMIT, `four times the chunks cost less than ${SCALE_LIMIT} times as much (x${ratio.toFixed(1)})`);

if (failures.length) {
  console.log(`large-deck: ${failures.length} failed, ${passed} passed`);
  for (const f of failures) console.log('  FAIL ' + f);
  process.exit(1);
}
console.log(`large-deck: ${passed} passed`);
