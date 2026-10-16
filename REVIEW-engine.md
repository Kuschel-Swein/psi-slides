# Cross-cutting engine review

Snapshot: commit 3bedb93 (“Live demo: D pauses and resumes instead of ending”),
reviewed in a separate worktree so no tracked view was rebuilt. Five reviewers
worked in parallel – security, performance, comfort and workflow, the four views
in the room, robustness and the pain points reported from
`psi-slides-mylectures` – and the findings marked *verified* below were
reproduced again afterwards, with a fixture deck or by reading the code.

The detailed reports, with file:line, scenario and fix for every item, are in
`review-engine/`: `security.md`, `performance.md`, `comfort.md`, `ux.md`,
`robust.md`. This file is the ranking across them.

Effort: **S** is an afternoon or less, **M** a day or two, **L** more.

## What is in good shape

These were looked for and not found wanting, so nobody needs to look again soon:

- **Build speed.** Cold builds of the largest real decks take 0.27–0.56 s; a
  save under `--watch` reaches `build-success` in 137–241 ms. Diagrams compile
  once, and fonts, Shiki, KaTeX, QR and WebP are memoised. Nothing is redone
  per view.
- **The build-time chokepoints.** `assetAllowed`, `safeMatter`, the output
  writers, `--serve`'s path and Host checks and the watch socket's Origin and
  nonce gate held under every bypass tried (encoded `..`, NUL, symlinks,
  dot-names, Host spoofing).
- **build.js ↔ lint.js.** Every hand-mirrored table is identical, and the 28
  refusals touched in the last ~60 commits agree in both tools.
- **Navigation.** Back retraces forward exactly, one beat per press, over 52–95
  beats on five decks. `B` and `.` blank through freeze.
- **The reported pain points.** Nearly every engine item in the six
  lessons-learned files of the content repo has been fixed since.
- **No dead code.** Every one of build.js's 570 top-level declarations is
  referenced.

## 1. Would bite in a lecture – fix first

| # | Finding | Effort | Source |
|---|---|---|---|
| 1.1 | **Commenting out a slide with `<!-- … -->` erases everything after it.** Headings and `---` ignore the comment state the shared fence tracker already has (`tails.mjs:481`). The chunk inside the comment is still parsed, and the `-->` comes out escaped as `--&gt;`, so in the browser the comment never closes. Every later chunk, all chrome and the runtime scripts disappear in all four views. Build exit 0, lint clean. *Verified.* | S | robust R1 |
| 1.2 | **A `> note:` inside `::: cards` / `::: rows` is shown on the projection** as a “note: …” blockquote, and printed, and is missing from the cockpit's notes. The card capture continues before the note parser sees the line (build.js ~6090–6125 vs 6274). Lint clean. *Verified.* | S | robust R2 |
| 1.3 | **One click into the cockpit's notes field disables the clicker.** The field's keydown handler knows only Escape (build.js:27406). PageDown, PageUp and the arrows do nothing; `B` and `.` are typed into the note, which is then stored as a lasting override in localStorage. *Verified in code.* | S | ux 1 |
| 1.4 | **Long notes are cut at three lines with no sign that more follows.** The field is `overflow: hidden` until focused, so the wheel cannot scroll it. Reading the rest means clicking in, which is 1.3. 21 of 51 chunks in a real course lecture are cut. | S | ux 2 |
| 1.5 | **After the projection reloads (F5 on a Windows clicker), clicker presses on it no longer reach the cockpit**, and the reveal state is lost. The room and the cockpit drift apart until the cockpit's next press pulls the room back. Fix: the cockpit re-sends `hello` until the projection answers; the key map intercepts F5. | S | ux 4 |
| 1.6 | **A cockpit with no projection still shows a green “● LIVE”.** Opened on its own, it offers no way to open the projection; `B` reports “projection blanked”. Reopening a closed projection via `S` creates a second cockpit whose clock starts at 0:00. Fix: a “no projection” state from `hasLivePeer()` and an “open projection” command. | S–M | ux 3 |
| 1.7 | **A chunk taller than the frame with only one beat cannot be read to its foot** under the default `auto-fit: false`. The camera walks down only from the second beat (`shown > 1`, build.js:21582). In a real course lecture 8 chunks are cut by 109–424 px at 1024×768. `--check-fit` calls them “read by scrolling”, which needs a mouse. Fix: let forward walk the camera down before it leaves the chunk. *Verified in code.* | M | ux 5 |
| 1.8 | **Desktop “Export as PDF…” lets a deck's script read local files.** The export window blocks http(s) and ws(s) but not `file:` (`desktop/main/pdf.js:182`), and Electron, unlike Chrome, lets a `file://` page `fetch()` other `file://` paths, dot-folders included. Whatever the script reads can be written into the PDF, which leaves the machine as a handout. Reproduced in a harness with the app's window options, not clicked through the packaged app. Fix: confine `file:` in the export session to what `assetEscape` allows, or serve the view from a custom scheme. | M | security 1 |

