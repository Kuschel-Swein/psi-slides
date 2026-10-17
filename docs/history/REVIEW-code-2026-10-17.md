# psi-slides – Technical Code Review

**Date:** 2026-10-17
**Reviewer:** external (read-only pass)
**Commit reviewed:** `d97282e` on `main` (2 commits ahead of `origin/main`, working tree clean)
**Scope:** full repository, read-only. Build and tests were run locally to verify claims; no files were committed, pushed, or changed (the one build I ran reproduced the committed bytes exactly – see §4).
**Status:** action items 1, 2, 3 and 5 are done (commits `95ab775` to `853257f`, merged to `main` and pushed). Item 4 is deliberately deferred. See §0; the sections below carry *Update* notes where a finding has changed.

A note on tone, since you asked for it: this is not a troubled codebase. It is an unusually mature one for a single-author project, and most of the findings below are about *scaling the maintenance* of something that already works, not about fixing something broken. Where I say something is good, I mean it; where I say it is a problem, I mean that too. I did not manufacture weaknesses to balance the ledger.

---

## 0. Follow-up status

| # | Action item | Status | Where |
|---|---|---|---|
| 1 | Internal docs out of the release; one source of truth | **Done** | `95ab775` |
| 2 | Coverage number | **Done** (measured, no threshold) | `535af43`, `9ccde20`, and the commit adding `tools/coverage-logic.mjs` |
| 3 | Stale `.git/index.lock` | **Done** (0 bytes, no git process running; deleted) | – |
| 4 | Extract runtime CSS/JS out of `build.js` | **Deferred on purpose** – to be done string by string, gate-protected | – |
| 5 | Large-deck stress test | **Done** | `60573cc` |

**What the follow-up established, in one paragraph.** The release tarball no longer carries `CLAUDE.md`, `HANDOFF.md`, `PRD.md`, `CHANGELOG.md`, `PLAN-*.md` or `TODO-*.md` (about 1 MB); the README links them on GitHub and names the authority (format: the `psi-slides-authoring` skill and the three tracked lectures; internals: `CLAUDE.md`; where `PRD.md` or `HANDOFF.md` disagree with the code, the code wins), and both files are marked historical. Coverage is now a number: **91.9 % lines, 85.7 % branches, 90.6 % functions** over the browser-free suites – with the caveat that `build.js`'s line figure is inflated by its template literals, and the Node-side logic outside them is **81.4 %** (`tools/coverage-logic.mjs`). A generated 2,400-chunk deck builds in about a second, loses no chunk or figure, lints clean, and scales linearly (x3.5–x3.7 for x4 the chunks, about 0.33 ms per chunk). `build.js` is unchanged; the tracked views rebuild byte-identically; gates (2,140), lint and every browser-free suite are green. The PDF export test passed (162); the browser suite passed except the `demo` spec's five WebRTC-loopback checks in one full run under load, which passed 36/36 in each of three runs alone – a timing-sensitive spec, not a regression.

**Found along the way, not fixed:**

- One gate (*legacy draw syntax stays out of authored sources*) already failed in an unpacked tarball before this work, because it calls `git rev-parse`. The `cli` gate, which reads `CLAUDE.md`, would have become a second. Both now skip without `.git` (`56d760a`, `95ab775`), and the gates pass in an unpacked archive: 2,133 passed, 0 failed.
- `npm audit` reported 5 advisories (1 low, 4 moderate). KaTeX is now 0.18.10, past GHSA-238p-pmpm-9mq7 (`853257f`); only the inlined stylesheet moved, and the tutorial's views were rebuilt. Still open: gray-matter's `js-yaml`/`argparse`/`sprintf-js` chain (4 moderate), whose offered fix is a breaking downgrade to gray-matter 2.
- Running c8 left 1,564 raw V8 files (1.0 GB) behind; `test:coverage` now deletes them after the report.

---

## 1. What it is & the stack

