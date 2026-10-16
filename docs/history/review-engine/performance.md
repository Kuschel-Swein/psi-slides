# Performance review – psi-slides engine at 3bedb93

Reviewer dimension: performance, measured. Machine: Apple Silicon Mac, Node 25.8.1,
Playwright's Chromium 1243 headless, viewport 1600x900. "4x" below means CDP
`Emulation.setCPUThrottlingRate 4`, a stand-in for a weaker lecture-hall laptop.
All builds ran on copies of the decks under `scratchpad/work/perf/`, never in the
content repo. Scripts used: `scratchpad/work/perf/prof/*.mjs`.

**Bottom line:** the build is not a problem (0.3–0.6 s cold for every real deck
without PNG/JPEG, ~0.15–0.24 s from save to `build-success` under `--watch`). The
two things worth acting on are (1) the slide change that moves the auto-fit zoom,
which restyles the whole document and costs 10–40x an ordinary press – 165 ms
median in the cockpit at 4x – and (2) the fixed weight of a live view: about
2 MB before the first slide, ~740 KB of it comments.

## Measurements

Cold build = one `node build.js <source.md>` (all four views), wall clock, no
cache on disk. Rebuild = `--watch --events`, file rewritten, time to
`build-success` (includes the 80 ms debounce), six saves each.

| deck | chunks | `::: draw` | images inlined | cold build s | rebuild ms | audience MB | speaker MB | print MB | print-notes MB |
|---|---|---|---|---|---|---|---|---|---|
| infeinfb/00-willkommen | 77 | 37 | 26 | 0.35 | 224–239 | 3.89 | 4.13 | 1.83 | 1.89 |
| infeinfb/10-c | 78 | 25 | 9 | 0.32 | – | 2.70 | 2.93 | 0.98 | 1.04 |
| introsp/30-softsec-code | 80 | 9 | 10 | 0.39 | – | 3.51 | 3.70 | 1.96 | 2.00 |
| keynote-2036 | 27 | 20 | 3 (1 PNG transcoded) | 0.56 | 170–195 | 4.45 | 4.65 | 2.85 | 2.89 |
| eds/20-introduction | 33 | 7 | 9 (+2 staged clips) | 0.35 | – | 4.02 | 4.16 | 2.58 | 2.59 |
| advasp/50-censorship | 32 | 0 | 14 (14 PNG/JPEG transcoded) | **1.94** | 137–165 | 2.77 | 2.94 | 2.28 | 2.31 |
| advasp/40-anon-comm | 39 | 0 | 20 (16 transcoded) | **1.77** | – | 2.52 | 2.70 | 2.04 | 2.06 |
| advasp/70-software-security | 60 | 0 | 8 (8 transcoded) | 0.91 (2nd run 0.85) | – | 1.48 | 1.62 | 0.98 | 0.98 |
| engine network-security | 37 | 36 | 2 | 0.36 | 203–241 | 3.02 | 3.15 | 1.09 | 1.09 |
| engine diagrams | 47 | 33 | 3 | 0.28 | – | 2.51 | 2.64 | 0.85 | 0.85 |
| engine tutorial | 63 | 3 | 2 | 0.27 | – | 2.54 | 2.68 | 1.03 | 1.03 |
| `--new` scaffold (3 chunks) | 3 | 1 | 0 | – | – | 2.03 | 2.16 | 0.57 | 0.57 |

Browser, unthrottled (load = `loadEventEnd` from `file://`; slide change = synchronous keydown handler):

| deck / view | load ms | elements | slide change, `<html>` zoom unchanged (median) | slide change, zoom changed (median, n) | at 4x, zoom changed |
|---|---|---|---|---|---|
| infeinfb audience | 161–193 | 6,553 | 0.6 ms | 28.8 ms (4 of 99) | – |
| infeinfb speaker | 344–349 | 13,009 | 1.9 ms | 37.5 ms (21 of 87) | **165 ms**, max 260 |
| diagrams audience | 159 | 5,739 | 2.7 ms | 22.1 ms (48 of 52) | **95 ms**, max 131 |
| keynote-2036 audience | 161 | 2,441 | 3.4 ms | 10.8 ms (21 of 30) | – |
| network-security audience | 150 | 5,799 | – | handler p50 1.4 / p90 3.2 ms overall | – |

