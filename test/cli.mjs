#!/usr/bin/env node
/*
 * node test/cli.mjs
 *
 * The command line as an author meets it: a typo'd flag, a value in the wrong
 * form, an option without the flag that reads it, -h, a folder for a file,
 * a port that is taken. Before the flag table every one of these either built
 * an ordinary deck and exited 0 (`--wacth`, `--check-fit=true`, `--port 8080`
 * without --serve) or died in a Node stack trace (`EISDIR`, `EADDRINUSE`,
 * `RangeError` on --port 99999), and `-h` was taken for a file name.
 *
 * What is asserted for a refusal: exit 1, the sentence, no stack trace, and no
 * view written – a refusal that builds first is the silent no-op with a
 * message on top. The --help text is checked against the table it is made
 * from (read out of build.js as text, as the `cli` gate reads it), which is
 * the half the gate cannot run.
 *
 * It runs build.js as a subprocess, so it needs `npm install` and is not a
 * gate (see test/README.md); it needs no browser.
 */
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpDir } from './tmp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = path.join(ROOT, 'build.js');

let passed = 0;
const failures = [];
function ok(cond, what, detail = '') {
  if (cond) { passed++; return; }
  failures.push(detail ? `${what}\n      ${String(detail).split('\n').slice(0, 4).join(' / ')}` : what);
}

function run(args, { cwd = ROOT, timeout = 60000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [BUILD, ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    const timer = setTimeout(() => child.kill('SIGKILL'), timeout);
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, out, err }); });
  });
}

const STACK = /\bat .*\(.*:\d+:\d+\)|\n\s+at /;
const dir = tmpDir('psi-cli-');
const deck = path.join(dir, 'talk');
fs.mkdirSync(deck);
const src = path.join(deck, 'source.md');
fs.writeFileSync(src, '---\ntitle: CLI\n---\n\n## statement: One {#one}\n\nA sentence.\n');
const views = () => ['audience', 'print', 'print-notes', 'speaker']
  .filter(v => fs.existsSync(path.join(deck, v + '.html')));
const clean = () => { for (const v of views()) fs.rmSync(path.join(deck, v + '.html')); };

// Every refusal: exit 1, the words, no stack, nothing written. Run one at a
// time, because "nothing written" is read off the one deck folder.
async function refused(args, re, what) {
  clean();
  const r = await run(args);
  ok(r.code === 1, `${what}: exit 1`, `exit ${r.code}\n${r.err}${r.out}`);
  ok(re.test(r.err), `${what}: says so`, r.err || r.out);
  ok(!STACK.test(r.err), `${what}: without a stack trace`, r.err);
  ok(!views().length, `${what}: writes no view`, views().join(', '));
  return r;
}

// ── unknown flags, with the nearest name ─────────────────────────────
const near = [
  ['--wacth', '--watch'], ['--serv', '--serve'], ['--check-fitt', '--check-fit'],
  ['--audience-onyl', '--audience-only'], ['--no-inline-image', '--no-inline-images'],
  ['--integrate', '--integrate-annotations'], ['--pdf-zom=1.2', '--pdf-zoom=1.2'],
  ['-watch', '--watch'],
];
for (const [typed, meant] of near) {
  await refused([src, typed],
    new RegExp(`^Error: ${typed.replace(/[.]/g, '\\.')} is not a flag of build\\.js\\. Did you mean ${meant.replace(/[.]/g, '\\.')}\\?`),
    `${typed} -> ${meant}`);
}
await refused([src, '-w'], /^Error: -w is not a flag of build\.js\.\n {2}node build\.js --help/,
  '-w: too little to guess from, so no guess');
await refused([src, '--souffleuse'], /--souffleuse is now --prompter\./,
  'the pre-rename name keeps its own refusal');

// ── values in the wrong form ─────────────────────────────────────────
await refused([src, '--check-fit=true'], /^Error: --check-fit takes no value/, '--check-fit=true');
await refused([src, '--serve', '--port=8080'], /^Error: --port takes its value as the next word: --port 8080/,
  '--port=8080');
