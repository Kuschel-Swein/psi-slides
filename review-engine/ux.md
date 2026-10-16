# Usability of the four views in the room – findings

Reviewer dimension: the projection, the cockpit and the two documents, driven in a real browser.
Snapshot: worktree at 3bedb93. Everything was driven with playwright-core (Chromium 153, headless) from
`file://`, on copies of `lectures/tutorial`, `python-intro`, `decoration`, `diagrams` and one real
course lecture (`advasp/20-tracking`, 43 chunks, 61 notes) built into the scratchpad. Two windows in one
browser context stand in for the laptop and the projector; the opener relationship and `postMessage`
are the real ones. Line numbers refer to `build.js` unless another file is named.

Severity scale: **would bite in a lecture** / **annoying** / **polish**. Effort: S / M / L.

---

## 1. Clicking into the notes kills the clicker – and the clicker then types into the notes

**Severity: would bite in a lecture. Effort: S.**

**Observation.** On the course lecture (`#hook`), one click into the cockpit's notes field, then the
presses a clicker sends:

```
PageDown  spk hook:1  aud hook:1
PageDown  spk hook:1  aud hook:1
ArrowRight spk hook:1 aud hook:1
b         spk hook:1  aud hook:1  blanked false
.         spk hook:1  aud hook:1  blanked false
PageUp    spk hook:1  aud hook:1
```

Nothing moves and nothing blanks. The `b` and `.` went into the note at the caret: the source note's
"If the room is quiet" now reads "If the roob.m is quiet". It is written straight to `localStorage` as an
override (`psi-slides:<title>:speakernote:hook`, input handler at 27396–27404), so the change outlasts the
talk and every later rebuild of the deck in that browser.

This is not an unusual path. Finding 2 below means a lecturer has to click into the field to read the
rest of a long note: focus is the only thing that switches its `overflow` from `hidden` to `auto`
(26122–26126). The field's keydown handler knows only `Escape` (27406–27409).

**Proposal.** In `notesContent`'s keydown, pass `PageDown` / `PageUp` (keys nobody edits a note with)
on to the deck – blur, then run `COMMAND_RUN.forward` / `back`. Better still, make the field read-only
until `Shift`-`N` or a double-click opens it for editing, so a single click to scroll can never put it
into edit mode. Either way, `b` and `.` stop reaching the text once the field is not being edited.

## 2. The cockpit cuts long notes at three lines and gives no sign that more follows

**Severity: would bite in a lecture. Effort: S.**

**Observation.** `autoSizeNotes` caps the field at `NOTES_MAX_LINES = 3` (27362–27388), and the field
is `overflow: hidden` while it does not have focus (26101–26120). The wheel does not scroll it (measured:
no element in the pane had `scrollTop > 0` after a 300 px wheel). On the course lecture at 1440×900,
**21 of 51 chunks** have notes taller than the pane (for example `#hook`: 282 px of text in 137 px).
The screenshot shows three clean lines and nothing below them: the cut falls exactly on a line boundary,
so the lecturer has no visual cue that the note continues. At 1280×800 the count is the same.

The cue-card mode (`K`) shows all of it, but the classic arrangement is the one the cockpit opens in.

**Proposal.** Let the field scroll without focus (`overflow-y: auto` in both states), show a fade or
a "more ↓" mark on the bottom edge when `scrollHeight > clientHeight`, and raise the automatic cap to
what fits – say up to 35 % of the window height – before scrolling starts. Together with finding 1, this
removes the reason to click into the field mid-talk.

## 3. A cockpit opened first, or left behind by a closed projection, says "● live" and drives nothing

**Severity: would bite in a lecture. Effort: S for the indicator, M for opening the projection from the cockpit.**

**Observation.**

- *The cockpit opened first.* `speaker.html` opened directly shows the full cockpit with a green
  **● LIVE** in the footer (shot 01). `S` does nothing (`cockpit` is an audience-only command,
  `commands.mjs:427`; page count stayed at 1) and no message appears. A lecturer who thinks of
  themselves as "the speaker" and opens the speaker file first gets a cockpit that looks connected and
  is not.
- *`B` with no projection.* The cockpit flashes "projection blanked" (mode badge, measured) and shows
  the BLANK badge although no projection exists (24723–24735). speaker.md §2 calls a lit projection under
  that toast "the one failure that has to not happen".
