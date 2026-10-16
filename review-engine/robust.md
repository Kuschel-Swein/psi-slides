# Robustness, maintainability and reported pain points – psi-slides at 3bedb93

Reviewer dimension: robustness, maintainability, and the pain points users already reported.
Snapshot: worktree at 3bedb93. All fixtures were built in `scratchpad/work/robust/` (deleted afterwards);
nothing in either repository was built or edited. Gates run in the worktree: 1974 passed, 0 failed.

Legend: CONFIRMED = reproduced with a fixture deck (build + lint run, output inspected, and where it mattered
loaded in Chromium). PLAUSIBLE = read from the code, not reproduced. Effort S/M/L.

---

## 1. Status of the engine items in the content repo's lessons-learned files

Sources: `TODO-lessons-learned.md` (V, E, G), `TODO-how-to-avoid-the-pitfalls.md` (P1–P11),
`TODO-harden-engine-and-house-style.md` (T1–T28), `TODO-lessons-keynote-2036.md` (K1–K12),
`TODO-keynote-frames-review.md` (F3.1–F4.3), `HOUSE-STYLE.md` traps list. Checked against the code,
`CHANGELOG.md`, and fixture builds where marked.

| Item | What was reported | Status | Evidence |
|---|---|---|---|
| E1 / T1 | `box root` (and `name--r`) collides with emitted ids, figure silently dead | **Fixed** | `DG_RESERVED_EMITTED_IDS`, mirrored in lint |
| E2 / T2 | `::: rows` term and body glued in print | **Fixed** | `PRINT_CSS` rows grid, build.js:10405–10426 |
| E3 / P2.1 / T3 | No overlap warning in figures | **Fixed** | `dgOverlapWarnings` (diagram-core.mjs:7803) |
| P2.2 | Adjacency warning | **Dropped, with measurement** | T3 log: no separating threshold |
| P2.3 | An edge running through an unrelated box | **Open** | CONFIRMED: `edge a -> b` straight through box `m` – no warning (fixture g4). Still worth doing for straight edges, see finding R9 |
| G1 / T14 | Blank line under `table` – 38 errors, none says "blank" | **Fixed in lint, partly in build** | lint names the blank line; build's message still lists the known statements only and points at "line 3 of the block" |
| G2 / P3 / T4 | `.paper` ground erases a short edge | **Fixed (elbows)** | `edge-label-swallows-edge`; straight edges deliberately exempt; edge-label clip warning covers the other half |
| G3 | Absolute `at` rows overlap | **Fixed** | overlap warning + chains share size |
| G4 | `same as` copies size, not classes; label overflows | **Documented; warning gap remains** | CONFIRMED: `same as` / `same w as` boxes skip the label-overflow check (R6) |
| G5 / P4 / T10 | `::: cols` is a no-op on the projection | **Documented**; lint note not done | authoring skill:919; low value now |
| G6, G7 / T14 | Alignment classes per kind; `w`/`h` grid cells | **Documented**; `.left` on a free text now anchors | HOUSE-STYLE traps |
| Enumeration rule / P5 / T6 | Count announced, items in prose | **Rejected with measurement** | 41 false hits on engine decks |
| P6 / T7 | `cards 4` in `.wide` too narrow | **Rejected (lint); documented** | not decidable from source |
| P8 / T8 | Authoring jargon on slides | **Rejected; house-style word list** | – |
| P9 / T9 | `figure:` with no figure | **Fixed** | `figure-tag-without-figure` |
| P9 | `slide-numbers` stacks digits | **Fixed** | default is `horizontal` since 2.0.0 |
| P1 / T5 / V1–V3 | No fit measurement | **Fixed** | `--check-fit`, per state, 1600x900 |
| V6 | Probe "runtime never attached" | **Moot** | root cause E1 fixed |
| K1 / F3.6 | `at` anchors centre; `.left` only aligns lines | **Fixed** | `anchor tl…br`; `.left` anchors on a coordinate |
| K2 / F3.3 | Figure type shrinks silently; per-chunk control | **Fixed** | canvas, `figure-type-small`, `.figure-type-60…200`, deck-median line in `--check-fit` |
| K3 / F4.1 | Figure under `#` gets half width | **Fixed** | `{.stack}` with `.full` measure |
| K4 | Notes under `#` move to next chunk | **Fixed** | divider notes |
| K5 | `.bare` swallows `.dashed` | **Fixed** | refused in both (fixture s20) |
| K6 | No `zone` element | **Fixed** | `zone … in` |
| K7 | `figure:` heading is a caption | **Documented** | authoring skill:206 |
| K8 | Footnote after `---` shows from beat 0 | **Fixed** | `data-seg` |
| K9 / F3.7 | `rows` hyphenates terms; `---` in rows reserves a row | **Fixed** | CONFIRMED by `--frames`: no gap difference between rows with and without beats |
| K9 | Statement-slide type | **Fixed** | `statement:` |
| K10 | `--optimize-images` misses backdrops; no downscale | **Fixed** | 25d0c4d |
| K11 | No per-state PNG export | **Fixed** | `--frames` |
| K12 | `_` in labels read as emphasis | **Fixed** | literal inside a word |
| K12 | Table header always bold; row height vs `.large` | **Fixed** | `unheaded`, row follows `.large` |
| K12 | Edge warnings without location | **Partly fixed** | warnings now say "line N of the block", never the `source.md` line (R8) |
| K12 | `+ note` button on every projected slide | **Fixed** | `note-button: off`, `M` |
| K12 | Neighbouring slides show through | **Fixed** | `neighbours: hidden`, `transition` |
| K12 | `label` step lengthens a label past its box | **Warned** | fixture d11 warns |
| K12 | `.small`/`.large` in a step | **Still refused** (by design) | – |
| K12 | `--optimize-images` success wording | **Not re-verified** | – |
| F3.1 | Backdrop scaled with auto-fit, paper margin visible | **Not reproduced** | `--frames` on a backdrop + overflowing figure: backdrop fills the frame |
| F3.2 | Figure centred instead of on text edge | **Fixed** | `blocks: left` uses `--dg-ink-x` |
| F3.4 | Chunk top-anchored | **Fixed** | `.middle`/`.top` and shape-based default |
| F3.5 | `emph` draws an outline on `.bare` | **Fixed** | CHANGELOG |
| F3.8 | Heading/paragraph spacing inverted | **Fixed** | one `--block-gap` |
| F3.9 | Expand chip truncated to "EXP"; footnote grows with zoom; URL hyphenated; `--check-fit` lists tall chunks | **Fixed** | CHANGELOG, `nohy` |
| F3.9 | `.wrap-balance` on a `#` line | **Open** | `COLUMN_SLOTS` holds `stack`/`bare` only; low value |
| F4.2 | `{.bare}` on a `#` line | **Fixed** | – |
| F4.3 | Free composition on a divider | **Partly** | `cards`/`rows`/`overlay`/`backdrop`/`draw` allowed; `side`/`cols` refused by design |

