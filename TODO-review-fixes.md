# TODO – review fixes

Working list for the fixes chosen from `REVIEW-engine.md` (the ranking) and
`review-engine/*.md` (file:line, scenario and fix per finding). Numbers in
brackets are the review's.

Work happens on the branch `review-fixes` in the worktree
`../psi-slides-review-fixes`, one slice at a time, because every slice touches
`build.js`. Each slice: fix, `lint.js` mirror where the change is a rule, a gate
or a spec that fails before and passes after, `npm run gate`, the specs the
slice touches, docs that describe the behaviour (CLAUDE.md, SECURITY.md,
speaker.md, the skills, CHANGELOG.md), one commit. Tracked views are rebuilt
once at the end, after the rebase onto `main`.

Status: `[ ]` open · `[~]` in progress · `[x]` done · `[-]` dropped (with reason)

## Slice A – parser: constructs that lose or leak content

- [x] **A1** [1.1] `<!-- … -->` around a chunk: headings and `---` inside an HTML comment are not structure; the comment survives intact. Build and lint.
- [x] **A2** [1.2] `> note:` inside `::: cards` / `::: rows` becomes a speaker note of the chunk, never a blockquote on the slide. Build and lint.
- [x] **A3** [7] Matrix gate: every container × every line type (`> note:`, `---`, `#`/`##`, `<!--`, unknown `:::`), build against lint. Catches the next A1/A2.

## Slice B – the cockpit's notes field

- [x] **B1** [1.3] A click into the notes field must not take the clicker: navigation keys (PageDown/PageUp/arrows/space) leave the field and act; `B` and `.` do not type into it unless the author is really editing. No silent localStorage override from a stray key.
- [x] **B2** [1.4] Long notes: visible sign that more follows, and scrollable without focusing.
- [x] **B3** [5.2] `autoSizeNotes` without the write–read–write layout (one of three forced layouts per slide change in the cockpit).

## Slice C – a cockpit with no projection

- [x] **C1** [1.6] “● LIVE” only when a projection answers (`hasLivePeer()`); otherwise a “no projection” state.
- [x] **C2** [1.6] A command to open the projection from the cockpit; reopening a closed projection re-attaches to *this* cockpit rather than opening a second one.
- [x] **C3** [1.6] `B` with no projection says so instead of “projection blanked”.

## Slice D – the authoring loop under `--watch`

- [x] **D1** [2.1] A rebuild reload keeps chunk id and beat, not an index.
- [x] **D2** [2.2] A failed rebuild shows in the page: a banner in the cockpit, in the projection only when no cockpit is attached; it clears on the next good build.

## Slice E – the command line

- [ ] **E1** [2.3] Unknown flags refused with “did you mean”; one table of known flags.
- [ ] **E2** [2.3] `-h` works; `--help` to stdout with exit 0; a folder as input resolves to its `source.md` or says so; `--port` out of range and a busy port as one plain sentence.

## Slice F – `--present`: starting a talk without a wrapper script

- [ ] **F1** Cockpit and projection URLs printed after the first build, not before.
- [ ] **F2** A stable port per lecture (derived from its path) when `--port` is not given, so a restart keeps the origin and with it position, theme and annotations.
- [ ] **F3** A tab left open across a restart reloads itself instead of retrying a dead socket forever.
- [ ] **F4** `--open`: open the cockpit once the server answers (Chrome under `--prompter`).
- [ ] **F5** No key → the prompter runs dry automatically and says so in one line, naming the fix.
- [ ] **F6** The key from one user-owned file when the environment has none; never a `.env` from the lecture folder.
- [ ] **F7** On Ctrl-C: where the prompter log is.
- [ ] **F8** `--present` as the one flag that means `--watch --serve --open` (plus `--prompter` when configured), with a line on `Shift`-`S` and Chrome.

## Slice G – the debrief in the engine

- [ ] **G1** `--prompter-debrief [LOG]` (and `--transcript`): clock, time table against `@mm:ss` marks via `parseTimeMark`, what was said and held back, then the replay.
- [ ] **G2** Log names carry seconds and a `-dry` suffix; the session record carries `dryRun`.

## Slice H – security

- [ ] **H1** [1.8] Desktop PDF export: `file:` confined to what the build may read.
- [ ] **H2** [4.1] CLI PDF exports and `openAudienceProbe` (`--frames`, `--check-fit`, `--squint`): abort `file:` requests outside the asset root. SECURITY.md says a page opened from disk can show local files.
- [ ] **H3** [4.2] `lint.js` output through a `consoleSafe` copy.
- [ ] **H4** [4.3] `ws` lockfile bump within `^8.20.0`; js-yaml if gray-matter allows.
- [ ] **H5** [4.4] A lecture folder that *is* the home folder or a disk top: assets only from `assets/`, with a warning. Build and lint.
- [ ] **H6** [4.5] `--serve` headers: `frame-ancestors 'self'`, `nosniff`, `Cross-Origin-Resource-Policy: same-origin`.