## 2. The authoring loop

| # | Finding | Effort | Source |
|---|---|---|---|
| 2.1 | **A save under `--watch` loses the beat, and can land on the wrong slide.** Only `activeIdx`, an index, is stored (build.js:20381); `revealed` is not. Insert one chunk above and save, and the page reloads onto a neighbouring slide at beat 0. Fix: the reload script stores `{chunkId, beat}` in sessionStorage. *Verified in code.* | S | comfort 1 |
| 2.2 | **A failed rebuild is invisible in the browser.** `build-failed` reaches only the diagram editor's hook (build.js:7306); the page sits on the old build. Fix: a banner in the cockpit, and in the projection only when no cockpit is attached. *Verified in code.* | S–M | comfort 2 |
| 2.3 | **Unknown flags are ignored.** `--wacth`, `--serv`, `--check-fitt` build normally and exit 0 (the comment at build.js:34166 says so). `-h` can never fire; `--help` goes to stderr and exits 1; a folder as input and `--port 99999` end in Node stack traces. Fix: one table of known flags with “did you mean”. *Verified.* | S | comfort 4, 8; robust R7 |
| 2.4 | **An unknown or argument-less opener prints itself on the slide** (`::: backdorp pic`, `::: expand` with no label), exit 0. With a closer, the error points at the closer. | S | robust R3 |
| 2.5 | **Lint passes what the build refuses**: a missing `::: backdrop`, `cover-image` or draw `image` file; an unclosed YAML quote; frontmatter with no closing `---`. A tab-indented `style:` block is silently dropped by both. A missing `![](fig-id)` shorthand ships a “missing: …” box with no log line in either. | S–M | robust R4, R5 |
| 2.6 | **Diagnostics name a chunk, never `source.md:N`.** With id-less chunks a refusal reads “(a chunk with no id)” and points nowhere. | S | robust R8 |
| 2.7 | **`--watch` rebuilds only on `source.md`.** Changing an asset, a picture in the folder above or a file in `fonts/` does nothing. Atomic saves, delete-and-restore and error-then-fix all recover correctly. | M | robust R10 |
| 2.8 | **The build never runs lint**, so HOUSE-STYLE says “run both” and `pack-talk.sh` lints on its own. Fix: one summary line after a build; under `--watch` only when the count changes. | S | comfort 6 |
| 2.9 | **`same as` / `same w as` boxes skip the label-overflow warning** (diagram-core.mjs:7039 checks only a written `w`) – the G4 trap reported from the content repo. A straight edge through an unrelated box is still not warned about either (P2.3). | S | robust R6 |
| 2.10 | **The review loop is three browser walks**: on a 42-chunk deck `--check-fit` takes 66 s, `--squint` 16.5 s, `--frames` 51.5 s. One `--review` (lint, build, one walk, three outputs) would also retire FRESH-EYES-REVIEW.md's own capture script. | M | comfort 5 |

