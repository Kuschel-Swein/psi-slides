#!/usr/bin/env node
/*
 * node test/containers.mjs
 *
 * Every container a chunk body has, crossed with every line that means
 * something to the parser - built with build.js, linted with lint.js, and the
 * two asked whether they agree.
 *
 * Why a matrix. `parseLecture` reads a line in one of several capture modes
 * (a card row, an overlay, an expansion, a divider body, a layout wrapper),
 * and each mode decides for itself what a `> note:`, a `---`, a heading or a
 * comment is. Two defects of the 2.0.0 review were one mode forgetting one
 * line type: a `> note:` inside `::: cards` was captured as card text and
 * shown to the room, and a heading inside a multi-line `<!-- … -->` opened a
 * chunk, which left the comment open in the browser and took every later
 * slide with it. A fixture per pair would only catch the pair someone thought
 * of. This writes every pair.
 *
 * What each cell asserts:
 *   - build and lint agree on accept / refuse (build exit 0 iff lint reports
 *     no error);
 *   - when the build accepts: the chunk after the container is still there
 *     and visible in all four views, a speaker note is in the cockpit and the
 *     notes document and nowhere else, no comment is left open and no
 *     escaped comment closer leaked, and nothing written inside a comment is
 *     outside one.
 *
 * It runs build.js as a subprocess, so it needs `npm install` and is not a
 * gate (see test/README.md); it needs no browser. A cell is one deck, built
 * in a scratch directory, several at a time.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpDir } from './tmp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = path.join(ROOT, 'build.js');
const LINT = path.join(ROOT, 'lint.js');

let passed = 0;
const failures = [];
function ok(cond, what, detail = '') {
  if (cond) { passed++; return; }
  failures.push(detail ? `${what}\n      ${detail}` : what);
}

// The containers. `X` is where the line type goes; each one keeps a line of
// prose of its own either side of it, so a container is never empty and a
// refusal is about the line type, not about an empty block. `docsOnly` marks
// one whose body is drawn in the two documents and not in the live views.
const CONTAINERS = {
  'chunk body':  { chunk: 'Before.\n\nX\n\nAfter in body.' },
  'cards 2':     { chunk: '::: cards 2\n\nCard one.\n\nX\n\nCard two.\n\n:::' },
  'rows':        { chunk: '::: rows\n\n**Term** – one.\n\nX\n\n**Other** – two.\n\n:::' },
  'side':        { chunk: '::: side\n\nLeft pane.\n\nX\n\n::: flip\n\nRight pane.\n\n:::' },
  'flip':        { chunk: '::: side\n\nLeft pane.\n\n::: flip\n\nRight pane.\n\nX\n\n:::' },
  'overlay':     { chunk: 'Under the card.\n\n::: overlay\n\nCard text.\n\nX\n\n:::' },
  'dock':        { chunk: 'Beside the dock.\n\n::: dock {.left}\n\nDock text.\n\nX\n\n:::' },
  'expand':      { chunk: 'On the slide.\n\n::: expand More\n\nExpanded.\n\nX\n\n:::' },
  'pulse':       { docsOnly: true, chunk: 'On the slide.\n\n::: pulse\n\nThe question?\n\nX\n\n---\n\nThe answer.\n\n:::' },
  'footnote':    { chunk: 'On the slide.\n\n::: footnote\n\nSmall print.\n\nX\n\n:::' },
  'cols 2':      { chunk: '::: cols 2\n\nColumn prose.\n\nX\n\nMore prose.\n\n:::' },
  'slide':       { chunk: '::: slide\n\nScreen text.\n\nX\n\n:::\n\nScript text.' },
  'script':      { chunk: 'Screen text.\n\n::: script\n\nScript text.\n\nX\n\n:::' },
  'divider':     { divider: 'Divider words.\n\nX\n\nMore divider words.' },
  'divider cards': { divider: '::: cards 2\n\nCard one.\n\nX\n\nCard two.\n\n:::' },
  'divider overlay': { divider: 'Divider words.\n\n::: overlay\n\nCard text.\n\nX\n\n:::' },
};

// The line types, and what each one is expected to leave behind when the
// build accepts it. `secret` is a word that must not reach the projection.
const LINES = {
  'note':     { text: '> note: NOTESECRET said aloud.', note: 'NOTESECRET' },
  'note+cont':{ text: '> note: NOTESECRET first line\n> NOTESECOND continued.', note: 'NOTESECRET', note2: 'NOTESECOND' },
  'annot':    { text: '> annot: ANNOTWORD for everyone.', annot: 'ANNOTWORD' },
  '---':      { text: '---' },
  '## chunk': { text: '## statement: Inner {#inner}\n\nInner words.' },
  '# column': { text: '# Inner part {#innerpart}' },
  'comment':  { text: '<!--\n## statement: Hidden {#hidden}\nHIDDENWORD\n---\n> note: HIDDENNOTE\n::: cards 2\n:::\n-->',
                hidden: ['HIDDENWORD', 'HIDDENNOTE'] },
  'comment+blank': { text: '<!-- draft\n\nHIDDENWORD\n\n# Hidden part {#hp}\n\n![](missing-picture)\n\n-->',
                hidden: ['HIDDENWORD', 'missing-picture'] },
  'comment+tail': { text: '<!--\nHIDDENWORD\n--> TAILWORD stays.', hidden: ['HIDDENWORD'], shown: 'TAILWORD' },
  'comment1': { text: '<!-- HIDDENWORD on one line -->', hidden: ['HIDDENWORD'] },
  '::: foo':  { text: '::: foo\n\nFOOWORD\n\n:::' },
};

function deckFor(c, l) {
  const fill = (s) => s.replace('X', l.text);
  const head = '---\ntitle: Matrix\n---\n\n## title: {#t}\n\n';
  const after = '\n\n## statement: After {#after}\n\nAFTERWORD stands here.\n';
  if (c.divider) {
    return head + '# Part {#part}\n\n' + fill(c.divider)
      + '\n\n## statement: First {#first}\n\nFirst words.' + after;
  }
  return head + '# Part {#part}\n\n## statement: Host {#host}\n\n' + fill(c.chunk) + after;
}

function run(cmd, args, cwd) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [cmd, ...args], { cwd });
    let out = '';
    p.stdout.on('data', d => { out += d; });
    p.stderr.on('data', d => { out += d; });
    p.on('close', code => resolve({ code, out }));
  });
}

// Text a reader can see: comments taken out, then tags. What remains in a
// comment is the comment's business; a `<!--` left over is one that never
// closes, which in a browser is everything after it.
const uncommented = (html) => html.replace(/<!--[\s\S]*?-->/g, '');
const bareText = (html) => uncommented(html)
  .replace(/<script\b[\s\S]*?<\/script>/g, '')
  .replace(/<style\b[\s\S]*?<\/style>/g, '');

async function cell(cName, lName) {
  const c = CONTAINERS[cName];
  const l = LINES[lName];
  const where = `${cName} × ${lName}`;
  const dir = tmpDir('psi-containers-');
  const src = path.join(dir, 'source.md');
  fs.writeFileSync(src, deckFor(c, l));
  const [b, li] = await Promise.all([
    run(BUILD, [src, '--no-optimize-images'], dir),
    run(LINT, [src], dir),
  ]);
  const built = b.code === 0;
  const lintErr = /\berror\b/.test(li.out) && li.code === 1;
  ok(built === !lintErr, `${where}: build and lint agree`,
    `build ${built ? 'accepts' : 'refuses'}${built ? '' : ': ' + firstLine(b.out)}; `
    + `lint ${lintErr ? 'refuses: ' + lintErrors(li.out) : 'accepts'}`);
  if (!built) return { where, built, lintErr };

  const read = (n) => fs.readFileSync(path.join(dir, n + '.html'), 'utf8');
  const views = { audience: read('audience'), speaker: read('speaker'),
                  print: read('print'), 'print-notes': read('print-notes') };
  for (const [v, html] of Object.entries(views)) {
    const u = uncommented(html);
    ok(!u.includes('<!--'), `${where}: no comment left open in ${v}.html`,
      u.slice(u.indexOf('<!--'), u.indexOf('<!--') + 80).replace(/\n/g, '⏎'));
    ok(!/--&gt;/.test(html), `${where}: no escaped comment closer in ${v}.html`);
    ok(bareText(html).includes('AFTERWORD'), `${where}: the next chunk survives in ${v}.html`);
    for (const h of l.hidden || []) {
      ok(!bareText(html).includes(h), `${where}: ${h} stays inside its comment in ${v}.html`);
    }
    ok(!/::: foo/.test(bareText(html)), `${where}: no directive printed as text in ${v}.html`);
    if (l.shown && !(c.docsOnly && (v === 'audience' || v === 'speaker'))) {
      ok(bareText(html).includes(l.shown), `${where}: ${l.shown} after the comment's closer is in ${v}.html`);
    }
  }
  if (l.note) {
    for (const n of [l.note, l.note2].filter(Boolean)) {
      ok(!views.audience.includes(n), `${where}: the note is not in audience.html`);
      ok(!views.print.includes(n), `${where}: the note is not in print.html`);
      ok(views.speaker.includes(n), `${where}: the note is in speaker.html`);
      ok(views['print-notes'].includes(n), `${where}: the note is in print-notes.html`);
    }
    for (const [v, html] of Object.entries(views)) {
      ok(!/note:\s*NOTESECRET/i.test(html), `${where}: no "note:" blockquote in ${v}.html`);
    }
  }
  if (l.annot) {
    for (const [v, html] of Object.entries(views)) {
      ok(!/annot:\s*ANNOTWORD/i.test(html), `${where}: no "annot:" blockquote in ${v}.html`);
    }
  }
  return { where, built, lintErr };
}

const firstLine = (s) => (s.split('\n').find(x => /error|Error|refus|inside|not /.test(x)) || s.split('\n')[0] || '').trim().slice(0, 160);
const lintErrors = (s) => [...s.matchAll(/\berror\s+(\S+)/g)].map(m => m[1]).join(', ');

const jobs = [];
for (const cName of Object.keys(CONTAINERS)) {
  for (const lName of Object.keys(LINES)) jobs.push([cName, lName]);
}
const verbose = process.argv.includes('--verbose');
const results = [];
const width = Math.max(2, Math.min(8, os.cpus().length));
let next = 0;
await Promise.all(Array.from({ length: width }, async () => {
  while (next < jobs.length) {
    const j = jobs[next++];
    results.push(await cell(...j));
  }
}));
// A comment left open is refused by both, naming the line it opened on:
// nothing inside one is structure, so it would hold every slide below it.
{
  const dir = tmpDir('psi-containers-');
  const src = path.join(dir, 'source.md');
  fs.writeFileSync(src, '---\ntitle: Matrix\n---\n\n## statement: A {#a}\n\nWords.\n\n<!-- left open\n\n'
    + '## statement: B {#b}\n\nMore words.\n');
  const [b, li] = await Promise.all([run(BUILD, [src], dir), run(LINT, [src], dir)]);
  ok(b.code !== 0 && /comment opened on line 9 .* never closed/.test(b.out),
     'an unclosed comment: the build refuses it and names line 9', firstLine(b.out));
  ok(li.code === 1 && /source\.md:9\s+error\s+unclosed-comment/.test(li.out),
     'an unclosed comment: lint reports unclosed-comment on line 9', li.out.trim().split('\n')[0]);
}

if (verbose) {
  for (const r of results.sort((a, b) => a.where.localeCompare(b.where))) {
    console.log(`  ${r.built ? 'accept' : 'refuse'}  ${r.where}`);
  }
}

if (failures.length) {
  console.log(`containers: ${failures.length} failed, ${passed} passed (${jobs.length} decks)`);
  for (const f of failures) console.log('  FAIL ' + f);
  process.exit(1);
}
console.log(`containers: ${passed} passed (${jobs.length} decks)`);
