/*
 * A built view is the same bytes whichever flags produced it.
 *
 * `release.yml` fails when a tracked view on disk does not match a rebuild,
 * and three lectures track their views. That check is only meaningful if a
 * rebuild is a function of the source alone - and for a while it was not.
 * `inlineSvgCounter` numbers the id prefix of every inlined SVG and used to
 * reset once per *build* rather than once per view, so the same figure came
 * out `psiINT-fig-6-` under `--audience-only` and `psiINT-fig-8-` under a full
 * build. Content identical, bytes different: a contributor who iterated with
 * a partial flag and committed produced a diff of pure id churn and a view
 * that read as stale to CI.
 *
 * The obvious check does not catch this, which is why this file says so out
 * loud. Building twice with the SAME flags and comparing tests
 * reproducibility within a flag set, and that already passed while the
 * defect was live. The defect is a dependency ON the flag set, so the
 * comparison has to cross one.
 *
 * No browser and no `npm install` beyond what build.js already needs: it
 * builds a fixture deck into a temp dir, twice, and compares two files.
 */
import fs from 'node:fs';
import { tmpDir } from './tmp.mjs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* Standalone, like test/settings.mjs beside it, and NOT a test/gates/ entry
 * even though it is the kind of question gates answer. gates.yml runs on a
 * bare checkout with no `npm ci`, which is the property that suite exists to
 * have; this check spawns build.js, which needs the Markdown and Shiki stack.
 * A gate that cannot run in gates.yml is a gate nothing runs. So it lives
 * here and is wired where settings.mjs is wired: `npm test`, and release.yml
 * immediately before the staleness check it exists to make meaningful. */

// Two inlined SVGs and a ::: draw that splices one, because the floor the
// per-view counter starts from is whatever the parse minted for the
// diagrams - a fixture with no diagram would pass with the counter reset to
// zero and hide the collision that reset would cause.
const SOURCE = `---
title: T
---

## title: {#title}

## figure: One {#one}

![](fig-a)

## figure: Two {#two}

![](fig-b)
`;

const SVG = (hue) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">`
  + `<defs><linearGradient id="g"><stop offset="0" stop-color="hsl(${hue} 50% 50%)"/></linearGradient></defs>`
  + `<rect width="10" height="10" fill="url(#g)"/></svg>`;

let passed = 0; const failures = [];
const ok = (cond, what, detail = '') => {
  if (cond) { passed++; console.log('  \u2713 ' + what); return; }
  failures.push(what); console.log('  \u2717 ' + what + (detail ? '\n      ' + detail : ''));
};
const note = (line) => console.log('    ' + line);

{
  const dir = tmpDir('psi-repro-');
  fs.writeFileSync(path.join(dir, 'source.md'), SOURCE);
  // assets/, not beside source.md: the ![](id) shorthand resolves to
  // assets/<id>.<ext> and nowhere else. Written here because the first draft
  // of this fixture put them beside the source, inlined nothing at all, and
  // the check passed with zero figures to compare - green for the absence of
  // the thing it exists to measure. The build said `missing: assets/fig-a...`
  // in plain text at the time.
  fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'assets', 'fig-a.svg'), SVG(10));
  fs.writeFileSync(path.join(dir, 'assets', 'fig-b.svg'), SVG(200));

  // `clean` empties the folder of views first. The partial build below does
  // NOT: audience.html depends on which views stand beside it (the start
  // menu leaves out an entry whose file is missing - see siblingViewsAbsent
  // in build.js), so --audience-only into an empty folder is a different
  // input, not the same source under another flag. The case this check
  // exists for is the one release.yml meets - a tracked view rebuilt with a
  // partial flag beside the full set already on disk - and there the menu's
  // input is the same both times, so any difference left is a dependency on
  // the flag set. Only audience.html is removed, so the file compared is the
  // one this build wrote.
  const build = (clean, ...flags) => {
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith('.html') && (clean || f === 'audience.html')) fs.unlinkSync(path.join(dir, f));
    }
    const r = spawnSync(process.execPath, [path.join(ROOT, 'build.js'), path.join(dir, 'source.md'), ...flags],
      { cwd: ROOT, encoding: 'utf8' });
    if (r.status !== 0) throw new Error('build failed: ' + (r.stdout || '') + (r.stderr || ''));
    return fs.readFileSync(path.join(dir, 'audience.html'), 'utf8');
  };

  const full = build(true);
  // The fixture has to contain the thing under test, or every assertion
  // below passes by vacuity. This one line is why the check can go red.
  const n = (full.match(/\bid="psiINT-fig-\d+-root"/g) || []).length;
  ok(n === 2, 'the fixture inlined both of its SVGs', `${n} inlined`);

  ok(full === build(true), 'a full build is reproducible: two runs, same bytes');

  const partial = build(false, '--audience-only');
  const same = full === partial;
  if (!same) {
    const a = full.split('\n'), b = partial.split('\n');
    const diff = a.filter((l, i) => l !== b[i]);
    note(`${diff.length} line(s) differ; first: ${(diff[0] || '').slice(0, 90)}`);
  }
  ok(same, 'and --audience-only writes the same audience.html a full build does');

  // The property underneath it, stated directly so a failure says which half
  // broke: every id in one document is unique, whatever the floor was.
  const ids = [...full.matchAll(/\bid="(psiINT-fig-\d+-[^"]*)"/g)].map(m => m[1]);
  ok(ids.length === new Set(ids).size,
     'and every inlined-SVG id in the document is still unique',
     `${ids.length} ids, ${new Set(ids).size} distinct`);

  fs.rmSync(dir, { recursive: true, force: true });
}