**Verdict on the reported list:** nearly every engine item is closed, and the rejected ones were rejected
with measurements. Still open and still worth doing: P2.3 (straight edge through an unrelated box) and the
G4 warning gap. The new findings below are mostly *new* classes the reports never hit.

---

## 2. Findings

### R1 – Commenting out a slide with `<!-- … -->` kills every view from that point on (High, CONFIRMED)

`build.js:6140–6141` recognises `#` / `##` headings, and the reveal reader (`revealMark`, build.js:5417)
recognises `---`, without asking whether the line is inside a multi-line HTML comment. The parser's own
`fence` (build.js:5379) is the shared `fenceTracker`, which already tracks comments (`inComment`,
tails.mjs:481, added in 76c737e for exactly this "draft commented out" case) – but only `fence.inside` is
read (build.js:6084).

Scenario (an author parks a draft slide):

```
## free: Kept {.wide #kept}
Visible.

<!--
## free: Dropped slide {.wide #dropped}
Draft text.
-->
```

The `<!--` is emitted inside `#kept`'s body and the `-->` lands in the next chunk's paragraph, where marked
escapes it to `--&gt;`. The browser's comment never closes. Loaded in Chromium: audience, speaker and print
all lose every later chunk, all chrome and all runtime scripts (`audience.html`: 1 script instead of 4,
2 `psiINT-` elements instead of 34; navigation dead). A `---` inside a comment does the same (it splits a
reveal segment across the comment). Build exit 0, lint clean, the log even counts the commented chunk.