psi-slides compiles one Markdown `source.md` into four self-contained HTML files – `audience.html` (projection), `speaker.html` (presenter cockpit), `print.html` and `print-notes.html` (reading documents) – each carrying its own CSS, JS, fonts, typeset math (KaTeX), syntax highlighting (Shiki), images (inlined as WebP/data-URIs) and QR codes, so a deck opens complete with the network unplugged (verified: a built `audience.html` has zero external `http(s)` `src`). The core pipeline lives in **`build.js` (37,013 lines, single file)**: `gray-matter` frontmatter parsing → `marked` v12 body rendering with custom renderer overrides (`build.js:3312`+, math as marked extensions at `:3532`+) → four view renderers → inlining of fonts/images/math → single-file emit. The diagram language (`::: draw`) is factored into **`diagram-core.mjs` (9,875 lines)** because it is the one component that must run in *two* places – at build time and again in the browser. A separate **`lint.js` (5,477 lines, deliberately zero-dependency)** re-implements enough of the parser to serve as a pre-commit gate. There is also a browser-based WYSIWYG figure editor (**`editor.mjs`, 8,706 lines**), a presenter/prompter subsystem (`souffleuse.mjs`, `cue-cards.mjs`, `speaker.*`), a live-reload/sync server over `ws`, PDF export via `playwright-core`, and a full **Electron desktop builder** under `desktop/`. Node ≥ 22, ESM throughout. Testing is substantial: **67 browser/integration specs** in `test/` driven by a Playwright harness, plus **28 "gate" files** in `test/gates/` (zero-browser assertion suites – I measured **2,140 passing assertions in 1.9 s**). CI runs five workflows (`gates`, `pages`, `release`, `browser`, `desktop`). Published not via npm (`"private": true`) but as a GitHub Release tarball (`git archive` of tracked files + pre-built example lectures) and a GitHub Pages site; the desktop app ships as platform installers on the same tag.

---

## 2. Intent vs. reality

**Docs for adoption: strong.** The `README.md` is genuinely good – it states the problem (slide/script drift), the mechanism, and a *"When not to use this"* section, which is rarer than it should be. The quickstart is honest and the two install paths (tarball, clone) both work. `CONTRIBUTING.md` and `SECURITY.md` are both well above the norm for a solo project. I was able to go from a clean checkout to green `lint`, green gates, and a reproducible build using only the documented commands. **A competent outsider can install and use this from the docs alone.** That is the bar, and it clears it.

**Where docs diverge from reality:** the divergence is not in the *user-facing* docs but in the *internal* planning docs, which are stale and shipped anyway (see §5). The clearest instance: `PRD.md` still opens `# Lecture Medium – Specification v0.1` while the product is at `2.0.0`. `HANDOFF.md` is a German development diary ("Stand nach dem Content-Fidelity-Slice …") – an AI-assisted-development artifact, not a spec. Neither is wrong about the code so much as frozen at an earlier moment, and neither is marked as historical.

**TODO/FIXME/HACK markers (file:line, one line each).** Notably, there are almost none, and every hit is template scaffolding, not debt:

- `build.js:34271` – comment describing the `--new` scaffold's placeholder convention
- `build.js:34276–34295` – literal `TODO – …` placeholders inside the generated starter `source.md` (title, presenter, info lines, course slug, two sample chunks)
- `editor.mjs:8472, :8474` – `## figure: TODO – heading …` placeholder the editor inserts for a new figure block

There are **no `FIXME`, `HACK`, or `XXX` markers in the top-level source at all.** The absence of debt markers in a 60k-line hand-maintained codebase is either discipline or markers-get-resolved-fast; given everything else, I read it as the former.

---

## 3. Code quality & architecture

**The organising fact: `build.js` is 37,013 lines in one file**, and this is a deliberate, documented choice ("`build.js` is deliberately one file – the whole rendering stack", `diagram-core.mjs:4`). Internally it is *not* a swamp: ~953 top-level functions/consts, cleanly sectioned with labelled banner comments (`build.js:98, 158, 386, 1150, 5095, 14691, 21036, 27081, …`), average function ~40 lines, small and well-named. The comments are the best thing in the codebase – they explain *why*, with history ("this was an intention for a while before it was true, and the cost was two lint.js gaps …", `.github/workflows/gates.yml`). This is the opposite of undocumented code.