## 3. Starting a talk

Today this needs `rehearse.sh` or the generated `Start.command`. What they paper
over, observed on a fresh `--watch --serve --prompter --prompter-dry-run`:

- On a fresh folder no cockpit URL is printed: `runServe` lists only files that
  exist and starts before the first build.
- The port is random, so every restart is a new origin, and position, theme and
  unexported live annotations are gone.
- A busy `--port` prints a raw `EADDRINUSE` stack trace.
- A tab left open across a restart retries a dead socket every 500 ms forever.
- No browser opens, and nothing says that the prompter needs Chrome or that
  `Shift`-`S` switches it on.
- Without a key the prompter says “disabled” and names no fix.
- Ctrl-C exits cleanly, but nothing says where the log is.

**Proposal (M, can land in pieces):** a stable port derived from the lecture
path; URLs printed after the first build; a plain sentence for a busy port; a
server that tells stale-nonce tabs to reload; `--open` (Chrome under
`--prompter`); an automatic dry run with one line saying why when there is no
key; the log path on exit. Together that is a `--present` mode, and it replaces
`rehearse.sh` and about half of `Start.command`.

**The debrief (M):** `debrief.sh` (~250 lines) already had to follow one log
format change, and its `@mm:ss` regex disagrees with `parseTimeMark`
(cue-cards.mjs:67): `@1:02:30` reads as 62 s. Two runs in the same minute
share one JSONL, and a dry-run session record carries no `dryRun` field, which
is why the content repo needs an `old/` sorting rule. Proposal:
`--prompter-debrief [LOG]` beside `--prompter-replay`, seconds and a `-dry`
suffix in log names.

**The key (S):** read `OPENROUTER_API_KEY` from one user-owned file if the
environment has none. Never load a `.env` from the lecture folder: a deck
someone sent could set `OPENROUTER_BASE_URL` and receive the deck and the
room's transcript.

**Stays in the content repo:** `pack-talk.sh` and `Start.command` (engine,
Node and key in one 110 MB archive) are policy, not engine. The engine-shaped
answer would be the desktop app gaining the prompter (L) – worth it only if
talks on borrowed Macs become routine. In `build.sh`, the Mermaid step
re-renders 15 committed SVGs on every build and can go; the four copies of
the lecture-name resolver can become one shared file until `--present` and
the debrief retire two of the scripts.

## 4. Security hardening (all small)

| # | Finding | Effort |
|---|---|---|
| 4.1 | The CLI PDF exports and `--frames` *display* local files the build refuses to read: an `<iframe src="../../secret.txt">` or a directory listing (with the username) lands in the PDF text layer and the PNG. `pdf-export.mjs:74/84` route only http(s)/ws(s); `openAudienceProbe` (build.js:32852) routes nothing. `page.route` sees `file:` too – abort outside the asset root. SECURITY.md:62 should say a page opened from disk can show local files on a projector. | S–M |
| 4.2 | `lint.js` prints the source's control characters raw (`lint.js:5297/5304`), while SECURITY.md recommends lint as the safe first look. A class token can clear the screen and fake a clean result. Copy `consoleSafe`. | S |
| 4.3 | `ws` 8.20.0 has two advisories (memory exhaustion, memory disclosure); the watch socket parses frames from origin `null` before the nonce check. The fix is inside `^8.20.0` – a lockfile bump. js-yaml 3.14.2 (via gray-matter) has quadratic-CPU advisories. | S |
| 4.4 | A `source.md` directly in the home folder gets `/Users` as asset root: `assetRootNarrowed` checks the folder above, never the lecture folder itself (build.js:270, lint.js:511). *Verified in code.* | S |
| 4.5 | `--serve` sends no `frame-ancestors`, `nosniff` or `CORP` header (build.js:32774); any website can frame the cockpit. | S |

## 5. Performance