Fix: read `fence.inComment` beside `fence.inside` and treat comment lines as body text for headings,
`---`, directives and notes; mirror in lint.js (same tracker). Add the three fixtures to `test/settings.mjs`.
Effort S.

### R2 – A `> note:` inside `::: cards` / `::: rows` is shown to the room (High, CONFIRMED)

The cards capture (build.js:6090–6125) `continue`s before the note parser (build.js:6274) ever sees the line,
so the note becomes part of the card body: a `<blockquote><p>note: …</p></blockquote>` on the projection,
in print, and in the cockpit's slide clone – and missing from the cockpit's notes. Same for a cards/rows
block under a `#` divider. Notes inside `side`, `cols`, `overlay`, `expand`, `slide`, `footnote`, `dock`,
`marginalia` are all handled correctly (checked: each reaches the speaker view only). Lint and build silent.

Fix: in the cards capture, refuse `> note:` / `> annot:` the way `note-in-pulse` does (or peel it to the
chunk), mirrored as `note-in-cards` in lint.js. Effort S.

### R3 – An unknown or argument-less directive opener prints itself on the slide (Medium, CONFIRMED)

`::: backdorp pic {.cover}`, `::: sdie`, `::: expand` (no label) are not recognised as directives and fall
through as paragraph text. With no closer (single-line directives such as `backdrop`) the slide shows the
literal `::: backdorp pic {.cover}` and both tools exit 0. With a closer, the error is reported at the
*closer* ("a ::: closes a block, and none is open here"), pointing away from the typo.

Fix: after every known opener has had its turn, refuse any non-fenced, non-comment line matching
`/^:::\s*[A-Za-z]/` as `unknown-directive`, naming the vocabulary; same rule in lint.js. Effort S.

### R4 – lint passes what the build refuses: frontmatter and pictures (Medium, CONFIRMED)

The direction CLAUDE.md says merges green. Lint exit 0, build exit 1:

| fixture | build says |
|---|---|
| unclosed quote in YAML (`title: "Unclosed`) | YAML does not parse |
| frontmatter with no closing `---` | "can not read a block mapping entry" – not "frontmatter never closed" |
| `::: backdrop nopic` (missing file) | resolves to no file |
| `cover-image: assets/nope.jpg` (missing) | refused, with a doubled path `assets/assets/nope.jpg.{…}` in the hint |
| `image i nopic` in a `::: draw` | cannot find "nopic" |

And one both pass silently: a **tab-indented** `style:` block parses (js-yaml) as `style: null` plus a
top-level `hyphenate: all`, so the whole block is dropped; lint's hand reader sees it nested and does not
flag the stray top-level key either.

Fix: lint's `unresolved-asset` should cover `::: backdrop`, `cover-image:`/`closing-image:` and draw `image`
as an **error** (the build already refuses them; lint already walks those refs for the size cap at
lint.js:5199–5214). Add `bad-frontmatter` for an unterminated quote, a missing closing `---` and a tab in
indentation (YAML forbids tabs for indentation, so refusing them is safe). Fix the doubled-path hint.
Effort S–M.

### R5 – Missing-picture policy differs by spelling; the shorthand miss is completely silent (Medium, CONFIRMED)

Five ways to name a picture, three behaviours: a missing `::: backdrop`, `cover-image` or draw `image` fails
the build; a missing explicit `![](assets/x.png)` ships a placeholder with an `[assets] not found` log line
and a lint warning; a missing shorthand `![](no-such-fig)` ships a "missing: assets/no-such-fig.(svg|png|…)"
box on the projection with **no log line and no lint finding** (build.js:3306; lint.js:5184 skips the
shorthand "by design"). A typo in a figure id therefore reaches the room.