**But a large fraction of `build.js` is not logic – it is client-side CSS and JS stored as template-literal strings.** `AUDIENCE_CSS` spans roughly `:15560–21036`, `AUDIENCE_JS` roughly `:21036–27081`; `DIAGRAM_CSS`/`DIAGRAM_JS` (`:4302`, `:4667`), `PRINT_CSS` (`:10202`), `SPEAKER_*`, `READER_*`, and more. That is **several thousand lines of browser JavaScript and CSS living inside backtick strings in a `.js` file.** The consequences are concrete and they are the single biggest tax on this codebase:

- No editor syntax highlighting, no ESLint, no type-checking, no formatter, and no source maps for any of that runtime code.
- A typo in embedded JS is caught only at runtime in a browser test, not by tooling at edit time.
- Navigating or refactoring it means scrolling a 37k-line file.

To the team's credit this is *partially* mitigated: gates assert that each string compiles ("the stripped text compiles") and that every `*_JS`/`*_CSS` reaches a view only through the `shipJs`/`shipCss` chokepoints (the "reaches a view only through shipJs / shipCss" assertions I watched pass), and the Playwright suite exercises the behaviour. So it is *tested*. It is just not *maintainable at the speed the rest of the project is*, and it is the part an outside contributor would be most afraid to touch.

**Two independent parsers.** `lint.js` deliberately re-implements frontmatter/attribute parsing (`splitFrontmatter` at `lint.js:754`, `parseAttributeTail` at `:872`) so it can run zero-dependency as a pre-commit hook without the marked/Shiki/KaTeX stack. The risk – two parsers drifting – is real and is explicitly guarded by a gate ("build-versus-linter agreement over the refusal fixtures", `test/gates/refusals.mjs`, 43 KB). This is a reasonable engineering trade, honestly made, but it is an ongoing duplication cost that grows with the grammar.

**Dual-runtime `diagram-core.mjs`** (build + browser) is the right factoring and is called out as the documented exception to the single-file rule. Good.

**Error handling is clean.** User errors carry a `userFacing` flag and print an instruction, not a stack trace; internal errors print the stack (`build.js:36997–37012`). `safeMatter` (`:218`) turns a `YAMLException` into a line-numbered, actionable message. This is better than most tools do.

**Test coverage: thorough but unmeasured.** 67 integration specs + 28 gate suites is a lot of real coverage, and `test/gates/semantics.mjs` alone is 131 KB of assertions. But there is **no line-coverage instrumentation** (no `c8`/`nyc`/`istanbul` anywhere). So "thorough" is a qualitative judgement, not a number – unexercised branches in a 37k-line file are invisible. For a compiler, a coverage number would be cheap insurance.

> **Update:** measured. `npm run test:coverage` (c8, `--all`, browser-free suites, no threshold) reports 91.9 % lines, 85.7 % branches, 90.6 % functions. Per file: `build.js` 91.9 / 83.5 / 84.6, `lint.js` 92.6 / 86.3 / 97.8, `diagram-core.mjs` 94.2 / 86.4 / 97.4, the small modules 99–100 % lines; `pdf-core.mjs` 63.5 % and `chrome-path.mjs` / `pdf-export.mjs` 0 %, because only the PDF and browser suites reach them. **Caveat specific to this repo:** V8 counts a template literal as one expression, so the ~20,900 lines of inlined CSS/JS (24 literal constants) read 100 % as soon as `build.js` loads. Outside those literals, `build.js`'s Node-side logic is at **81.4 %** – the honest figure, and the one to watch. `tools/coverage-logic.mjs` computes it (the literals' extents found by V8's parser) and `test:coverage` prints it; `test/README.md` documents this. *(A first hand count with a line pattern gave 77.8 %; the pattern ran past literals that close mid-line and is superseded.)*