The build is fast; what is slow is in the browser and in the test suite.

| # | Finding | Effort |
|---|---|---|
| 5.1 | **A slide change that moves the auto-fit zoom restyles the whole document.** `--zoom` is written on `<html>` (build.js:23151/23160), and the next layout read forces style and layout for every chunk: 22 ms vs 2.7 ms on diagrams, 37.5 ms in a course cockpit, 165 ms median at 4× CPU throttling. `.chunk:not(.active){content-visibility:auto}` brought it to ~12 ms, but has to be checked against the camera, the overview, `--check-fit` and the PDF export. | M |
| 5.2 | **The cockpit forces three full layouts per slide change** on 13k elements (`autoSizeNotes` write–read–write, `scrollPreviewToActive`, `focusCamera`). `field-sizing: content` for the textarea, or one rAF. | S |
| 5.3 | **A live view weighs ~2 MB before the first slide.** Stripping comments from the modules spliced in as text and from the CSS saves ~740 KB per live view (16–29 % of the file); the diagram compiler plus editor alone is 966 KB, 497 KB of it comments. Load time barely changes – bytes, not speed. | M |
| 5.4 | **Every cold build transcodes rasters one after another** (`execFileSync cwebp -m 6 -sharp_yuv`, cache in memory only): 1.8–1.9 s for raster-heavy decks against ~0.35 s otherwise. `-m 6` gains 1.4 % over `-m 4`. Concurrent encodes or an on-disk content-hash cache; output bytes unchanged. | S–M |
| 5.5 | **The browser suite is three quarters waiting**: 843 s wall clock on 205 s CPU, 518 `waitForTimeout` calls, 240 ms sleep per `press()`, 54 specs in series. Parallel contexts and waiting on a runtime signal. | M |
| 5.6 | Smaller: the editor's asset table carries figure images a second time (207 KB on one deck); `psi-diagram-frames` stores full frames where diffs would be ~65 % smaller. | S–M |

## 6. Polish

- Print-to-PDF splits headings from their content: 4 of 20 pages end in a heading, one with the type label alone. `break-after: avoid` on label and sub-heading. (S)
- On a 390 px phone, print.html's “Highlight” button and “Contents” pill cover text; slide numbers are off-screen. (S)
- A frozen cockpit does not show which slide the room is on. (S)
- A clicker's Escape drops the projection out of fullscreen; `navigator.keyboard.lock(['Escape'])` lets the page take one press. (S)
- The slide pan ignores `prefers-reduced-motion` (a 1516 px glide in 250 ms). (S)
- Cockpit labels are 9–11 px at 2.75–3.4:1 contrast; the start menu is at 2:1. (S)
- → and ← are missing from the forward and back rows of the `?` panel. (S)
- Alt text and caption are one field, and the linter's advice leads to `alt=""` on screenshots. (M, a design question)

## 7. Preventing the next 1.1 and 1.2

Both are one capture mode of the parser forgetting a line type. A generated
matrix gate – every container (`cards`, `rows`, `side`, `overlay`, `expand`,
`cols`, divider body) × every line type (`> note:`, `---`, `#`/`##`, `<!--`,
an unknown `:::`) – building with build.js and linting with lint.js and
asserting they agree would catch the next one in seconds. `refusals.mjs` does
this for figures only. (M)

## Suggested order

1. **One sitting, all S:** 1.1, 1.2, 1.3, 1.4, 2.1, 2.3, 4.2, 4.3, 4.5.
2. **The room:** 1.5, 1.6, 1.7, 2.2.
3. **`--present`** in pieces (section 3), then the debrief.
4. **The exports:** 1.8 and 4.1 together – one rule, “an export reads what the build may read”.
5. **The author's loop:** 2.4–2.9, then the matrix gate (7).
6. **Performance** 5.2, 5.4, then 5.1 and 5.3; the test suite (5.5) whenever its twelve minutes start to cost.