- *The projection closed by mistake and reopened by hand.* After the projection window was closed,
  `audience.html` was opened again and `S` pressed. **A second cockpit opened** (pages 2 → 3): the
  named-window lookup in 24777ff cannot find the old cockpit from an unrelated tab. The new cockpit's
  clock read 0:00 while the old one read 0:09; the old one still said "live" and its presses moved
  nothing on the new projection (`orig spk 8:2 → 8:3, aud2 stays 8:-`). The lecturer now has two cockpits,
  the clock reset and the cue cursor lost.

**Proposal.** (a) Paint the freeze button from `hasLivePeer()` (20513) as well: "○ no projection" in
place of "● live" whenever there is no peer, and make `B` and `W` say "no projection window" as `D`
already does (24086). (b) Give the cockpit an "open projection" command (`S` in the cockpit, plus the
same button) that opens `audience.html` into a named window and adopts it as the peer. The cockpit then
becomes the window that opens the other one, so the closed-projection case is recovered from the cockpit
and the clock, freeze and cue cursor are kept.

## 4. After a projection reload, presses on the projection no longer reach the cockpit

**Severity: would bite in a lecture. Effort: S.**

**Observation.** The projection reloaded mid-talk (F5 on a Windows clicker's slideshow button, a
`--watch` save, a mis-key), then three `PageDown` presses on the projection window:

```
before                  spk 8:1   aud 8:1
3 clicks in reloaded aud spk 8:1   aud 9:1
then 1 press in cockpit  spk 8:2   aud 8:2
```

The room moved to the next slide; the cockpit's mirror, notes and clock stayed on the old one. The
cockpit's next press pulled the room back a slide. The cause is in the design (speaker.md §3): a reloaded
projection has no peer until the cockpit next sends something. A clicker aimed at the projection is the
case speaker.md §2 already builds the `press` message for.

The same reload also drops the projection's reveal state: on `#arrows` the projection fell from beat 2
to beat 1 while the cockpit still showed beat 2, until the next cockpit press (`segments visible 100`).

**Proposal.** Have the cockpit send `hello` (or its snapshot) to `window.opener` on a short heartbeat
while it has no confirmed reply, or when a `storage` event shows the projection writing its position.
From `file://`, Chrome and Safari share one `localStorage` between the two files (CLAUDE.md, reader
section), so the event reaches the other file. Either way, the projection adopts the peer within a
second of loading and takes over its full state, reveals included. Separately, intercept `F5` /
`Shift`-`F5` in the key map (`preventDefault`, treat them as "start"), because on Windows and Linux
they reload the projection and drop it out of fullscreen.

## 5. A tall chunk with no further beat never shows its foot

**Severity: would bite in a lecture (at a 4:3 or 16:10 projector). Effort: M.**

**Observation.** The course lecture runs with `auto-fit` at its default (`false`). At **1024×768**
`--check-fit` lists 8 chunks taller than the frame and says they are "read by scrolling". All 8 are
single-segment chunks. Walking every beat with `PageDown`, the foot was never brought into the frame:
on the last beat, before the next press left the chunk, the chunk's bottom stood **109–424 px below the
frame** (`#hsts-caveats` 424, `#privacy-sandbox` 381, `#defence-1p-tricks` 340, …). At 1280×800, 7 chunks
are cut by 113–439 px. Shot 40: `#hsts-caveats` cut mid-sentence at "their whole", and the next press
goes to the next slide.

The camera walks down a tall chunk only when the reveal count is above 1
(`ty = (shown > 1) ? … : pinHead`, 21564–21582), so a chunk with no `---` keeps its head pinned. The
report's comment (33176–33180) says "nothing is unreachable". That holds for a mouse, which can drag,
not for a clicker.

**Proposal.** Add a camera beat: on a chunk whose painted span is taller than the frame, the last
forward press before leaving walks the camera to the foot first (and back undoes it), the same glide
the reveal walk uses. Have `--check-fit` report "foot never shown on any beat" as its own line, apart
from the tall chunks a walk does reach. A cheaper interim: `auto-fit: shrink` as the advice in that
line.

## 6. The PDF of print.html leaves headings alone at the foot of a page

**Severity: annoying. Effort: S.**