// The WebP cache on disk (see prewarmWebp in build.js): a PNG or JPEG
// inlined into a view is encoded once per machine rather than once per run,
// and the pre-pass encodes several at once. Neither may change a byte, so the
// same deck is built with the cache off, cold and warm, from a damaged entry
// and against a cache folder that is a link - and the four views compared
// each time. Skipped, and said so, on a machine with no encoder: then there is
// nothing to cache and the original bytes go in either way.
{
  const enc = ['cwebp', 'magick'].find(b => spawnSync(b, ['-version'], { stdio: 'ignore' }).status === 0);
  if (!enc) {
    note('no cwebp or magick on PATH - the WebP cache has nothing to cache here, skipped');
  } else {
    const dir = tmpDir('psi-repro-webp-');
    fs.mkdirSync(path.join(dir, 'assets'));
    // A photograph WebP shrinks, a screenshot, and a 282-byte swatch that
    // comes out larger as WebP - the third outcome, cached all the same.
    fs.copyFileSync(path.join(ROOT, 'lectures/frame-lab/assets/photo.jpg'), path.join(dir, 'assets/photo.jpg'));
    fs.copyFileSync(path.join(ROOT, 'lectures/python-intro/assets/rendered-demo.png'), path.join(dir, 'assets/demo.png'));
    fs.copyFileSync(path.join(ROOT, 'lectures/diagrams/assets/swatch.png'), path.join(dir, 'assets/swatch.png'));
    fs.writeFileSync(path.join(dir, 'source.md'), `---\ntitle: T\n---\n\n## title: {#title}\n\n`
      + `## figure: One {#one}\n\n![](photo)\n\n## figure: Two {#two}\n\n![](demo)\n\n## figure: Three {#three}\n\n![](swatch)\n`);
    const cacheRoot = tmpDir('psi-repro-cache-');
    const VIEWS = ['audience', 'speaker', 'print', 'print-notes'];
    const build = (cache) => {
      for (const v of VIEWS) fs.rmSync(path.join(dir, v + '.html'), { force: true });
      const r = spawnSync(process.execPath, [path.join(ROOT, 'build.js'), path.join(dir, 'source.md')],
        { cwd: ROOT, encoding: 'utf8', env: { ...process.env, PSI_CACHE_DIR: cache } });
      if (r.status !== 0) throw new Error('build failed: ' + (r.stdout || '') + (r.stderr || ''));
      return { views: VIEWS.map(v => fs.readFileSync(path.join(dir, v + '.html'), 'utf8')), log: r.stdout };
    };
    const entries = (d) => { try { return fs.readdirSync(d).filter(f => f.endsWith('.webp')); } catch { return []; } };
    const same = (a, b) => a.views.every((v, i) => v === b.views[i]);

    const off = build('off');
    ok(/image\/webp;base64/.test(off.views[0]), `the fixture inlines a picture as WebP (${enc})`);
    const store = path.join(cacheRoot, 'webp');
    const cold = build(cacheRoot);
    ok(same(off, cold), 'a build that fills the cache writes the same four views as one with the cache off');
    ok(entries(store).length === 3, 'and leaves one entry per picture, the one WebP makes larger included',
       entries(store).join(', '));
    const mode = fs.statSync(store).mode & 0o777;
    ok(process.platform === 'win32' || mode === 0o700, 'the cache folder is the user\'s alone', mode.toString(8));
    const warm = build(cacheRoot);
    ok(same(off, warm), 'a build from the cache writes the same four views');
    ok(warm.log.includes('[images]') && warm.log.replace(/\d+(\.\d+)? ?s\b/g, '') === cold.log.replace(/\d+(\.\d+)? ?s\b/g, ''),
       'and says the same about its pictures');

    // Equal views would also come from a cache nobody reads. Two whole
    // entries swapped must show up in the output - then put back.
    {
      const [a, b] = entries(store).map(f => path.join(store, f))
        .sort((x, y) => fs.statSync(y).size - fs.statSync(x).size);
      const ba = fs.readFileSync(a), bb = fs.readFileSync(b);
      fs.writeFileSync(a, bb); fs.writeFileSync(b, ba);
      ok(!same(off, build(cacheRoot)), 'the warm build did read the cache: two entries swapped change the views');
      fs.writeFileSync(a, ba); fs.writeFileSync(b, bb);
    }

    // A damaged entry is an encode, never a build that fails or a picture
    // that is half there: cut every entry in half and build again.
    for (const f of entries(store)) {
      const p = path.join(store, f);
      fs.writeFileSync(p, fs.readFileSync(p).subarray(0, 40));
    }
    ok(same(off, build(cacheRoot)), 'a cache whose entries are cut short is read past, and the views are the same');
    const whole = entries(store).every(f => fs.statSync(path.join(store, f)).size > 40);
    ok(whole, 'and the entries are whole again afterwards');

    // A cache folder that is a link is not written through.
    const elsewhere = tmpDir('psi-repro-elsewhere-');
    const linked = tmpDir('psi-repro-linked-');
    let linkMade = true;
    try { fs.symlinkSync(elsewhere, path.join(linked, 'webp'), 'dir'); } catch { linkMade = false; }
    if (linkMade) {
      const viaLink = build(linked);
      ok(same(off, viaLink), 'with the cache folder a link, the views are the same');
      ok(fs.readdirSync(elsewhere).length === 0, 'and nothing is written where the link points',
         fs.readdirSync(elsewhere).join(', '));
      ok(/the WebP cache is not written this run/.test(viaLink.log), 'and the build says the cache was not written');
    } else {
      note('could not make a symbolic link here - the linked-cache case is skipped');
    }
  }
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
