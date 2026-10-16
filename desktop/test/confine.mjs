// "Export as PDF…" and the disk: a deck's own script may not read a file the
// build may not read and write it into the PDF.
//
// In Electron a page opened from file:// can fetch() any other file: URL –
// Chrome refuses the same call, Electron does not – so a <script> in a
// source.md someone sent could climb `../` from the lecture's folder to a key
// in a dot-folder and print it into the handout. The export window's session
// now answers file: itself (electronDriver in main/pdf.js) and lets through
// only what local-files.mjs's fileUrlAllowed allows for the lecture.
//
// The fixture is a lecture two folders deep whose document reads, with a
// synchronous request so the read is done before the print: a text file two
// folders up, one one folder up, the folder above as a listing, and a page in
// the lecture's own folder – the last is the control that a read the rule
// allows still works. It is exported twice through the app's own driver in a
// real Electron: once with no rule at all, which must show the secrets (or
// the test could not see a leak), and once with the app's rule, which must
// not. Read back with pdftotext; without poppler it says so and passes,
// except under CI.
//
// Run: npm run confine   (from desktop/; xvfb-run on a runner with no display)

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const desktop = path.resolve(here, '..');
const repo = path.resolve(desktop, '..');
const require = createRequire(import.meta.url);

let failures = 0;
function check(what, ok, detail = '') {
  console.log(`${ok ? '  ✔' : '  ✘'} ${what}${ok || !detail ? '' : ` – ${detail}`}`);
  if (!ok) failures++;
}

if (spawnSync('pdftotext', ['-v']).error) {
  console.log('  · pdftotext is not on PATH, so the PDFs cannot be read back – skipped.');
  process.exit(process.env.CI ? 1 : 0);
}

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-builder-confine-'));
try {
  const lec = path.join(work, 'shared', 'lec');
  fs.mkdirSync(lec, { recursive: true });
  fs.writeFileSync(path.join(work, 'far-secret.txt'), 'PSIFARSECRETMARK\n');
  fs.writeFileSync(path.join(work, 'shared', 'near-secret.txt'), 'PSINEARSECRETMARK\n');
  fs.writeFileSync(path.join(lec, 'inside.html'), '<!doctype html><p>PSIINSIDEMARK</p>');
  fs.writeFileSync(path.join(lec, 'source.md'), `---
title: The confinement fixture
---

## free: A slide whose script reads the disk {#reads}

What the script read stands below.

<pre id="got"></pre>
<script>
(function () {
  var got = document.getElementById('got');
  ['inside.html', '../near-secret.txt', '../../far-secret.txt', '../'].forEach(function (u) {
    try {
      var x = new XMLHttpRequest();
      x.open('GET', u, false);
      x.send();
      got.textContent += u + ' ' + x.status + ' ' + x.responseText.replace(/<[^>]*>/g, ' ').slice(0, 400) + '\\n';
    } catch (e) { got.textContent += u + ' refused\\n'; }
  });
})();
</script>
`);
  const built = spawnSync(process.execPath, [path.join(repo, 'build.js'), path.join(lec, 'source.md'), '--print-only'],
    { encoding: 'utf8' });
  check('the fixture builds', built.status === 0, (built.stderr || '').slice(-300));

  const electron = require('electron');
  const exportWith = (mode) => {
    const out = path.join(work, `${mode}.pdf`);
    const r = spawnSync(electron, [path.join(here, 'confine-main.cjs'), path.join(lec, 'print.html'), repo, out, mode],
      { encoding: 'utf8', timeout: 120000, env: { ...process.env, ELECTRON_ENABLE_LOGGING: '' } });
    const line = (r.stdout || '').split('\n').find(l => l.startsWith('{'));
    const text = fs.existsSync(out)
      ? spawnSync('pdftotext', [out, '-'], { encoding: 'utf8' }).stdout.replace(/\s+/g, ' ')
      : '';
    return { status: r.status, result: line ? JSON.parse(line) : null, text, err: (r.stderr || '').slice(-400) };
  };

  const open = exportWith('open');
  check('the control: with no rule, Electron exports the document', open.status === 0 && !!open.result, open.err);
  check('…and the script read both secrets into it – the fixture leaks without the rule',
    /PSINEARSECRETMARK/.test(open.text) && /PSIFARSECRETMARK/.test(open.text), open.text.slice(0, 200));

  const ruled = exportWith('rule');
  check('with the app\'s rule, Electron exports the document', ruled.status === 0 && !!ruled.result, ruled.err);
  check('the page in the lecture\'s own folder is still read', /PSIINSIDEMARK/.test(ruled.text), ruled.text.slice(0, 200));
  check('neither secret reaches the PDF',
    !/PSINEARSECRETMARK|PSIFARSECRETMARK/.test(ruled.text), ruled.text.slice(0, 300));
  check('nor a listing of the folder above', !/near-secret\.txt|Index of/.test(ruled.text.replace(/\.\.\/near-secret\.txt/g, '')));
  const refused = ruled.result ? ruled.result.refusedFiles.map(f => f.url) : [];
  check('the export counts what it refused',
    refused.some(u => u.endsWith('/near-secret.txt')) && refused.some(u => u.endsWith('/far-secret.txt')),
    JSON.stringify(refused));
} finally {
  if (process.env.PSI_CONFINE_KEEP) console.log(`  · kept ${work}`);
  else fs.rmSync(work, { recursive: true, force: true });
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