**Observation.** `page.pdf()` of the course lecture's `print.html` (A4, 20 pages): pages 9, 12, 15 and 18
end in a heading whose content is on the next page (`pdftotext`, last line per page): "two trackers agree
you are the same user" (the sub-heading of `#cookie-syncing`, its figure on p. 10), "Five linkage
vectors", "CNAME cloaking", and on p. 18 the type eyebrow "example" alone. `h1–h3` and `.chunk-heading`
carry `break-after: avoid` (9600, 9824, 9860). The eyebrow (`.chunk-label`) and the sub-heading do not,
and Chromium gives up the avoid when the next box is a `break-inside: avoid` figure.

**Proposal.** Wrap label, heading and sub-heading in one header element with `break-inside: avoid;
break-after: avoid`, or at least add `break-after: avoid` to `.chunk-label` and the sub-heading. Check
with `pdftotext` over `lectures/` for any page ending in a heading line.

## 7. On a phone, the reader's "Highlight" button lies over figure and code content

**Severity: annoying. Effort: S.**

**Observation.** At 390 px with touch (`hover: none`), `.rd-fig-btn` is shown permanently at opacity 0.55
in the top-right corner of every figure and code block (11309ff and the touch rule after it). On
`#cookie-syncing` it lies over the "tracker2.com" lifeline header. On the crawler output it lies over the
code, and the two texts mix ("hoHighlight~1"). The "Contents" pill at the bottom-left covers a line of body
text throughout (shots 61/62 phone). The slide number `.chunk-num` sits at x = −10 … −4 px, outside the
viewport, on all three lectures checked.

**Proposal.** On `hover: none`, put the figure button below the figure (a small text button on the
caption line) rather than over it, and give the "Contents" pill a matching bottom padding on `main`.
Pull `.chunk-num` inside the column under 480 px.

## 8. While frozen, the cockpit does not show where the room is

**Severity: annoying. Effort: S.**

**Observation.** Frozen and three slides ahead (shot 32): the preview strip labels the cockpit's own
chunk NOW and the neighbours −2 … +2. The room's slide carries no mark. The only sign of the freeze is
the blue "❄ FROZEN" pill in the footer corner. No `roomIdx` or similar exists in the runtime (grep).

**Proposal.** While frozen, mark the room's slide in the strip and scrubber (e.g. "ROOM" in place of
the offset label) and tint the stage's letterbox. The snapshot a frozen cockpit still receives
(`applyFrozenState`) already carries `activeIdx`.

## 9. The pan between slides ignores `prefers-reduced-motion`

**Severity: polish (accessibility). Effort: S.**

**Observation.** With `reducedMotion: 'reduce'` emulated (`matchMedia` true), `#psiINT-stage` still
transitions `transform 0.25s`. One press sampled at 40 ms intervals gave 7 distinct transforms, a
1516 px horizontal glide (15024, `--camera-duration: 250ms` at 14587). The reduced-motion rules that do
exist cover diagram steps, overlays, backdrops and the reader sidebar (4499, 10989, 17011, 17114), not the
camera.

**Proposal.** Under `prefers-reduced-motion: reduce`, set `--camera-duration` to 0 or resolve
`transition: pan` to `cut` in `landSlide()`. Leave the walk down a tall chunk at a short fade, so the
room still sees that something moved. The setting is the lecturer's operating system, so the cockpit
and the documents benefit most.

## 10. Alt text and caption are one field, and the linter steers authors to empty alt

**Severity: polish (accessibility). Effort: M.**

**Observation.** In the course lecture all three raster images are `![](id)` and come out `alt=""`, so
screenshots read as decoration to a screen reader. That is what the tool asks for: alt text becomes a
visible `<figcaption>` (3273, 3283, 3330, 3363), and the linter's figure rule tells authors to "use
`![](id)` to drop the caption" (`lint.js:3790–3814`). An author who wants no caption has no way to keep
an accessible name. Spliced diagrams do get `role="img"`, with a label only when `alt` is set
(`diagram-core.mjs:9647`).

**Proposal.** Separate the two: `![alt](id "caption")` (the Markdown title slot) or a `{alt="…"}` tail,
where the caption is only drawn when asked for. Until then, fall back to the chunk heading as the
`aria-label` of an image with empty alt on a `figure:` chunk.

