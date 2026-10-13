/*
 * The cockpit's clock, set by hand: a minute back, a minute forward, and the
 * time since the planned start.
 *
 * The clock is a number the speaker reads against the @mm:ss marks on the
 * cue cards, and a talk that begins five minutes late has lost five minutes
 * the clock does not show. So it can be moved without being restarted - and
 * everything here is about the three ways that goes wrong quietly: a clock
 * that sets itself (a rehearsal at another hour must find 0:00), a clock
 * below zero, and a drift beside it that still answers to the old reading.
 *
 * **The time of day is given, not waited for.** `start:` is read against the
 * wall clock of the window, so every page here is opened under Playwright's
 * clock at a moment the case names: 14:25 for a 14:20 talk, 14:10 before it,
 * a quarter past midnight after it. The dates are built from local fields in
 * Node and read with local fields in the page, which is one zone as long as
 * the context names none - and no assertion depends on which zone that is.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpDir } from './tmp.mjs';
import { ROOT, serve } from './harness.mjs';

export const name = 'clock · cockpit';
export const lecture = 'tutorial';

const deck = (frontmatter) => `---
title: Clock
${frontmatter}---

## title: {#title}

## free: First {#first}

One.

> note: @0:30 **The opening**, said on time.

## free: Second {#second}

Two.

> note: @2:00 **The second thing**, two minutes in.
`;

function build(frontmatter) {
  const dir = tmpDir('psi-clock-');
  fs.writeFileSync(path.join(dir, 'source.md'), deck(frontmatter));
  const r = spawnSync(process.execPath, [path.join(ROOT, 'build.js'), path.join(dir, 'source.md')],
    { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) throw new Error('fixture build failed:\n' + (r.stdout || '') + (r.stderr || ''));
  return dir;
}

const secondsOf = (text) => {
  const p = String(text).split(':').map(Number);
  return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1];
};

export async function run({ page, report }) {
  const { ok } = report;
  const planned = await serve(build('start: 14:20\n'));
  const plain = await serve(build(''));
  const errors = [];

  // A cockpit under a clock that says `at`. A new page each time: the fake
  // clock is installed before the first script runs, which is the only moment
  // tStart can be made to mean something.
  const open = async (port, at) => {
    const p = await page.context().newPage();
    p.on('pageerror', e => errors.push(String(e)));
    await p.clock.install({ time: at });
    await p.goto('http://127.0.0.1:' + port + '/speaker.html', { waitUntil: 'load' });
    await p.clock.runFor(1200);
    return p;
  };
  const timer = (p) => p.evaluate(() => document.getElementById('psiINT-timer').textContent);
  const secs = async (p) => secondsOf(await timer(p));
  const toast = (p) => p.evaluate(() => {
    const t = document.getElementById('psiINT-center-toast');
    return t && t.classList.contains('visible') ? t.textContent : '';
  });
  const press = async (p, k) => { await p.keyboard.press(k); await p.clock.runFor(50); };
  // A few seconds of slack: the page has been open for one or two of them,
  // and the digits are a second behind until the next tick repaints them.
  const near = (got, want) => got >= want - 1 && got <= want + 4;

  // ── nothing sets the clock by itself ─────────────────────────────
  const at1425 = new Date(2026, 9, 12, 14, 25, 0);
  const spk = await open(planned.port, at1425);
  ok(near(await secs(spk), 0),
     'a cockpit opened five minutes after the planned start still opens at 0:00 - a rehearsal must', await timer(spk));
  const box = await spk.evaluate(() => {
    const b = document.getElementById('psiINT-clock-box');
    return {
      inStage: !!b && b.parentElement.id === 'psiINT-stage-cell',
      ids: [...b.children].map(c => c.id).join(' '),
      plan: (document.getElementById('psiINT-clock-plan') || {}).textContent,
    };
  });
  ok(box.inStage && box.ids === 'psiINT-clock-plan psiINT-clock-back psiINT-clock-fwd psiINT-clock',
     'the clock stands over the stage with its three buttons beside it', JSON.stringify(box));
  ok(box.plan === 'since 14:20', 'and the button for the planned start says which', box.plan);

  // ── the planned start ────────────────────────────────────────────
  await press(spk, 'z');
  ok(near(await secs(spk), 300), 'Z at 14:25 puts a talk planned for 14:20 at 5:00', await timer(spk));
  ok(/since 14:20/.test(await toast(spk)), 'and says what it did', await toast(spk));
  await spk.clock.runFor(30000);
  ok(near(await secs(spk), 330), 'from where it runs on', await timer(spk));
  await spk.click('#psiINT-clock');
  await spk.clock.runFor(50);
  ok(near(await secs(spk), 0), 'a click on the clock still restarts it at 0:00', await timer(spk));
  await spk.click('#psiINT-clock-plan');
  await spk.clock.runFor(50);
  ok(near(await secs(spk), 330), 'and the button beside it does what Z does', await timer(spk));

  // ── a minute back, a minute forward ──────────────────────────────
  let was = await secs(spk);
  await press(spk, '>');
  ok(near(await secs(spk), was + 60), '> moves the clock a minute forward', await timer(spk));
  ok(/\+1 min/.test(await toast(spk)), 'and says so', await toast(spk));
  await press(spk, 'Shift+>');
  ok(near(await secs(spk), was + 120), 'with Shift held too, which is how > is typed', await timer(spk));
  await press(spk, '<');
  await press(spk, 'Shift+<');
  ok(near(await secs(spk), was), '< moves it a minute back, with Shift or without', await timer(spk));
  await spk.click('#psiINT-clock-fwd');
  await spk.clock.runFor(50);
  ok(near(await secs(spk), was + 60), 'the +1 button is the same minute', await timer(spk));
  await spk.click('#psiINT-clock-back');
  await spk.clock.runFor(50);
  ok(near(await secs(spk), was), 'and the −1 button takes it back', await timer(spk));
  const idx = await spk.evaluate(() => state.activeIdx);
  ok(idx === 0, 'none of which moved a slide', String(idx));

  // never below zero
  await spk.click('#psiINT-clock');
  await spk.clock.runFor(20000);
  await press(spk, '<');
  ok((await secs(spk)) === 0, 'a minute back from 0:20 is 0:00, not less', await timer(spk));
  await press(spk, '<');
  ok((await secs(spk)) === 0 && /0:00/.test(await toast(spk)), 'and at 0:00 the key says so and does nothing',
     (await timer(spk)) + ' · ' + (await toast(spk)));
  await spk.clock.runFor(3000);
  ok(near(await secs(spk), 3), 'the clock runs on from there', await timer(spk));

  // ── the drift beside the clock follows at once ───────────────────
  await press(spk, 'ArrowDown');
  await press(spk, 'k');
  await spk.clock.runFor(600);
  const inHeader = await spk.evaluate(() => {
    const b = document.getElementById('psiINT-clock-box');
    const h = document.getElementById('psiINT-cue-where').getBoundingClientRect();
    const boxes = [...b.children].map(c => c.getBoundingClientRect());
    return b.parentElement.id === 'psiINT-cue-where'
      && boxes.every(r => r.width > 8 && r.top >= h.top - 0.5 && r.bottom <= h.bottom + 0.5);
  });
  ok(inHeader, 'in the cue cards the clock moves into the column header and takes its buttons along');
  await press(spk, 'z');
  const drift = () => spk.evaluate(() => document.getElementById('psiINT-drift').textContent);
  // On #first, its @0:30 card said: behind is measured against the next
  // mark, @2:00, and the talk is 5:20-odd in.
  const d0 = await drift();
  const behind = (await secs(spk)) - 120;
  ok(/^\+\d:\d0$/.test(d0) && Math.abs(secondsOf(d0.slice(1)) - behind) <= 10 && behind > 180,
     'set to the planned start, the drift is the minutes the late start cost', d0 + ' at ' + (await timer(spk)));
  await press(spk, '<');
  const d1 = await drift();
  ok(secondsOf(d0.slice(1)) - secondsOf(d1.slice(1)) === 60,
     'and a minute back is a minute less behind, without waiting for the next tick', d0 + ' → ' + d1);
  await spk.click('#psiINT-clock-fwd');
  await spk.clock.runFor(50);
  ok((await drift()) === d0, 'the +1 in the header puts it back', await drift());

  // ── a reload keeps what a gesture set, a fresh window does not ───
  await spk.close();

  // ── a reload keeps what a gesture set, a fresh window does not ───
  // On the real clock, in a context of its own: whether a load is a reload is
  // asked of the browser's navigation entry, which the fake clock does not
  // carry - and that clock is the context's, not the page's.
  const realContext = await page.context().browser().newContext({ viewport: { width: 1440, height: 900 } });
  const real = await realContext.newPage();
  real.on('pageerror', e => errors.push(String(e)));
  await real.goto('http://127.0.0.1:' + planned.port + '/speaker.html', { waitUntil: 'load' });
  await real.waitForTimeout(600);
  await real.keyboard.press('>');
  await real.keyboard.press('>');
  await real.waitForTimeout(200);
  await real.reload({ waitUntil: 'load' });
  await real.waitForTimeout(1200);
  ok(near(await secs(real), 121), 'a reload comes back to the clock the speaker set', await timer(real));
  await real.click('#psiINT-clock');
  await real.reload({ waitUntil: 'load' });
  await real.waitForTimeout(1200);
  ok(near(await secs(real), 2), 'a restart is a gesture too, and a reload does not undo it', await timer(real));
  await real.keyboard.press('>');
  await real.goto('http://127.0.0.1:' + planned.port + '/speaker.html?again', { waitUntil: 'load' });
  await real.waitForTimeout(1200);
  ok(near(await secs(real), 1), 'a cockpit navigated to afresh starts at 0:00', await timer(real));
  await real.reload({ waitUntil: 'load' });
  await real.waitForTimeout(1200);
  ok(near(await secs(real), 1), 'and has forgotten the old clock for good', await timer(real));
  await realContext.close();

  // ── before the planned start the clock holds ─────────────────────
  const early = await open(planned.port, new Date(2026, 9, 12, 14, 10, 0));
  await press(early, 'z');
  const waiting = () => early.evaluate(() => document.getElementById('psiINT-clock-box').classList.contains('waiting'));
  ok((await secs(early)) === 0 && await waiting(), 'Z ten minutes early holds the clock at 0:00', await timer(early));
  ok(/until 14:20/.test(await toast(early)), 'and says until when', await toast(early));
  await early.clock.runFor(5 * 60000);
  ok((await secs(early)) === 0 && await waiting(), 'where it still stands five minutes later', await timer(early));
  await early.clock.runFor(6 * 60000);
  ok(near(await secs(early), 60) && !(await waiting()), 'and from 14:20 it runs by itself', await timer(early));
  // A step lets go of the plan.
  await early.click('#psiINT-clock');
  await early.evaluate(() => { document.getElementById('psiINT-clock-plan').dataset.start = String(18 * 60); });
  await press(early, 'z');
  ok((await secs(early)) === 0 && await waiting(), 'a start hours ahead holds too');
  await press(early, '>');
  ok(near(await secs(early), 60) && !(await waiting()), 'and a minute forward from a holding clock is 1:00, running', await timer(early));
  await early.close();

  // ── the day the time of day belongs to ───────────────────────────
  const night = await open(planned.port, new Date(2026, 9, 13, 0, 15, 0));
  await night.evaluate(() => { document.getElementById('psiINT-clock-plan').dataset.start = String(23 * 60 + 35); });
  await press(night, 'z');
  ok(near(await secs(night), 40 * 60), 'a quarter past midnight is forty minutes into a talk planned for 23:35', await timer(night));
  await night.evaluate(() => { document.getElementById('psiINT-clock-plan').dataset.start = String(14 * 60 + 20); });
  await press(night, 'z');
  ok(near(await secs(night), 9 * 3600 + 55 * 60), 'and 9:55 hours after yesterday\'s 14:20, because that is under twelve', await timer(night));
  await night.close();
  const morning = await open(planned.port, new Date(2026, 9, 12, 3, 0, 0));
  await press(morning, 'z');
  ok((await secs(morning)) === 0 && /until 14:20/.test(await toast(morning)),
     'at three in the morning yesterday\'s talk is more than twelve hours gone and today\'s is ahead', (await timer(morning)) + ' · ' + (await toast(morning)));
  await morning.close();

  // ── a deck that names no start ───────────────────────────────────
  const bare = await open(plain.port, at1425);
  ok(await bare.evaluate(() => !document.getElementById('psiINT-clock-plan')
       && !!document.getElementById('psiINT-clock-back') && !!document.getElementById('psiINT-clock-fwd')),
     'without start: there is no button for it, and the two minute buttons are there all the same');
  await press(bare, 'z');
  ok(near(await secs(bare), 0) && /start:/.test(await toast(bare)),
     'Z leaves the clock alone and names the key that is missing', (await timer(bare)) + ' · ' + (await toast(bare)));
  await press(bare, '>');
  ok(near(await secs(bare), 60), 'and > still moves it', await timer(bare));
  // The panel lists all three, and runs them.
  const rows = await bare.evaluate(() => ['clock-back', 'clock-forward', 'clock-plan']
    .map(id => !!document.querySelector('#psiINT-help-overlay dt[data-cmd="' + id + '"]')).join());
  ok(rows === 'true,true,true', 'the ? panel has a row for each of the three', rows);
  await bare.close();

  // The projection answers none of them: the clock is the cockpit's.
  const aud = await page.context().newPage();
  aud.on('pageerror', e => errors.push(String(e)));
  await aud.goto('http://127.0.0.1:' + planned.port + '/audience.html', { waitUntil: 'load' });
  await aud.waitForTimeout(500);
  const before = await aud.evaluate(() => JSON.stringify([state.activeIdx, state.zoom, document.body.className]));
  for (const k of ['z', '<', '>']) await aud.keyboard.press(k);
  await aud.waitForTimeout(200);
  ok(before === await aud.evaluate(() => JSON.stringify([state.activeIdx, state.zoom, document.body.className])),
     'and Z, < and > do nothing in the projection');
  await aud.close();

  ok(errors.length === 0, 'no page errors in any of the windows', errors.join(' | '));
  planned.server.close();
  plain.server.close();
}