Fix: at minimum log the shorthand miss beside `[assets] not found` and warn in lint; better, one policy for
all five (fail, with `--allow-missing-assets` for drafts, like `--allow-missing-ids`). Effort S.

### R6 – `same as` / `same w as` boxes skip the label-overflow warning (Medium, CONFIRMED)

diagram-core.mjs:7039 warns only when the width was *written* (`nw != null`). A box sized by `same as p1` or
`same w as p1` gets p1's 60 px and a 172 px label with no warning (fixtures d08, d09, d13); the identical box
with `w 0.5` written warns. This is exactly the G4 trap from the lessons file. Fix: run the check against the
resolved size whenever any size source pinned it (written, `same as`, `same w/h as`). Effort S.

### R7 – Unknown CLI flags are ignored; `-h` is dead code (Low–Medium, CONFIRMED)

build.js:34123 collects flags into a Set and never rejects an unknown one (the comment at 34166 says so).
`--check-fitt`, `--audience-onyl`, `--no-inline-image` build all four views, exit 0 and do nothing they
promised. `node build.js -h` reports "Input not found: …/-h", because `flags` holds only `--` items and the
`flags.has('-h')` at build.js:34229 can never be true. `--port 99999` dies with a Node stack trace
(build.js:32786), and passing a folder (`node build.js lectures/tutorial`, which `lint.js` accepts) dies with
an `EISDIR` stack trace.

Fix: one known-flags table (the help text already lists them) and a refusal by name with a nearest-match
hint; validate `--port`; refuse a directory input with "build takes one source.md". Effort S.

### R8 – Build diagnostics name a block line or a chunk, not a `source.md` line (Medium, CONFIRMED)

Lint reports `source.md:19`; the build reports "line 2 of the block" for every `::: draw` error and for every
figure warning (warnings are build-only, so the author has no other locator), and parser refusals name
`chunkRef()` (build.js:5409). With ids still optional (`--allow-missing-ids` while sketching) a refusal reads
"(a chunk with no id)" and no location at all (CONFIRMED). The parser knows the absolute line
(`bodyAt: fmOffset + lineAt`), so `refuse()` (build.js:5413) and `dgSite()` can prefix `source.md:N`.
Effort S.

### R9 – Straight edges through unrelated boxes are not reported (Low–Medium, CONFIRMED)

P2.3 from the pitfalls file, still open. `box a`, `box m`, `box b` in a row and `edge a -> b`: the line runs
through `m`'s label, no warning. For straight (non-elbow) edges this is a segment–rectangle test in the layout
pass, beside `dgElbowRailWarnings` (diagram-core.mjs:8122), with the same "at every beat" rule. The T3 log
says the elbow variant is harder; the straight variant is not. Effort M.

### R10 – `--watch` rebuilds only on `source.md` (Medium, CONFIRMED)

build.js:32520 filters directory events to `filename === basename(source)`. Atomic-rename saves, two saves
in 80 ms, delete-and-restore, an error then a fix, and even renaming the lecture folder away and back all
recovered correctly on macOS. But replacing `assets/photo.jpg`, a picture shared from the folder above, a
font in `fonts/`, or a clip, triggers no rebuild – the author re-exports a figure and sees the old one until
they touch `source.md`. A deleted source logs a raw `ENOENT` line (not `userFacing`).

Fix: after each build, watch the resolved asset files (the build already gathers them for
`assertAssetsConfined` / `collectDecorationImageRefs`) and `fonts/`; debounce into the same `rebuild`.
Keep the editor's asset upload exempt, as the comment at build.js:32450 explains. Effort M.

### R11 – Smaller silent no-ops (Low, CONFIRMED)

- An indented `::: footnote` under a list item renders as literal `::: footnote Note. :::` text.
- `### Sub {.narrow}` prints `{.narrow}` in the heading.
- `> note: from one` is taken as a note whose text is "from one".
- `$$\frac{a}{$$` ships a red KaTeX error with exit 0 (logged, not refused; lint silent).
- `node build.js --new x` scaffolds a deck whose first build already warns `figure-underfills-canvas`.

Each is a one-line lint warning if wanted; none is urgent.

---

## 3. build.js ↔ lint.js congruence