Load at 4x: infeinfb audience 688 ms, speaker 1,314 ms. Reveal-only presses:
p50 < 1 ms everywhere. No frame over 25 ms during the 400 ms after any press
(pan transition and figure tweens are smooth). Idle for 10 s: audience 0 ms of
work, 0 rAF; speaker two 1 s intervals (the clock), 8 ms of work in 10 s. JS heap
2.4–3.7 MB.

Cold-build CPU profile, infeinfb/00-willkommen (400 ms total, `--cpu-prof`):
module compile/bootstrap ~100 ms (`compileSourceTextModule` 36, `compileForInternalLoader` 24,
Shiki's inlined wasm 15), `diagram-core.mjs` 63 ms (`renderDiagram` 12, `layoutDiagram`,
`parseDiagramSource`), build.js 41 ms, marked 31 ms, `node:fs` 21 ms, qrcode 12 ms, output
`utf8Write` 14 ms. keynote-2036 (590 ms): **`spawnSync` 289 ms – one `cwebp` call**, the
rest as above. Nothing is computed per view that could be computed once: diagrams compile
once at parse time (`build.js:6027`, shared markup), fonts once (`bundledFacesCache`), Shiki,
KaTeX, QR and WebP are memoised (`highlightCache`, `mathCache`, `qrCache`, `webpInlineCache`).
No image is inlined twice in one file outside the editor's asset table (checked on every
built view).

Tests: `npm run gate` 2.4 s wall (1,974 assertions). Browser suite 843 s wall, 205 s CPU: see finding 7.

---

## 1. A slide change that moves the auto-fit zoom restyles and relays the whole document

**Impact: high (the one user-visible latency found). CONFIRMED.**

`fitZoomToChunk` already walks its trial zooms on the one chunk (`build.js:23067–23135`,
`onChunk` at `23140`), which is good. But `commitZoom` → `showZoom` (`build.js:23151`, `23160`) then
writes `--zoom` on `<html>` whenever the fitted zoom differs from the last one, and every
rule reading `var(--zoom)` (51 selectors, all on `.chunk` or below per the zoom-scope gate)
inherits it – so the *next* layout read restyles and relays every chunk of the deck, not
just the one on screen. That read is `resetViewportScroll()` at the top of `focusCamera`
(`build.js:20100`, `21464`): in a Chromium CPU profile of 200 presses on
`lectures/diagrams` it holds 954 ms of self time (forced style + layout), 18 ms per slide
change, more than everything else in the runtime together.