await refused([src, '--slides-pdf', '--pdf-zoom', '1.2'], /^Error: --pdf-zoom needs a value, as --pdf-zoom=<value>\./,
  '--pdf-zoom 1.2');
await refused([src, '--watch', '--prompter', '--prompter-model', '--watch'],
  /^Error: --prompter-model takes an OpenRouter model id.*\n {2}--watch is a flag, not its value\./,
  'a flag is not taken for a value');
await refused([src, '--squint', '--squint-out'], /^Error: --squint-out takes a path, or "-" for stdout\./,
  'a value missing at the end of the line');
await refused([src, '--check-fit', '--viewport', 'big'], /--viewport takes WIDTHxHEIGHT/,
  'a viewport is checked before the build it would measure');

// ── an option without the flag that reads it ─────────────────────────
await refused([src, '--port', '8080'], /^Error: --port without --serve or --present\.\n.*\n {2}node build\.js <source\.md> --serve --port 8080/,
  '--port without --serve');
await refused([src, '--viewport', '1600x900'], /^Error: --viewport without --check-fit, --squint or --frames\./,
  '--viewport alone');
await refused([src, '--squint-out', 'x.txt'], /^Error: --squint-out without --squint\./, '--squint-out alone');
await refused([src, '--dry-run'], /^Error: --dry-run without --optimize-images\./, '--dry-run alone');
await refused([src, '--all'], /^Error: --all without --optimize-images\./, '--all alone');
await refused([src, '--max-width', '900'], /^Error: --max-width without --optimize-images\./, '--max-width alone');
await refused([src, '--into', dir], /^Error: --into without --new\./, '--into alone');

// ── commands that build nothing, and flags that cannot run together ──
await refused(['--new', 'slug', '--watch'], /^Error: --watch does nothing with --new\.\n {2}--new writes a new lecture folder/,
  '--new with --watch');
await refused(['--new', 'slug', '--optimize-images'], /are separate commands; run one at a time/,
  'two commands at once');
await refused([src, '--integrate-annotations', '--audience-only'],
  /^Error: --audience-only does nothing with --integrate-annotations\./, '--integrate-annotations with a build flag');
await refused([src, '--watch', '--check-fit'],
  /^Error: --check-fit and --watch are mutually exclusive\.\n {2}--check-fit looks at one finished build/,
  '--check-fit with --watch');
await refused([src, '--watch', '--squint', '--frames'],
  /^Error: --squint, --frames and --watch are mutually exclusive\./, '--squint --frames with --watch');
await refused([src, src], /^Error: build\.js takes one source\.md, and was given 2/, 'two sources');
await refused(['--new', 'a', 'b'], /^Error: --new takes one slug, and was given 2: a, b\./, '--new with two slugs');
{
  const r = await refused([src, '--wacth', '--events'], /Did you mean --watch\?/, 'a refusal under --events');
  const line = r.out.split('\n').find(l => l.startsWith('{"type":'));
  let ev = null;
  try { ev = JSON.parse(line); } catch { /* reported below */ }
  ok(ev && ev.type === 'build-error' && ev.userFacing === true && ev.stack === null,
    'under --events a refusal is the build-error line a driver already reads', line);
}

// ── help ─────────────────────────────────────────────────────────────
const buildSrc = fs.readFileSync(BUILD, 'utf8');
const a = buildSrc.indexOf('// cli-flags:start');
const b = buildSrc.indexOf('// cli-flags:end');
// The file under test, read as text: the same literal the gate evaluates.
// eslint-disable-next-line no-new-func
const { CLI_FLAGS } = a >= 0 && b > a
  ? new Function(buildSrc.slice(a, b) + '\nreturn { CLI_FLAGS };')()
  : { CLI_FLAGS: [] };