Hand-mirrored tables compared by evaluating both sides (script in the scratch area, since deleted):
`VALID_TAGS`, all twelve `VIEW_DEFAULT_SPEC` value lists, `cover` / `section` / `cover-align` /
`cover-ground` / `closing-credits` / `ligatures`, `COVER_*_VARIANTS`, `COVER_BODY_ART`, `IMG_EXTS`,
`VIDEO_EXTS`, both inline caps, every `STYLE_SPEC` enum and number range, `SOUFFLEUSE_SPEC`, and
`STRINGS.en` keys against `LABEL_KEYS` / `LABEL_TYPE_KEYS`. **All identical.** Only `VALID_TAGS` and
`WIDTH_EM`/`DOCK_SHARE` have no gate holding them (cheap to add to `test/gates/frontmatter.mjs`).

The 28 refusals added or touched in the last ~60 commits (`.bleed`, `start:`, `pitchblack`, `fonts` with no
role, `figure-type-170…200`, grid 1–2000, `{.stack}`/`{.bare}` on empty dividers, autoplay without steps,
`neighbours`, display faces, `prompter`, `labels`, `.middle .top`, cover-ratio/image on the wrong cover,
backdrop reveal, overlay `from`, dock `.every`, embed URL, pulse split…) were run as 28 fixtures through both tools:
both agreed on all 28 (25 refused, 3 accepted), with matching wording. The remaining incongruences are the asset and
frontmatter ones in R4, and message quality (lint's table-row message names the blank line, the build's does
not; lint reports a cascade of two errors where the build reports one, e.g. `::: cards x` + stray closer).

---

## 4. Error handling – 26 typical author mistakes

No author mistake produced a stack trace except: a folder as input (`EISDIR`), `--port 99999`, and a deleted
source under `--watch` (raw `ENOENT`, no stack). Every frontmatter and grammar refusal is `userFacing` and
names the alternative. Weak spots, all above: location (R8), the misleading "stray closer" after an unknown
opener (R3), the YAML-unclosed message (R4), and the silent cases (R1, R2, R5, R11).

---

## 5. Maintainability hot spots

- **The parser's capture modes each re-decide what a line is.** `parseLecture`'s loop (build.js:5290–6500)
  has several early `continue` paths (cards, draw, pulse, overlay, expansion) ahead of note, heading and
  comment handling; R1 and R2 are both a line class one mode forgot. A gate that runs a matrix –
  every container × {`> note:`, `> annot:`, `---`, `#`, `##`, `<!--…-->` spanning lines, an unknown
  `:::` word} – through build and lint and asserts agreement plus "no `note:` / unbalanced `<!--` text in
  `audience.html`" would have caught both. `test/gates/refusals.mjs` is that kind of differential for the
  figure language only. Effort M.
- **Two YAML readers.** js-yaml in the build, a hand reader in lint.js. They already disagree on tabs and
  unterminated scalars (R4). Keep the lint reader conservative: refuse what it cannot read rather than guess.
- **CLI parsing is a Set of strings plus `VALUE_FLAGS`** (build.js:32804, 34123). Every new flag is a new
  chance for a silent no-op (R7); the PDF and prompter flags each grew their own hand-written refusals.
- **Dead code:** none found. 570 top-level function declarations in build.js, each referenced outside its own
  definition (comments excluded).
- **Test coverage of the riskiest parts:** the template-literal hazards (`inlined` gate), the figure language
  (`refusals`, `semantics`) and the tables are well held. The document-level parser – the part that produced
  every High finding here – has fixtures in `test/settings.mjs` for nesting pairs but no generated matrix.

---

## 6. Suggested order

1. R1 (comments) and R2 (notes in cards) – both S, both show private or broken content to a room.
2. R4 and R5 – make lint refuse what the build refuses for pictures and frontmatter; one missing-picture policy.
3. R3 and R7 – refuse unknown directive words and unknown flags by name.
4. R8 – `source.md:N` on build diagnostics.
5. R6, R9 – the two figure warnings.
6. R10 – watch the assets.
7. The container × line-class matrix gate, so the next capture mode cannot repeat R1/R2.
