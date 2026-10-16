#!/usr/bin/env node
/*
 * node test/present.mjs
 *
 * Starting a talk without a wrapper script: what `--watch --serve`,
 * `--prompter`, `--open` and `--present` print and do, from the start to
 * Ctrl-C. Before this, the content repository carried a rehearse.sh and a
 * generated Start.command for it, because on a fresh folder the engine
 * printed no address at all (the list was made before the first build), took
 * a new random port on every start (a new origin, so position, theme and
 * unexported live annotations were gone), left a tab open across a restart
 * knocking on a dead port every 500 ms, opened no browser, said "disabled"
 * without a key and nothing about where one goes, and on Ctrl-C said nothing
 * about where the debrief was.
 *
 * Every run here gets PSI_OPEN=print, so --open says what it would open and
 * no window appears, and an XDG_CONFIG_HOME of its own, so the key file is
 * the one this spec writes and never the machine's. OPENROUTER_API_KEY and
 * OPENROUTER_BASE_URL are removed from the environment. No run makes a call:
 * a call needs a cockpit that says hello, and nothing here opens one.
 *
 * The page half of a restart (a tab of the old run reloads itself, once) is
 * in test/watch-resume.mjs, which has a browser; this spec holds the server
 * half – the same port and the `run` message – with a socket of its own.
 *
 * It runs build.js as a subprocess, so it needs `npm install`; no browser.
 */
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import { tmpDir } from './tmp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = path.join(ROOT, 'build.js');

let passed = 0;
const failures = [];
function ok(cond, what, detail = '') {
  if (cond) { passed++; return true; }
  failures.push(detail ? `${what}\n      ${String(detail).split('\n').slice(0, 6).join(' / ')}` : what);
  return false;
}

const dir = tmpDir('psi-present-');
const cfg = path.join(dir, 'config');
fs.mkdirSync(cfg);
const keyFile = path.join(cfg, 'psi-slides', 'openrouter.key');
const deck = (name, fm = '') => {
  const d = path.join(dir, name);
  fs.mkdirSync(d);
  fs.writeFileSync(path.join(d, 'source.md'),
    `---\ntitle: ${name}\n${fm}---\n\n## statement: One {#one}\n\nA sentence.\n\n## statement: Two {#two}\n\nAnother.\n`);
  return d;
};
const talk = deck('talk');
const prompted = deck('prompted', 'prompter:\n  cadence: 30\n');

const ENV = { ...process.env, PSI_OPEN: 'print', XDG_CONFIG_HOME: cfg };
delete ENV.OPENROUTER_API_KEY;
delete ENV.OPENROUTER_BASE_URL;