## 11. Small, low-contrast cockpit chrome

**Severity: polish. Effort: S.**

**Observation.** Measured at 1440×900, light theme: scrubber part names 11 px at 3.44:1, the
`−1`/`+1` clock buttons 11 px at 3.15:1, preview-strip offset labels ("+1", "NOW") 9 px at 2.75:1, the
footer key crib 9 px, the cockpit's "+ NOTE" 10 px at 1.67:1. The clock is 21.6 px. In the preview strip
the next slide's heading is about 13 px tall and its body lines about 10–11 px (scale 0.234), so the next
slide is recognised by its heading only. The cockpit is read from about arm's length at a glance; the
dark theme brings every one of these above 5:1.

**Proposal.** Raise the scrubber and strip labels to 12–13 px at ≥ 4.5:1 and the clock to about 32 px;
keep the crib small. This is a size change, not new chrome.

## 12. The start menu is the entry point and is set at 2:1 contrast

**Severity: polish. Effort: S.**

**Observation.** `#psiINT-start-menu` ("Fullscreen W · Speaker cockpit S · Print view P") measured 2.01:1
on the light theme, small capitals about 9 px tall, `kbd` 10 px (shot 95). It is the one place the
projection tells a first-time lecturer about `S`. It is quiet on purpose, since the room sees it while it
fills. Tab focus on it is visible (blue ring), but `Space` and `Enter` on a focused entry advance the
slide rather than run the entry (idx 0 → 1 with focus on "Fullscreen").

**Proposal.** Full ink on hover and focus, 3:1 at rest. Let `Enter` on a focused start-menu button run
the button (the link mark already gets that exception from the key map).

## 13. One clicker key with no answer: Escape in fullscreen

**Severity: annoying. Effort: S.**

**Observation.** The common clicker set maps cleanly onto `commands.mjs`: PageDown/PageUp/arrows are
forward/back, `B` and `.` blank (verified on both windows and through the freeze gate), and a press on the
projection starts the cockpit's clock. Two keys fall outside it. `F5` is covered in finding 4.
`Escape`, which Logitech-style "slideshow" buttons send on alternate presses, takes the projection out of
fullscreen at the browser level, before the page sees it.

**Proposal.** On entering fullscreen, call `navigator.keyboard.lock(['Escape'])` where it exists
(Chromium). A single `Esc` then reaches the page's unwind chain, and holding `Esc` still leaves
fullscreen as the browser shows it. Release the lock on exit.

## 14. Smaller observations

- **Back is exact.** Forward to the end and back to the start on five decks (tutorial 81 beats, diagrams
  95, decoration 80, the course lecture 52, python-intro 58): back retraced every forward state in
  reverse, one beat per press. No finding, recorded so nobody re-measures it.
- **Theme cycling with figures.** `dark`, `terminal-amber` and `terminal-green` keep a sequence figure
  legible (shots 43-*). Body text is 11.5–17:1 on all seven themes.
- **`?` panel.** `→` and `←` are bound to forward and back but missing from those two rows. They appear
  only as a doc row, "the same pair, on every slide", in the reference half at the bottom
  (`commands.mjs:201–211`). Add them to the two `show` strings.
- **Cards mode.** The "cue cards · Space says the next card…" toast lies over the breadcrumb and card
  counter for its 1.8 s (shot 31).
- **Blank in the cockpit.** The "BLANK · HIT B TO TOGGLE" badge is drawn over the NOW thumbnail, while the
  big mirror still shows the slide undimmed (shot 10). Dimming the mirror would say "the room sees
  black" where the eye already is.
- **Overview from the cockpit goes to the wall.** `O` in the cockpit puts the overview board on the
  projection, as speaker.md §2 decides. A lecturer who wants to look privately has to know to press `V`
  first; nothing in the overview badge says so.
- **Documents.** `lang` is set and `<title>` names the view. `print.html` has nine `h1` (the title plus
  one per part) and chunk headings at `h2`, with no skipped levels. The reader's highlight pop-up covers
  the line under the selection (shot 70). The contents sidebar marks the current part well.

## What was not checked

A real second display, and fullscreen on it: headless Chromium does not resize on fullscreen
(`test/nav-fullscreen.mjs` says the same). Safari and Firefox. The live demo (`D`). The prompter.