**Dependency / supply-chain footprint: lean and pinned.** Real runtime deps are `marked`, `shiki`, `katex`, `gray-matter`, `qrcode-generator`, `ws`; `playwright-core` is correctly an `optionalDependency` (test/PDF only). The rest of `node_modules` is ~40 `@fontsource` packages (font *data*, low risk) plus Shiki's transitive tree (micromark/oniguruma/hast). A `package-lock.json` is committed. This is a small, well-known supply chain – a strength.

---

## 4. Robustness & correctness

**This is where the project is strongest, and it is strong because the author is an infosec person and it shows.** The threat model "someone sent me a `source.md` / a lecture folder" is explicitly handled and tested, not assumed away (`build.js:158`+):

- **Frontmatter RCE is closed, twice.** `gray-matter` will hand `---js` to `eval` and `---coffee` to CoffeeScript. `safeMatter`/`frontmatterLanguage` (`build.js:194–230`) refuse any non-YAML frontmatter language *and* pass gray-matter throwing engines for `javascript`/`coffee`, so the block is refused even if the two code paths ever disagree on how they read the opening line. Defense in depth, deliberately.
- **Asset confinement with symlink resolution** (`assetAllowed`/`assertAssetsConfined`, `:255`+): an asset is read only from the lecture folder or one level up, *after* resolving symlinks, so `../../../` traversal and a planted link in `assets/` pointing at a key file are both refused.
- **Outputs never follow a link:** whole files are written to a fresh temp name and renamed over the target (replacing a symlink rather than writing through it), the one appended file (prompter log) uses `O_NOFOLLOW`, and writing into a symlinked directory is refused. This defeats the `print.html -> ~/.zshrc` attack, which they describe having actually hit.

**XSS / injection in the HTML output: a documented design decision, not a bug.** `marked` v12 does not sanitize, and psi-slides intentionally passes author HTML (and SVG scripts) straight through – `SECURITY.md` opens by stating plainly that "a psi-slides lecture someone sends you is a web page written by that person." That is the correct model for this tool (the same one reveal.js/remark use) and it is disclosed honestly. **I note it only so you know I checked:** it is not a finding against you. The one thing worth a second look is the live web editor and any hosted/multi-author context (`editor.mjs` renders Markdown→HTML live) – today it renders the author's own content locally, so the trust boundary holds, but if the editor ever renders *another* person's source in a shared context, this decision becomes an XSS exposure and would need revisiting.

**Reproducibility: verified.** Running `node build.js lectures/tutorial/source.md --no-optimize-images` reproduced the committed tracked HTML **byte-for-byte** (`git diff` empty afterwards). That is a real, tested guarantee, backed by `test/reproducible.mjs` and WebP caching keyed on content hash.

**Malformed input / edge cases** are covered by dedicated gates: `test/gates/untrusted.mjs` (31 KB), `refusals.mjs` (43 KB), `accepts.mjs`, `overlap.mjs`. Large-deck behaviour has auto-fit/camera logic and tests (`auto-fit.mjs`, `camera-fit.mjs`), though I did not find an explicit stress test for a pathologically large deck – a minor gap.

> **Update:** closed for the build and the linter. `test/large-deck.mjs` (part of `npm test`, a few seconds, no browser) builds 2,400 chunks in twelve parts with stepped figures, a figure in a `::: side` pane, code, math, cards, columns, expansions, footnotes and notes; asserts four views, every chunk id and every figure in the output, and a clean lint; and requires the cost above an eight-chunk deck to grow less than x10 for x4 the chunks (linear is about x4, quadratic x16). Measured x3.5–x3.7. **Still open:** the browser side of a large deck – camera, auto-fit, the cockpit's strip – is not stress-tested.

---

## 5. Bus-factor & project health

**The conventional bus-factor question – "is it all in his head?" – mostly answers *no*, and in an unusual way: it is almost *over*-externalised.** CI exists and is thoughtful (pinned runners with documented reasons, `gates.yml` explaining exactly what it does and does not run and why). Releases are versioned and the release job is carefully ordered so a tag never produces "engine without app." `CONTRIBUTING.md` tells a contributor precisely what to run. I verified end to end that **an outsider can clone, `npm install`, lint clean, run 2,140 gate assertions green, and produce a reproducible build using only the repo and its docs.** So the mechanical answer is: yes, someone else can build, test, and send a PR.

