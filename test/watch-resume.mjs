/*
 * The authoring loop under --watch: a save keeps the place, a broken save
 * says so.
 *
 * A save reloads every open view. The live views kept only an index in
 * localStorage, and the reveal state not at all, so a chunk added above the
 * one being worked on put the page on its neighbour, at its first beat –
 * and a stepped figure took three presses after every save. And a save the
 * build refused changed nothing in the browser: the page sat on the last
 * good build, and only the terminal said why.
 *
 * Now each window stashes chunk id, beats and freeze just before the reload
 * and takes them back once (psiWatchResume), the snapshot between the two
 * windows names the chunk by id as well as by index, and a failed rebuild
 * puts a banner in the cockpit – in the projection only while no cockpit
 * answers – which the next good build's reload takes away.
 *
 * A fixture deck and an engine of its own, from file://, which is how an
 * author runs --watch.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { tmpDir } from './tmp.mjs';
import { ROOT, settle } from './harness.mjs';

export const name = 'watch · a save keeps the place, a broken save says so';
export const lecture = 'tutorial';
// Run alone, after the parallel batch (test/run.mjs): a --watch engine of its
// own, and timing that depends on two windows reloading at once.
export const serial = true;

const HEAD = `---
title: Watch resume
---
`;
const ONE = `
## free: One {#one}

The first slide.
`;
const TWO = `
## free: Two {#two}

Two, opening.

---

Two, second beat.

---

Two, third beat.
`;
const THREE = `
## free: Three {#three}

The third slide.
`;
const added = (n) => `
## free: Added ${n} {#added-${n}}

A slide written above the one being worked on.
`;
// Its error message quotes the heading, markup and all, on the first line.
const BROKEN = `
## bogus: <img src=x onerror=window.__pwn=1> {#broken}

Text.
`;

function startWatch(src) {
  const child = spawn(process.execPath,
    [path.join(ROOT, 'build.js'), src, '--watch', '--events', '--no-optimize-images'],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  const events = [];
  const waiters = [];
  let buf = '';
  child.stdout.on('data', (b) => {
    buf += b;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      if (!line.startsWith('{"type":')) continue;
      let ev; try { ev = JSON.parse(line); } catch { continue; }
      events.push(ev);
      for (const w of [...waiters]) if (w.test(ev)) { waiters.splice(waiters.indexOf(w), 1); w.done(ev); }
    }
  });
  child.stderr.on('data', () => {});
  // The next event of a type, from now on.
  const next = (type, ms = 20000) => new Promise((resolve) => {
    const w = { test: (ev) => ev.type === type, done: resolve };
    waiters.push(w);
    setTimeout(() => { const k = waiters.indexOf(w); if (k >= 0) { waiters.splice(k, 1); resolve(null); } }, ms);
  });
  return { child, next, events };
}

const where = (p) => p.evaluate(() => {
  const e = flatChunks[state.activeIdx] || {};
  return { id: e.id, beat: revealed[e.id] ?? null, n: flatChunks.length };
});
const banner = (p) => p.evaluate(() => {
  const b = document.getElementById('psiINT-build-failed');
  return b ? { text: b.textContent, shown: !b.hidden && getComputedStyle(b).display !== 'none', img: !!b.querySelector('img') }
    : null;
});
const until = (p, fn, arg, timeout = 8000) =>
  p.waitForFunction(fn, arg, { timeout, polling: 100 }).then(() => true, () => false);
const bannerShown = (p) => until(p, () => {
  const b = document.getElementById('psiINT-build-failed');
  return !!b && !b.hidden && getComputedStyle(b).display !== 'none';
});
const press = async (p, key, n = 1) => {
  for (let i = 0; i < n; i++) { await p.keyboard.press(key); await settle(p, 400, { quick: true }); }
};

export async function run({ page, report }) {
  const { ok } = report;
  const dir = tmpDir('psi-watch-resume-');
  const src = path.join(dir, 'source.md');
  let body = HEAD + ONE + TWO + THREE;
  fs.writeFileSync(src, body);
  const eng = startWatch(src);
  const ctx = await page.context().browser().newContext({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  const watch = (p, who) => p.on('pageerror', e => errors.push(who + ': ' + e));
  // A save, and the reload of every page given: each page's next load.
  const save = async (text, pages, expect = 'build-success') => {
    const loads = pages.map(p => p.waitForEvent('load', { timeout: 20000 }).then(() => true, () => false));
    const built = eng.next(expect);
    fs.writeFileSync(src, text);
    const ev = await built;
    const reloaded = await Promise.all(loads);
    for (const p of pages) await settle(p, 1500);
    return { ev, reloaded: reloaded.every(Boolean) };
  };
  try {
    ok(!!(await eng.next('watching')), 'the engine builds the fixture and watches it');

    // ── 1. the projection alone: a chunk added above, the place kept ──
    const aud = await ctx.newPage();
    watch(aud, 'projection');
    await aud.goto('file://' + path.join(dir, 'audience.html'), { waitUntil: 'load' });
    await settle(aud, 1500);
    await press(aud, 'ArrowRight');
    await press(aud, 'ArrowDown', 2);
    let w = await where(aud);
    ok(w.id === 'two' && w.beat === 3, 'walked to the third beat of #two', JSON.stringify(w));

    body = HEAD + added(1) + ONE + TWO + THREE;
    let s = await save(body, [aud]);
    ok(s.reloaded, 'the save reloads the projection');
    w = await where(aud);
    ok(w.n === 4, 'the reloaded page is the new build', JSON.stringify(w));
    ok(w.id === 'two', 'a chunk added above: still on #two, not on its neighbour', JSON.stringify(w));
    ok(w.beat === 3, 'and on the same beat', JSON.stringify(w));
    ok(await aud.evaluate(() => [...flatChunks.find(c => c.id === 'two').el.querySelectorAll('.reveal-segment')]
      .every(x => !x.hasAttribute('data-hidden'))), 'all three segments of #two are on the slide');

    // ── 2. a broken save: the banner, its text, no markup ──
    s = await save(body + BROKEN, [], 'build-error');
    ok(!!s.ev, 'the broken save fails the build');
    ok(await bannerShown(aud), 'the projection with no cockpit shows that the rebuild failed');
    let b = await banner(aud);
    ok(!!b && /rebuild failed/i.test(b.text) && b.text.includes('<img src=x'),
      'with the first line of the message, as text', JSON.stringify(b));
    ok(!!b && !b.img && await aud.evaluate(() => window.__pwn === undefined),
      'the quoted markup is not markup', JSON.stringify(b));
    ok(!!b && /last good build/.test(b.text), 'and says the page still shows the last good build', b && b.text);
    w = await where(aud);
    ok(w.id === 'two' && w.beat === 3, 'the page has not moved', JSON.stringify(w));

    // A document hears only that it failed, and says the terminal has why.
    const doc = await ctx.newPage();
    watch(doc, 'print');
    await doc.goto('file://' + path.join(dir, 'print.html'), { waitUntil: 'load' });
    ok(await bannerShown(doc), 'a document opened while the source is broken says so as well');
    b = await banner(doc);
    ok(!!b && /terminal/.test(b.text) && !b.text.includes('bogus'),
      'without the reason: a document carries no secret', JSON.stringify(b));

    // ── 3. fixed: the banner goes with the reload, the place stays ──
    s = await save(body, [aud, doc]);
    ok(s.reloaded, 'the fix reloads both pages');
    ok(!(await banner(aud)) && !(await banner(doc)), 'and the banner is gone from both');
    w = await where(aud);
    ok(w.id === 'two' && w.beat === 3, 'still #two, beat 3', JSON.stringify(w));
    await doc.close();

    // ── 4. with a cockpit: both windows come back to the same place ──
    const [spk] = await Promise.all([ctx.waitForEvent('page'), aud.keyboard.press('s')]);
    watch(spk, 'cockpit');
    await spk.waitForLoadState('load');
    ok(await until(spk, () => document.getElementById('psiINT-freeze-btn').textContent === '● live'),
      'the cockpit opened from the projection is live');
    w = await where(spk);
    ok(w.id === 'two' && w.beat === 3, 'and on the projection\'s place', JSON.stringify(w));

    body = HEAD + added(1) + added(2) + ONE + TWO + THREE;
    s = await save(body, [aud, spk]);
    ok(s.reloaded, 'a save reloads both windows');
    await settle(spk, 1500);
    const wa = await where(aud), ws = await where(spk);
    ok(wa.n === 5 && ws.n === 5, 'both on the new build', JSON.stringify([wa, ws]));
    ok(wa.id === 'two' && wa.beat === 3 && ws.id === 'two' && ws.beat === 3,
      'both on #two, beat 3', JSON.stringify([wa, ws]));
    ok(await until(spk, () => document.getElementById('psiINT-freeze-btn').textContent === '● live'),
      'and the cockpit finds its projection again');

    // Broken: the cockpit says so, the projection on the wall does not.
    s = await save(body + BROKEN, [], 'build-error');
    ok(await bannerShown(spk), 'with a cockpit attached the cockpit shows the failure');
    b = await banner(spk);
    ok(!!b && b.text.includes('bogus'), 'with the reason', JSON.stringify(b));
    await aud.waitForTimeout(500);
    b = await banner(aud);
    ok(!b || !b.shown, 'and the projection does not', JSON.stringify(b));
    s = await save(body, [aud, spk]);
    ok(!(await banner(spk)), 'the next good build takes it away');

    // ── 5. frozen: the cockpit looks ahead, a save, the room stays put ──
    await spk.bringToFront();
    await press(spk, 'v');
    await press(spk, 'ArrowRight');
    ok((await where(spk)).id === 'three' && (await where(aud)).id === 'two',
      'frozen, the cockpit is on #three and the room on #two');
    body = HEAD + added(1) + added(2) + added(3) + ONE + TWO + THREE;
    s = await save(body, [aud, spk]);
    ok(s.reloaded, 'a save while frozen reloads both');
    await aud.waitForTimeout(1500);
    const fa = await where(aud), fs2 = await where(spk);
    ok(fs2.id === 'three' && fa.id === 'two' && fa.beat === 3,
      'the cockpit is still looking ahead and the room is where it was', JSON.stringify([fa, fs2]));
    ok(await spk.evaluate(() => frozen === true), 'the cockpit is still frozen');
    await press(spk, 'v');
    ok(await until(aud, () => (flatChunks[state.activeIdx] || {}).id === 'three'),
      'thawing hands the room the cockpit\'s slide', JSON.stringify(await where(aud)));

    // ── 6. a chunk that is gone: the old index, clamped ──
    await press(spk, 'ArrowRight');
    body = HEAD + added(1) + added(2) + added(3) + ONE + TWO;
    s = await save(body, [aud, spk]);
    await settle(aud, 1500);
    const ga = await where(aud), gs = await where(spk);
    ok(ga.id === gs.id && ga.n === 5, 'a deleted chunk: both windows land on one slide of the new deck', JSON.stringify([ga, gs]));
  } finally {
    await ctx.close();
    try { eng.child.kill('SIGTERM'); } catch {}
  }
  ok(errors.length === 0, 'no page errors in any window', errors.join(' | '));
}