Measured per slide change (in-page `performance.now()` around the keydown dispatch,
grouped by whether `<html>`'s `--zoom` changed):

- diagrams audience: 22.1 ms with a zoom change (48 of 52 changes – `auto-fit: true`
  re-fits almost every slide) vs 2.7 ms without; **95 ms at 4x**, worst 131 ms.
- infeinfb speaker: 37.5 ms vs 1.9 ms; **165 ms median at 4x, worst 260 ms**.
- keynote-2036 audience: 10.8 ms vs 3.4 ms. Cost scales with element count.

Under `transition: cut` (diagrams, keynote) that is the time the new slide takes to
appear; under `pan` it delays the start of the glide.

Experiment (CSS injected into the built page, no engine change):
`.chunk:not(.active){content-visibility:auto;contain-intrinsic-size:auto 1200px auto 800px}`
cut the zoom-changing slide change to 11.9 ms on diagrams (from 22.1) and to 12.2 ms on the
infeinfb cockpit (from 37.5, together with `.preview-slot{content-visibility:auto}`).

**Suggested fix**, in order of risk: (a) `content-visibility: auto` on inactive chunks
(and preview slots) – measured 2–3x, but it has to be checked against the camera's
`getOffset`, the overview board, `--check-fit`, `--frames` and the PDF export, all of
which measure off-screen chunks; (b) commit the zoom on the active chunk only and move
the `<html>` write to an idle callback after the transition, where the neighbours (only
visible under `neighbours: dim`) catch up. Effort **M**. Re-measure with
`prof/slow.mjs` (`THROTTLE=4`).

## 2. The cockpit forces three full layouts per slide change

**Impact: medium (adds to finding 1 in the view the lecturer drives). CONFIRMED (profile), fix PLAUSIBLE.**

CPU profile of 200 presses in infeinfb `speaker.html` (87 slide changes), self time that
is forced style/layout: `resetViewportScroll` 1,284 ms, **`autoSizeNotes` 835 ms**,
**`getBoundingClientRect` 706 ms** (from `scrollPreviewToActive`). The order inside one
`applyState` (`build.js:21205`): `viewHooks.onActiveChange` (`build.js:27760`) → `populateNotesPane` →
`autoSizeNotes` (`build.js:27363`) writes the textarea height, reads `getComputedStyle` + `scrollHeight`
(layout 1), writes the height again → `markPreviewCurrent` (`27558`) toggles classes and
`scrollPreviewToActive` (`27539`) reads two rects (layout 2) → `focusCamera` reads scroll offsets
(layout 3). Each is a full layout of a 13,000-element document (`populatePreviewStrip`, `27485`, clones every
chunk into the preview strip once at load, so it has twice the audience's elements). CDP counted
~42 layouts per press in the cockpit against ~7 in the projection.

**Suggested fix:** size the notes textarea with CSS (`field-sizing: content;
min-height: 1lh; max-height: 3lh`, Chromium 123+, with the JS as fallback) or move
`autoSizeNotes` and `scrollPreviewToActive` into one `requestAnimationFrame` after the
camera has been placed, so the press pays one layout. Effort **S**.

## 3. A live view weighs ~2 MB before the first slide; ~740 KB of it is comments

**Impact: medium (file size for mail, LMS upload, USB sticks; four views per deck).
CONFIRMED.** Load time is *not* affected much (finding 3a).

The `--new` scaffold – three chunks, one small figure – builds a 2.03 MB `audience.html`
and 2.16 MB `speaker.html`. Breakdown of infeinfb `audience.html` (3.98 MB), by an
HTML-tokenising script (`prof/size2.mjs`):

| part | KB | share |
|---|---|---|
| inline JS | 1,369 | 34% |
| – of which `window.PSI_DG` (diagram-core.mjs + editor.mjs as text) | 966 | 24% |
| images (data: URIs) | 828 + 207 in the editor's asset JSON | 26% |
| fonts (6 woff2, base64) | 372 | 9% |
| CSS (excl. fonts) | 356 | 9% |
| `psi-diagram-frames` JSON | 263 | 7% |
| diagram SVG markup | 254 | 6% |
| HTML/text | 229 | 6% |

Stripping comments with a real parser (TypeScript's `transpileModule`, `removeComments`,
no other transform, 0 parse failures) and CSS comments by regex: **740 KB less per live
view** on every deck measured (18.6% of infeinfb audience, 28.6% of tutorial audience,
16.3% of keynote). 497 KB of the 966 KB `PSI_DG` block is comments, and `AUDIENCE_JS`
is about half comment as well. That is ~1.5 MB per deck across the two live views.

The comments are the project's documentation and must stay in the source; the
suggestion is to strip them on the way into the output only, for the three modules read
as text (`diagramCoreScript`, `editorJs`, `commandsScript` – `build.js:3631–3713`), where
a tokenizer-safe strip is easy because they are separate files, and for the CSS literals.
Costs: a strip that must be parser-correct (a regex is not – strings and regex literals
contain `//`), and stack traces from the page lose their line correspondence with the
module. A dependency-free option is a small comment-aware tokenizer run in a gate against
`acorn`-free test cases. Effort **M**.

### 3a. The diagram editor ships 966 KB into every live view of a deck with a figure

`editor: none` on infeinfb shrinks `audience.html` from 3.99 to 2.71 MB and `speaker.html`
from 4.23 to 2.96 MB (−1.28 MB each, −32%). Load time barely moves (unthrottled 167 vs
187 ms, at 4x 688 vs 636 ms) because V8 lazily parses the IIFE, so this is a bytes issue,
not a speed issue. Options if bytes matter: strip comments (above); or carry the editor as
`<script type="text/plain">` (or gzip+base64 decoded with `DecompressionStream`) and
evaluate it on the first `E`. Effort **M–L**. Not urgent.

## 4. Every cold build transcodes every PNG/JPEG serially, ~0.13–0.3 s each

**Impact: low–medium (cold builds of photo-heavy decks; CI; the desktop app's first
build). CONFIRMED.**

`webpInlineBytes` (`build.js:553`) calls the encoder with `execFileSync` per image, using
`-q 92 -m 6 -sharp_yuv` (`build.js:30232`). `-m 6` is cwebp's slowest method: one
2628x1630 PNG takes **289 ms** in `spawnSync` (half of keynote-2036's 0.56 s build), while
plain `cwebp -q 92` takes 0.11 s. advasp/50-censorship (14 rasters) builds in 1.94 s and
advasp/40-anon-comm (16) in 1.77 s, against 0.3–0.4 s for decks of the same size without
rasters; the second cold run of advasp/70 is the same as the first (0.85 vs 0.91 s) – the
cache (`webpInlineCache`) is in memory only. Under `--watch` it works as designed: the
rebuild of 50-censorship is 137–165 ms.

**Suggested fix:** either run the encodes concurrently (`execFile` with a pool of
`os.availableParallelism()`, before rendering, keyed as today), or keep a content-hash
cache on disk (e.g. `os.tmpdir()/psi-webp/<sha256>-q92.webp`; output bytes unchanged,
so `test/reproducible.mjs` is unaffected). Either takes these decks to ~0.4 s.
Measured on the 17 rasters of keynote-2036 and advasp/50-censorship: `-m 6 -sharp_yuv`
2,201 ms and 1,608 KB out, `-m 4` 906 ms and 1,585 KB out (originals 4,879 KB) – the slow
setting buys no bytes; `-m 4 -sharp_yuv` is 1,673 ms and 1,633 KB, so most of the time is
`-sharp_yuv` (chroma fidelity on hard edges, worth keeping) and the method change alone
saves only ~24%. Concurrency or the disk cache is the real fix. Note the same flags
are shared with `--optimize-images` (`detectWebpEncoder`, `build.js:30223`). Effort **S–M**.

## 5. The editor's asset table carries every figure image a second time

**Impact: low (only decks with raster images inside `::: draw`). CONFIRMED.**

`renderDiagram` emits `psi-diagram-assets` (`diagram-core.mjs:9786–9790`) with the full
`<image href="data:…">` markup for each picture in a figure, beside the same data: URI in
the SVG itself. Known and intentional (`stripDiagramAssets`, `build.js:9349`, drops it from
print and `editor: none`), but it costs 207 KB in each live view of infeinfb/00-willkommen
(7 images). The editor could take the href from the rendered `<image>` element by id
(`editor.mjs:122–126` reads the table) instead of a copy. Effort **S–M**.

## 6. `psi-diagram-frames` stores every step frame in full

**Impact: low. CONFIRMED (size), fix PLAUSIBLE.**

Each step frame repeats every visibility and geometry key even when it did not change
(`"vis":{"t":1,"t-0-0":1,…}`). Encoding each frame as a diff against the previous one
(a throwaway node one-liner over the built views) shrinks the payload by ~65%: infeinfb 263 → 83 KB,
network-security 315 → 108 KB (10% of that file), diagrams 133 → 50 KB. Readers are the
step runtime (`build.js:4821–4899`) and the editor (`editor.mjs:1004`), so a decode at
load is a few lines. Effort **M**.

## 7. The browser suite is sleep-bound and serial

**Impact: medium for the maintainer's loop. CONFIRMED.**

`node test/run.mjs nav` (four specs): **46.1 s wall, 9.6 s user CPU** – the machine is
idle ~80% of the time. The suite has 518 `waitForTimeout` calls (61 of 400 ms, 44 of
500, 43 of 600, …), `press()` sleeps 240 ms after every key and `walkTo` 90 ms per step
(`test/harness.mjs`), and `run.mjs` runs all 54 specs one after another in one browser
although every spec opens its own context. **Full suite, run in a private copy: 1,987 passed,
0 failed, 843 s wall, 165 s user + 40 s sys CPU** – about 76% of the 14 minutes is waiting.

**Suggested fix:** (a) run specs in N parallel contexts (they already isolate state per
context; the shared HTTP server is read-only) – the cheapest 3–4x; (b) replace fixed
sleeps on the common paths with a wait for a runtime signal (e.g. a `transitionend` or a
`window.psiIdle` promise the runtime resolves after `focusCamera`), starting with
`press()` and `walkTo`. Effort **M**.

## Things checked and found fine

- Watch rebuild: 137–241 ms save → `build-success`, of which 80 ms is the debounce
  (`build.js:32523`); WebP, Shiki, KaTeX, QR and fonts are reused across rebuilds.
- Node compile cache (`NODE_COMPILE_CACHE`): 413 → 391 ms, not worth it.
- `:has()`: 16 rules; no `:has()`-attributable style cost showed in the profiles
  (deleting them changes layout, so an A/B is not meaningful; style recalc per press is
  0.15 ms when the zoom does not move).
- Frame pacing: no frame over 25 ms during pans or figure tweens at 1x; at 4x one
  27–66 ms frame in 200 presses.
- Idle: the projection does nothing at rest; the cockpit's clock is two 1 s intervals.
- Duplicate data: no image or SVG inlined twice in one file except finding 5.