**The real bus-factor risks are two, and they are both about *comprehension*, not access:**

1. **The monolith + string-embedded runtime (§3) means that in practice only you can navigate and change `build.js` quickly.** The knowledge is written down, but it is not *modularised*, and no outside contributor will confidently refactor a 37k-line file with 11k lines of JS/CSS hiding in string literals. The likely failure mode if you step away is not that it breaks – it is that it *ossifies*: bugs get worked around rather than fixed because the core is too daunting to touch.

2. **Documentation sprawl, shipped to users.** `CLAUDE.md` (132 KB), `HANDOFF.md` (188 KB), `PRD.md` (129 KB), `CHANGELOG.md` (333 KB), `PLAN-*.md`, `TODO-*.md` are all tracked and – crucially – **not** `export-ignore`d, so the release tarball carries ~1 MB of internal planning prose. You clearly *know* this pattern: `.gitattributes` already `export-ignore`s `desktop/` and `docs/history/` for exactly this reason. The discipline exists; it just was not applied to the root planning docs. For a new contributor the hazard is not too little documentation but too much *overlapping* documentation (README vs PRD vs HANDOFF vs CLAUDE) with no stated source of truth, some of it stale (PRD still "v0.1").

> **Update:** addressed. Those files (plus `docs/TODO-*.md`) are `export-ignore`d, the README states which document is authoritative, and `PRD.md` / `HANDOFF.md` open with a note that they are historical. The overlap inside the repository remains – that was never the cheap part – but a contributor is now told which document to believe.

**The single thing that breaks if you disappear:** nobody will refactor the core, so the architecture freezes at its current shape. Everything else (format stability, tests, CI, releases) is durable without you. That is a good position to be in – the fix is to make the core *inviting* to a successor, not to document it further.

**API / format stability:** handled correctly. The stability promise is explicitly about the *source format* (a breaking `source.md` change is a major version – `CONTRIBUTING.md`), not a programmatic API, which is right for a build tool consumed by its CLI. Being off npm (`"private": true`) is consistent with the clone/tarball model; the cost is no `npx psi-slides` and no semver consumption as a library, which does not seem to be a goal.

---

## 6. Uncommitted / in-flight work

Working tree is **clean** – no uncommitted changes. You are **2 commits ahead of `origin/main`**, and those two commits are what you were mid-stream on:

- `16766e3` "Footnotes go into the margin too, and the margin is every handout's default" – the substantive change: a `::: footnote` now floats into the right margin beside its block in `print.html`/`print-notes.html`, with a responsive fallback to a table footer under 920 px; `{print-marginalia}` now defaults to `margin` for lectures as for documents.
- `d97282e` "Rebuild the tracked views for footnotes in the margin" – the regenerated `print.html`/`print-notes.html` for the tutorial/diagrams/decoration lectures.

So: a footnote-in-margin feature, finished and committed but not yet pushed. Nothing dangling.

> **Update:** the follow-up is the branch `review-followups` on top of `d97282e`, four commits plus the one that filed this review as `docs/history/REVIEW-code-2026-10-17.md`; see §0.

**One housekeeping artifact:** there is a stale `.git/index.lock` in the repo (a `git checkout`/write will fail with "Unable to create '.git/index.lock': File exists" until it is removed). It did not come from this review – read-only commands and the reproducible build left the tree clean – but it is worth deleting so your next write-git command does not trip over it. *(Removed in the follow-up.)*

---

## Ranked action plan

Ordered by leverage-per-effort. Honest budget notes included, because several of these are tempting to throw an LLM at and one of them you should not.