ok(CLI_FLAGS.length > 0, 'build.js carries the flag table');
for (const asked of [['-h'], ['--help'], [src, '--wacth', '-h']]) {
  const r = await run(asked);
  const what = asked.join(' ');
  ok(r.code === 0, `${what}: exit 0`, `exit ${r.code}\n${r.err}`);
  ok(/^Usage:\n/.test(r.out), `${what}: the help on stdout`, r.out.slice(0, 200));
  ok(r.err === '', `${what}: nothing on stderr`, r.err);
}
{
  const r = await run(['--help']);
  const rows = r.out.split('\n').filter(l => /^ {2}--/.test(l)).map(l => l.trim().split(/[\s,=]/)[0]);
  const missing = CLI_FLAGS.filter(f => !f.hidden && !rows.includes(f.name)).map(f => f.name);
  ok(!missing.length, 'the help has a row for every flag that is not hidden', missing.join(', '));
  const shown = CLI_FLAGS.filter(f => f.hidden && r.out.includes(f.name)).map(f => f.name);
  ok(!shown.length, 'and none for a hidden one', shown.join(', '));
  ok(/Shift-S/.test(r.out), 'the prompter group says how it is switched on');
}
{
  const r = await run([]);
  ok(r.code === 1 && r.out === '' && /^Usage:\n/.test(r.err),
    'a bare node build.js: the help on stderr, exit 1', `exit ${r.code}`);
}
{
  const r = await run(['--watch']);
  ok(r.code === 1 && /^No source\.md given: node build\.js <source\.md> --watch/.test(r.err),
    'flags without a source: one sentence, not the whole help', r.err);
}

// ── a folder for a file ──────────────────────────────────────────────
{
  clean();
  const r = await run([deck, '--audience-only']);
  ok(r.code === 0 && /^Using .*talk\/source\.md\.\n/.test(r.out),
    'a folder with a source.md builds it and says so in one line', r.out.split('\n')[0] + r.err);
  ok(views().join() === 'audience', 'and writes what was asked', views().join(', '));
  clean();
}
await refused([dir], /is a folder with no source\.md in it\. It holds 1 lecture folder \(talk\); name one, e\.g\.\n {2}node build\.js .*talk/,
  'a folder of lectures names one');
{
  const empty = path.join(dir, 'empty');
  fs.mkdirSync(empty);
  await refused([empty], /empty is a folder with no source\.md in it\.\n {2}build\.js takes one lecture's source\.md, or the folder that holds it\./,
    'an empty folder');
  await refused(['--frames', deck], /--frames took .*talk as the folder its pictures go to; put the source first/,
    'a source folder written after --frames');
}

// ── ports ────────────────────────────────────────────────────────────
await refused([src, '--serve', '--port', 'abc'], /^Error: --port takes a port number from 1 to 65535, and abc is not one\./,
  '--port abc');
await refused([src, '--serve', '--port', '99999'], /^Error: --port takes a port number from 1 to 65535, and 99999 is not one\./,
  '--port 99999');
{
  const blocker = net.createServer();
  await new Promise(res => blocker.listen(0, '127.0.0.1', res));
  const port = blocker.address().port;
  await refused([src, '--watch', '--serve', '--port', String(port)],
    new RegExp(`^Error: port ${port} is in use – by another build\\.js --serve, or by another program\\.\\n {2}Pick another`),
    'a busy port under --watch --serve, before the watcher builds');
  await refused([src, '--serve', '--port', String(port)], new RegExp(`^Error: port ${port} is in use`),
    'a busy port on a one-shot build, before it builds');
  blocker.close();
}

// ── and what still works ─────────────────────────────────────────────
{
  clean();
  const r = await run([src, '--audience-only', '--no-optimize-images']);
  ok(r.code === 0 && views().join() === 'audience', 'an ordinary build', r.err);
  clean();
}

if (failures.length) {
  console.log(`cli: ${failures.length} failed, ${passed} passed`);
  for (const f of failures) console.log('  FAIL ' + f);
  process.exit(1);
}
console.log(`cli: ${passed} passed`);