## Slice I – performance

- [ ] **I1** [5.1] A zoom change on a slide change must not restyle every chunk.
- [ ] **I2** [5.3] Comments stripped from the modules and CSS spliced into the live views.
- [ ] **I3** [5.4] Raster transcodes concurrent and/or cached on disk by content hash; output bytes unchanged.
- [ ] **I4** [5.6] The editor's asset table without the second copy of figure images; step frames as diffs.
- [x] **I5** [5.5] Browser suite: parallel specs, runtime signals instead of fixed sleeps.

## Not in this round

From the review, left for later: 1.5 (projection reload desync), 1.7 (single-beat tall chunk), 2.4–2.10 (author-loop diagnostics, asset watching, lint after build, `--review`), section 6 (polish).

## Log

- **A1** The shared `fenceTracker` now marks every line of a multi-line comment (`commented`, opener and closer included) and no longer ends a comment at a heading; `parseLecture` drops those lines before any classification (one blank line stays, plus text after `-->`), lint.js skips them in the same place, and an unclosed comment is refused in both (`unclosed-comment`). Chose “absent” over “passed through intact”: passed through, a comment with a blank line in it was still cut in two by the card-row renderer (the `-->` escaped again), and a commented-out draft shipped in the page source. No deck in this repo or the content repo has a multi-line comment after its first heading, so no output moves (tracked views rebuilt byte-identical, content-repo lint unchanged). Lint no longer counts a comment's words toward the density budget. Not done: the image-ref collectors still see a `![](…)` inside a comment.
- **A2** The card-row capture lets `> note:` / `> annot:` and their continuation lines fall through to the note reader; the note is filed where a note in an overlay is (the segment the row stands in), on a chunk and on a divider. Lint already read it as a note; what the matrix found instead was that lint closed the chunk on a `#`/`##` inside a card row the build captures as card text – lint now treats a card row as captured for headings, like the build. (A heading in a captured block renders as `<h2>statement: Inner {#inner}</h2>`, tail text included, in cards as in overlays and expansions – pre-existing, left as is.)
- **A3** `test/containers.mjs`, not a gate (it runs build.js), in `npm test` after settings.mjs: 16 containers × 11 line types, 176 decks, ~5 s, 3,320 assertions. Before the fixes it failed 145 assertions in 22 cells. It also found a third disagreement: lint's `::: pulse` capture counted a `---` / `:::` / note inside a comment; fixed. Unknown `::: foo` is refused by both everywhere in its block form; the one-line form (R3) is not in this slice.
- **B1** The notes field is `readonly` until an edit is asked for: `Shift`-`N`, the `+ note` button, or a double-click (the second mousedown is let through, so the browser places the caret and picks the word); a single click is `preventDefault`ed and does not focus. The key map's text-field guard became `typingIn()`, which lets `#psiINT-notes-content[readonly]` through, so a field focused by Tab still hands on every key. During an edit, `PageDown`/`PageUp` blur (ending the edit) and fall through to the key map; `Esc` ends the edit and is stopped there; arrows, Space, `B`, `.` stay text – an edit is now always deliberate. A blur ends the edit. New doc row `notes-edit` in `commands.mjs`. Cue cards untouched (the field is hidden there; `Shift`-`N` leaves the mode as before); the prompter does not use the field. `test/cockpit-notes.mjs` (two windows on a fixture, 23 assertions) fails 11 of them on 3bedb93.
- **B2** The field scrolls with the wheel unfocused (`overflow-y: auto` in both states) and its last line fades while more is below: a scroll-driven animation (`animation-timeline: scroll(self)`, fill backwards, range ending 2px short of the end), so no script and no layout; browsers without scroll timelines get `.notes-more` from a rAF measurement. Conservative choice: the automatic height stays one to three lines – a taller cap would resize the mirror above on every slide change, and the bar above the notes already sets a fixed height. No “+N lines” count (the fade says it without chrome).
- **B3** `field-sizing: content` (with `1lh`/`3lh` limits) sizes the field where supported; elsewhere `autoSizeNotes` measures once per frame. Measured with a trace (Layout events nested in the keydown's EventDispatch), python-intro with a note on every chunk, 38 PageDowns, 1440×900, headless Chromium: forced layouts per press 2.03 → 1.34; layout time inside the press 1.65 → 1.55 ms, keydown 3.95 → 3.85 ms – the remaining forced layout (`focusCamera` → `resetViewportScroll`) now pays what the others did. Getting there also needed `markPreviewCurrent`'s smooth strip scroll moved into a rAF and the note's scroll reset done a frame later: with only the notes fixed, the strip's rect read took over the same layout and the count did not move (2.11).
  One visible side effect, deliberate: the old script set the content height to the field's `scrollHeight`, which includes the padding, so a one- or two-line note stood about 28 px taller than its text (a two-line note 129 px against 101 px now, at 1440×900); three-line notes are unchanged. The stage above gains that room. `test/annotation.mjs` compared the annotation layer with the scaled stage after rounding, and a 0.1 px offset that always existed rounded the other way at the new scale; it now allows a pixel.
- **I5** (pulled forward, own worktree, then cherry-picked): `test/run.mjs --jobs N`, each spec in a child process with its own Chromium, eight specs `serial`; `settle()` in harness.mjs replaces the fixed sleeps in `press`, `walkTo`, `openDeck` and the editor helpers. Full browser suite 843 s → 238 s, three parallel runs green. live-sync’s clock race fixed by re-reading both windows. Next-longest stage is now `test/settings.mjs` (136 s, no browser). A `window.psiIdle()` runtime signal would make `settle` exact – described in test/README.md, not built.
- **C1** `hasLivePeer()` is presence now, not a handle: each view sends `bye` on `pagehide` (added on `load`, so it is the last message – the demo's `stop` would otherwise revive it), the other keeps the handle (a reload keeps the window) and asks with `ping` each second (first after 400 ms, at most 120) until a `hello`/`pong` answers; a 1 s tick also notices `.closed` and calls `viewHooks.onPeerChange`. The footer light reads `○ no projection` (grey, `· frozen` under a freeze; click opens the projection) whenever no projection answers. Side effect, deliberate: a projection reloaded under a live cockpit is pushed the cockpit's slide within ~1 s instead of at the next press (partly 1.5; frozen is untouched).
- **C2** `S` in the cockpit (`projection`, group *the projector*, a free key there; `Shift`-`S` stays the prompter's and never falls back) opens `audience.html` via `openViewWindow` – the old `openCockpit` generalised, window name `psi-slides-audience`, `whois`/`iam` now answered by both views and checked for the view. The new projection posts `here` to its opener and is adopted only when the cockpit answers (state push, or `ping` when frozen) – an opener is never taken on its own word. Closed and reopened: same cockpit, clock and freeze kept (spec). A projection opened by hand cannot reach the cockpit (separate browsing-context group), so the cockpit writes a localStorage heartbeat (5 s; fresh = 15 s; removed on `pagehide`) and the projection's `S` names the running cockpit instead of opening a second; a second `S` within 10 s opens one anyway; a tab that had a cockpit before (`sessionStorage` marker, survives reload) skips the check. Firefox per-file storage: old behaviour. `siblingViewsAbsent` now covers every command's `opens`, so a `--speaker-only` build without audience.html says so.
- **C3** Without a projection the cockpit's `B` blanks nothing (“no projection window – nothing to blank · S opens it”; a blank left from before can still be lifted), `W` and `D` name `S`, a shown address says it is shown here only, `V` toasts without “the room”. `M` was left: it is stored and applies when the projection opens, so its toast is not false. `test/cockpit-alone.mjs` (file://, 29 assertions) fails on 3bedb93 at the first assertion; help-search, palette (B as a probe in a lone cockpit) and souffleuse (a second cockpit from a hand-opened projection now takes two `S`) were adapted.
- **D1** Both: a one-shot `sessionStorage` stash for the watch reload (`psiWatchResumeSave`, called by the reload script just before `location.reload()`: chunk id, old index, every chunk's beat, the cockpit's freeze; taken once at boot on a `reload` navigation under a minute old, ahead of the address's fragment; id else old index clamped, beats clamped to `countSegments`), and the id persisted generally – `saveActive` writes `activeId` beside `activeIdx`, `loadPersisted` prefers it, and the snapshot carries `activeId` (`remoteActiveIdx`), because on a save one window is briefly the old build and a push from it named the slide by a stale index. The freeze is restored on a watch reload only (it was not persisted before, and still is not across a crash): a frozen cockpit that came back live pushed its look-ahead to the room. Beats are not persisted for a crash/reopen (unchanged). `test/watch-resume.mjs` (serial, own engine, 36 assertions) fails 19 on HEAD.
- **D2** A second per-run secret, the listen key, in live views without a writer (`hello {listen}`): such a socket is a *hearer* and gets `{type:'build-failed', why}`; every other socket – the documents, which still send nothing – gets the bare string and says the terminal has the reason. Also sent on connect while the last build is broken. Banner `#psiINT-build-failed` lives in the reload script (CSS + JS, so production builds carry none of it), text via `textContent`, first line capped at 240 characters; cockpit and documents always, projection while `psiBuildBannerHere()` (no live peer, re-asked in `notePeer`); behind the editor when its status line said it (`psiWatchBuildFailed` now returns true then). Every good build sends `reload`, so it clears with the reload; a click hides it until the next failure (conservative: no auto-hide). `live-trust` and `souffleuse` now check for `window.psiWatch =` and `.send(` rather than the substring `psiWatch`, which the hooks' names contain.