const live = new Set();
// A run that keeps going: its output so far, a wait for a line, and a stop.
function start(args, { env = {}, cwd = ROOT } = {}) {
  const child = spawn(process.execPath, [BUILD, ...args, '--no-optimize-images'],
    { cwd, env: { ...ENV, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  live.add(child);
  const run = { child, out: '', code: null, signal: null };
  const waiters = [];
  const feed = (d) => {
    run.out += d;
    for (const w of [...waiters]) {
      const m = w.re.exec(run.out);
      if (m) { waiters.splice(waiters.indexOf(w), 1); w.done(m); }
    }
  };
  child.stdout.on('data', feed);
  child.stderr.on('data', feed);
  const ended = new Promise((resolve) => child.on('close', (code, signal) => {
    live.delete(child);
    run.code = code; run.signal = signal;
    for (const w of waiters.splice(0)) w.done(null);
    resolve(run);
  }));
  run.wait = (re, ms = 30000) => new Promise((resolve) => {
    const m = re.exec(run.out);
    if (m) return resolve(m);
    if (run.code !== null || run.signal) return resolve(null);
    const w = { re, done: resolve };
    waiters.push(w);
    setTimeout(() => { const k = waiters.indexOf(w); if (k >= 0) { waiters.splice(k, 1); resolve(null); } }, ms);
  });
  run.stop = (sig = 'SIGTERM') => { try { child.kill(sig); } catch { /* gone */ } return ended; };
  run.ended = ended;
  return run;
}

const COCKPIT = /cockpit {5}http:\/\/localhost:(\d+)\/speaker\.html/;
const watchPortOf = (d) => {
  const m = /new WebSocket\('ws:\/\/127\.0\.0\.1:(\d+)'\)/.exec(fs.readFileSync(path.join(d, 'speaker.html'), 'utf8'));
  return m ? Number(m[1]) : null;
};
const runOf = (d) => {
  const m = /const psiRun = "([0-9a-f]+)";/.exec(fs.readFileSync(path.join(d, 'speaker.html'), 'utf8'));
  return m ? m[1] : null;
};
const darwin = process.platform === 'darwin';

try {
  // ── F1, F2: the addresses after the first build, on the lecture's port ──
  const r1 = start([path.join(talk, 'source.md'), '--watch', '--serve']);
  const a1 = await r1.wait(COCKPIT);
  await r1.wait(/with notes .*\n\n/);
  ok(!!a1, 'a fresh folder: the cockpit\'s address is printed', r1.out);
  const port1 = a1 ? Number(a1[1]) : null;
  ok(r1.out.indexOf('[initial]') >= 0 && r1.out.indexOf('[initial]') < r1.out.search(COCKPIT),
    'after the first build, not before it', r1.out);
  for (const [label, file] of [['projection', 'audience'], ['document', 'print'], ['with notes', 'print-notes']]) {
    ok(new RegExp(`${label} +http://localhost:${port1}/${file}\\.html`).test(r1.out), `and the ${label}'s`, r1.out);
  }
  ok(port1 >= 41000 && port1 <= 44999, 'on a port of the lecture\'s own range', port1);
  ok(!/prompter +Chrome/.test(r1.out), 'no prompter line without a prompter', r1.out);
  ok(/Serving \S+ on http:\/\/localhost:\d+ – loopback only, Ctrl-C to stop/.test(r1.out),
    'the Serving line says loopback and Ctrl-C', r1.out);
  const watch1 = watchPortOf(talk);
  const run1 = runOf(talk);
  ok(watch1 >= 45000 && watch1 <= 48999, 'the reload socket on the lecture\'s own port too', watch1);
  ok(!!run1, 'the page knows which run built it');
  ok(!/this run's log/.test(r1.out), 'nothing about a prompter log');
  const e1 = await r1.stop('SIGINT');
  ok(e1.signal === 'SIGINT' || e1.code === 130, 'Ctrl-C ends it as Ctrl-C does', `${e1.code} ${e1.signal}`);
  ok(!/this run's log/.test(e1.out), 'and with no prompter it says nothing more', e1.out.slice(-200));

  // A restart: the same origin, a page of the first run told it is stale.
  const r2 = start([path.join(talk, 'source.md'), '--watch', '--serve']);
  const a2 = await r2.wait(COCKPIT);
  ok(a2 && Number(a2[1]) === port1, 'a restart serves on the same port', `${port1} then ${a2 && a2[1]}`);
  ok(watchPortOf(talk) === watch1, 'and puts the reload socket on the same port', `${watch1} then ${watchPortOf(talk)}`);
  const run2 = runOf(talk);
  ok(run2 && run2 !== run1, 'the new build carries a run of its own', `${run1} ${run2}`);
  const said = await new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${watch1}`, { origin: `http://localhost:${port1}` });
    const t = setTimeout(() => { ws.terminate(); resolve(null); }, 5000);
    ws.on('message', (d) => { clearTimeout(t); ws.close(); resolve(String(d)); });
    ws.on('error', () => { clearTimeout(t); resolve(null); });
  });
  let msg = null;
  try { msg = JSON.parse(said); } catch { /* reported below */ }
  ok(msg && msg.type === 'run' && msg.id === run2 && msg.id !== run1,
    'a page of the first run, connecting again, hears that this is another run', said);
  const refusedSock = await new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${watch1}`, { origin: 'https://example.com' });
    ws.on('open', () => { ws.close(); resolve(false); });
    ws.on('error', () => resolve(true));
  });
  ok(refusedSock, 'a page of another origin still cannot open the socket');

  // Taken: by another program, and the start says so and moves on.
  const blocker = net.createServer();
  const watchBlocker = net.createServer();
  await r2.stop();
  await new Promise(res => blocker.listen(port1, '127.0.0.1', res));
  await new Promise(res => watchBlocker.listen(watch1, '127.0.0.1', res));
  const r3 = start([path.join(talk, 'source.md'), '--watch', '--serve']);
  const a3 = await r3.wait(COCKPIT);
  ok(a3 && Number(a3[1]) !== port1, 'its port taken, the lecture serves on another', r3.out);
  ok(new RegExp(`Port ${port1}, this lecture's own, is taken – by this lecture in another terminal, or by another program – so ${a3 && a3[1]} it is\\.`).test(r3.out),
    'and says so in one line', r3.out);
  ok(new RegExp(`The reload socket's port ${watch1} is taken – using \\d+`).test(r3.out),
    'the reload socket too', r3.out);
  await r3.stop();
  blocker.close();
  watchBlocker.close();

  // ── F4: --open ──
  const r4 = start([path.join(talk, 'source.md'), '--watch', '--serve', '--open']);
  const o4 = await r4.wait(/\[open\] (.*): (\S+)/);
  ok(o4 && o4[1] === 'the default browser' && /^http:\/\/localhost:\d+\/speaker\.html$/.test(o4[2]),
    '--open opens the cockpit in the default browser', o4 && o4[0]);
  ok(r4.out.search(COCKPIT) >= 0 && r4.out.search(COCKPIT) < r4.out.indexOf('[open]'),
    'after the addresses are printed', r4.out);
  await r4.stop();
  const r4b = start([path.join(talk, 'source.md'), '--watch', '--open']);
  const o4b = await r4b.wait(/\[open\] (.*): (\S+)/);
  ok(o4b && /^file:\/\/.*\/talk\/speaker\.html$/.test(o4b[2]), 'without --serve, the file', o4b && o4b[0]);
  await r4b.stop();
  {
    const r = start([path.join(talk, 'source.md'), '--open']);
    const e = await r.ended;
    ok(e.code === 1 && /^Error: --open without --watch, --serve or --present\./.test(e.out),
      '--open on a build that ends is refused', e.out);
  }

  // ── F5, F6: the key ──
  const r5 = start([path.join(prompted, 'source.md'), '--watch', '--prompter']);
  await r5.wait(/^Prompter: /m);
  ok(/\[prompter\] no OpenRouter key, so this is a dry run – for hints, put the key in .*psi-slides\/openrouter\.key \(chmod 600\) and start again\./.test(r5.out),
    'no key: a dry run, said in one line that names where the key goes', r5.out);
  ok(/nothing goes to a model/.test(r5.out) && !/disabled/.test(r5.out), 'not "disabled"', r5.out);
  ok(/Prompter: open speaker\.html in Chrome .*Shift-S/.test(r5.out),
    'without --serve, one line on Chrome and Shift-S', r5.out);
  await r5.stop();

  fs.mkdirSync(path.dirname(keyFile), { recursive: true });
  fs.writeFileSync(keyFile, '# mine\nOPENROUTER_BASE_URL=http://127.0.0.1:9/evil\nOPENROUTER_API_KEY="sk-from-the-file"\n', { mode: 0o600 });
  fs.chmodSync(keyFile, 0o600);
  const r6 = start([path.join(prompted, 'source.md'), '--watch', '--prompter']);
  await r6.wait(/^Watching /m);
  ok(new RegExp(`\\[prompter\\] the key: ${keyFile.replace(/[.]/g, '\\.')}`).test(r6.out),
    'the key file is read when the environment has none, and the start says so', r6.out);
  ok(/the live prompter is on/.test(r6.out) && /to https:\/\/openrouter\.ai\/api\/v1/.test(r6.out),
    'a live run, to the default endpoint', r6.out);
  ok(!/evil|127\.0\.0\.1:9/.test(r6.out), 'OPENROUTER_BASE_URL in the file is not read', r6.out);
  ok(!r6.out.includes('sk-from-the-file'), 'and the key is not printed');
  await r6.stop();

  const r7 = start([path.join(prompted, 'source.md'), '--watch', '--prompter'],
    { env: { OPENROUTER_API_KEY: 'sk-from-the-env' } });
  await r7.wait(/^Watching /m);
  ok(/\[prompter\] the key: OPENROUTER_API_KEY/.test(r7.out), 'the environment wins over the file', r7.out);
  await r7.stop();

  if (process.platform !== 'win32') {
    fs.chmodSync(keyFile, 0o644);
    const r8 = start([path.join(prompted, 'source.md'), '--watch', '--prompter']);
    await r8.wait(/^Watching /m);
    ok(/openrouter\.key can be read by other accounts \(mode 644; chmod 600 it\), so it is not read, so this is a dry run – for hints, fix that and start again\./.test(r8.out),
      'a key file others can read is refused, as ssh refuses a key, and the run is dry', r8.out);
    await r8.stop();
  }
  fs.rmSync(keyFile);

  // A .env beside the lecture, or in the folder the command runs in, is never read.
  fs.writeFileSync(path.join(prompted, '.env'), 'OPENROUTER_API_KEY=sk-from-a-sent-deck\nOPENROUTER_BASE_URL=http://127.0.0.1:9/\n');
  const r9 = start(['source.md', '--watch', '--prompter'], { cwd: prompted });
  await r9.wait(/^Watching /m);
  ok(/no OpenRouter key, so this is a dry run/.test(r9.out) && !/127\.0\.0\.1:9/.test(r9.out),
    'a .env in the lecture folder and the working folder is not read', r9.out);
  await r9.stop();
  fs.rmSync(path.join(prompted, '.env'));

  // ── F7: Ctrl-C says where the debrief is ──
  for (const f of fs.readdirSync(prompted)) if (/^prompter-/.test(f)) fs.rmSync(path.join(prompted, f));
  const r10 = start([path.join(prompted, 'source.md'), '--watch', '--prompter', '--prompter-dry-run']);
  await r10.wait(/^Watching /m);
  const e10 = await r10.stop('SIGINT');
  // G2: seconds in the name, so two runs started in one minute keep a file
  // each, and `-dry` on a dry run's, so a debrief's default passes it over.
  const logs = fs.readdirSync(prompted).filter(f => /^prompter-\d{8}-\d{6}-dry\.jsonl$/.test(f));
  const prompts = fs.readdirSync(prompted).filter(f => /^prompter-[0-9a-f]+\.prompt\.txt$/.test(f));
  ok(logs.length === 1 && prompts.length === 1, 'the run wrote its log and its prompt', fs.readdirSync(prompted).join(', '));
  ok(logs.length === 1 && new RegExp(`\\[prompter\\] this run's log: \\S*${logs[0]} · its prompt: \\S*${prompts[0]}\\n$`).test(e10.out),
    'Ctrl-C: one line naming both, and it is the last thing said', e10.out.slice(-300));
  ok(e10.signal === 'SIGINT' || e10.code === 130, 'and the run ends as Ctrl-C ends it', `${e10.code} ${e10.signal}`);
  {
    const recs = logs.length === 1 ? fs.readFileSync(path.join(prompted, logs[0]), 'utf8').trim().split('\n').map(l => JSON.parse(l)) : [];
    const session = recs.find(r => r.type === 'session');
    ok(session && session.dryRun === true, 'the dry run\'s session line says dryRun', JSON.stringify(session));
    const last = recs[recs.length - 1];
    ok(last && last.type === 'end' && last.how === 'SIGINT' && typeof last.elapsed === 'number',
      'and its log closes with an end line saying how it stopped', JSON.stringify(last));
  }
  // A run with a key is not a dry run, and its name says nothing of one. The
  // key is a fake and the endpoint a closed port: nothing is asked of it.
  for (const f of fs.readdirSync(prompted)) if (/^prompter-/.test(f)) fs.rmSync(path.join(prompted, f));
  const r10k = start([path.join(prompted, 'source.md'), '--watch', '--prompter'],
    { env: { OPENROUTER_API_KEY: 'sk-test-not-a-key', OPENROUTER_BASE_URL: 'http://127.0.0.1:9/v1' } });
  await r10k.wait(/^Watching /m);
  const e10k = await r10k.stop('SIGTERM');
  const keyed = fs.readdirSync(prompted).filter(f => /^prompter-\d{8}-\d{6}\.jsonl$/.test(f));
  ok(keyed.length === 1, 'a run with a key writes prompter-YYYYMMDD-HHMMSS.jsonl', fs.readdirSync(prompted).join(', '));
  if (keyed.length === 1) {
    const recs = fs.readFileSync(path.join(prompted, keyed[0]), 'utf8').trim().split('\n').map(l => JSON.parse(l));
    const session = recs.find(r => r.type === 'session');
    ok(session && session.dryRun === false, 'with dryRun: false on its session line', JSON.stringify(session));
    ok(recs[recs.length - 1].type === 'end' && recs[recs.length - 1].how === 'SIGTERM',
      'and SIGTERM closes it as Ctrl-C does', JSON.stringify(recs[recs.length - 1]));
  }
  ok(e10k.signal === 'SIGTERM' || e10k.code === 143, 'and the run ends as SIGTERM ends it', `${e10k.code} ${e10k.signal}`);

  // ── F8: --present ──
  const r11 = start([prompted, '--present']);
  const a11 = await r11.wait(COCKPIT);
  ok(!!a11, '--present on a lecture with a prompter block: watching and serving', r11.out);
  const o11 = await r11.wait(/\[open\] (.*): (\S+)/);
  ok(/prompter +Chrome only \(speech recognition\) – Shift-S in the cockpit switches it on/.test(r11.out),
    'with the prompter, and one line on Chrome and Shift-S', r11.out);
  ok(/no OpenRouter key, so this is a dry run/.test(r11.out), 'dry, with no key', r11.out);
  ok(o11 && o11[1] === (darwin ? 'Google Chrome' : 'the default browser') && o11[2] === `http://localhost:${a11 && a11[1]}/speaker.html`,
    'and opens the cockpit, in Chrome where it can say so', o11 && o11[0]);
  await r11.stop();

  const r12 = start([path.join(talk, 'source.md'), '--present']);
  const o12 = await r12.wait(/\[open\] (.*): (\S+)/);
  ok(o12 && o12[1] === 'the default browser', '--present without a prompter block opens the default browser', r12.out);
  ok(!/\[prompter\]/.test(r12.out), 'and starts no prompter: a key on the machine is not enough', r12.out);
  await r12.stop();

  const r13 = start([path.join(talk, 'source.md'), '--present', '--prompter-dry-run']);
  await r13.wait(/\[open\]/);
  ok(/\[prompter\] dry run/.test(r13.out) && /prompter +Chrome only/.test(r13.out),
    '--present --prompter-dry-run starts the prompter on a lecture without a block', r13.out);
  await r13.stop();

  const free = await new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
  });
  const r14 = start([path.join(talk, 'source.md'), '--present', '--port', String(free)]);
  const a14 = await r14.wait(COCKPIT);
  ok(a14 && Number(a14[1]) === free, '--present --port N serves on N', r14.out);
  await r14.stop();

  for (const [extra, re] of [
    [['--audience-only'], /^Error: --present and --audience-only cannot run together\.\n {2}--present builds all four views/],
    [['--check-fit'], /^Error: --present and --check-fit cannot run together\.\n {2}--check-fit works on one finished build and exits/],
    [['--slides-pdf'], /^Error: --present and --slides-pdf cannot run together\./],
  ]) {
    const r = start([path.join(talk, 'source.md'), '--present', ...extra]);
    const e = await r.ended;
    ok(e.code === 1 && re.test(e.out), `--present ${extra.join(' ')} is refused`, e.out);
  }
} finally {
  for (const c of live) { try { c.kill('SIGKILL'); } catch { /* gone */ } }
}

if (failures.length) {
  console.log(`present: ${failures.length} failed, ${passed} passed`);
  for (const f of failures) console.log('  FAIL ' + f);
  process.exit(1);
}
console.log(`present: ${passed} passed`);