**1. [Done] (`95ab775`). Stop shipping internal planning docs in the release; name one source of truth. – Effort: ~30 min. Highest leverage-per-effort, do it first.**
Add `CLAUDE.md`, `HANDOFF.md`, `PRD.md`, `PLAN-*.md`, `TODO-*.md`, `CHANGELOG.md`(?) to `.gitattributes` as `export-ignore` (or move the dead ones into the already-ignored `docs/history/`). Fix the `PRD.md` "v0.1" header or retire the file. State in `README`/`CONTRIBUTING` which doc is authoritative for the format. This removes ~1 MB of confusing, partly-stale prose from what a contributor and a tarball-downloader see, and it costs almost nothing. *Worth the budget: unambiguously yes.*

**2. [Done] (`535af43`, `9ccde20`; 91.9 % lines overall, 81.4 % for `build.js`'s Node-side logic). Add a coverage number to the test run. – Effort: half a day. High leverage.**
Wrap the gate + browser suites with `c8` and emit a coverage summary (and optionally a CI badge). You have the tests; you are just not measuring what they miss. For a compiler, knowing which branches of 37k lines are unexercised is cheap insurance and makes the "thorough tests" claim quantitative rather than asserted. *Worth the budget: yes – mechanical, low-risk.*

**3. [Done]. Clear the stale `.git/index.lock`. – Effort: 10 seconds.**
`rm .git/index.lock`. Listed only so it does not bite you. *Trivial.*

**4. [Deferred] on purpose – to be done string by string. Extract the embedded runtime CSS/JS out of `build.js` into real `.css`/`.mjs` files, inlined at build time. – Effort: large (days), and must be done incrementally. The highest-leverage *structural* change, and the one to be most careful with.**
Move `AUDIENCE_JS`, `AUDIENCE_CSS`, `SPEAKER_*`, `PRINT_*`, `DIAGRAM_*` into their own source files, read and inlined by the existing `shipJs`/`shipCss` chokepoints (which already gate how they reach a view, so the seam exists). The payoff is enormous: the ~11k lines of browser code gain linting, highlighting, formatting and type-checking, and `build.js` shrinks toward being *logic* rather than *logic + a bundled frontend*. This is the real bus-factor fix – it makes the core approachable by someone who is not you. **Budget caveat: do NOT point an LLM at "refactor build.js" wholesale.** Do it one string at a time, each extraction guarded by the "reaches a view only through shipJs/shipCss" gate and a reproducible-build check (the build must still emit byte-identical output). Scoped that way it is safe and the gates will catch any slip; done in one sweep it is the one change in this repo that could silently break the runtime. *Worth the budget: yes, but only incrementally and gate-protected – this is the item where tokens are best spent, and also most easily wasted.*

**5. [Done] for build and lint (`60573cc`); the browser side is still open. Add one large-deck / adversarial-size stress test. – Effort: 1–2 hours. Medium leverage.**
You test malformed and untrusted input well; add a generated pathological deck (hundreds of chunks, deeply nested figures) to catch quadratic blowups in layout/camera before a user does. Cheap, closes a real gap. *Worth the budget: yes if you present large decks; optional otherwise.*

Items 4 and 5 are also the two places where the duplication between `build.js` and `lint.js` (§3) and the dual-runtime `diagram-core.mjs` could be revisited – but I would leave both alone: they are deliberate, gated, and working. Not every seam needs removing.

---

### Bottom line

This is a serious, security-literate, well-tested, honestly-documented tool that already did a semester of real teaching, and the quality of its commit messages, comments, and CI is above what most funded projects manage. The weaknesses are real but narrow: a monolith whose embedded frontend resists tooling, a sprawl of internal docs that leaks into releases, and coverage that is thorough but unmeasured. None of these threaten correctness today; all of them raise the cost for anyone who is not you. Fix the cheap ones (1–3) this week; treat the monolith (4) as a slow, gate-protected migration rather than a project.

**After the follow-up:** 1, 2, 3 and 5 are done; what remains is item 4, the large-deck test's browser half, the pre-existing tarball gate, and the `npm audit` advisories. The coverage figure also gives item 4 a baseline: extracting the literals removes the inflation, and `build.js`'s honest line coverage (81.4 %, printed by `test:coverage`) is the number that should not fall.
