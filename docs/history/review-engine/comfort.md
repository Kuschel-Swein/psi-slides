# Comfort and workflow review – psi-slides 2.0.0 (worktree at 3bedb93)

Scope: the four helper scripts in `psi-slides-mylectures`, starting the prompter
from scratch, the CLI surface, the authoring loop, and the workarounds the
content repo's own instructions encode. Every finding below names the command
that was run (in the scratchpad worktree, on copies of `lectures/spoken-talk`
and `introsp/20-foundations`) or a file:line. Line numbers are `build.js` in
the worktree unless another file is named.

## Script feature → engine?

| Script feature | Where | Engine? | Proposed shape |
| --- | --- | --- | --- |
| Resolve a lecture by slug / `NN-slug` / `course/NN-slug` | build.sh, rehearse.sh, debrief.sh, pack-talk.sh (four copies of one bash function) | no | It encodes this repo's `lectures/<course>/<NN>-<slug>/` layout. Keep it local, but in **one** file the other three source. The engine part: accept a **directory** as input (today `EISDIR` stack trace) |
| List the lectures when run bare | build.sh, pack-talk.sh | no | Repository layout, not engine |
| Render `*.mmd` with mermaid-render-beautiful before every build | build.sh | **drop** | Superseded by `::: draw` (HOUSE-STYLE §"What we use"). All 15 `.mmd` have their `.svg` tracked, so the step only re-renders committed files on every build |
| `--inline` / `--no-inline` short aliases | build.sh | drop | Cosmetic; the engine's long names are fine once unknown flags are refused (§4) |
| Forward `build.js --help` under its own help | build.sh | – | Goes away with a `bin` entry and a help that exits 0 (§9) |
| `--watch --serve --prompter` in one command | rehearse.sh, Start.command | **yes** | `--present` (or a `present` subcommand): watch + serve + prompter, stable port, open the cockpit when ready (§3) |
| Fixed port 8080 (rehearse.sh) / first free port from 8080 via `nc -z` (Start.command) | rehearse.sh, Start.command | **yes** | Stable per-lecture default port, next free one if taken, and a user-facing message instead of the `EADDRINUSE` stack (§3) |
| Open Chrome only once the server answers (curl loop, 120 × 0.5 s) | Start.command | **yes** | `--open` (implied by `--present`): after the initial build and listen, open speaker.html; Chrome when the prompter is on |
| Print cockpit + room URLs and "Shift-S: prompter on" | rehearse.sh, Start.command | **yes** | The engine prints no URL on a fresh folder and never mentions Shift-S (§3) |
| Auto `--prompter-dry-run` when `.env` has no key | Start.command | **yes** | Without a key, run as dry run and say so (today: "disabled", no hint at the fix) |
| Load the key with `node --env-file=…/.env` | rehearse.sh, Start.command, engine memory note | maybe | Read `OPENROUTER_API_KEY` (only that key) from a user-owned file such as `~/.config/psi-slides/prompter.env`; **never** a `.env` from the lecture folder, which a sent deck could use to set `OPENROUTER_BASE_URL` (§10) |
| "The prompter needs Chrome" | rehearse.sh, Start.command, LIESMICH | yes (small) | `--open` picks Chrome under `--prompter`; the startup line says so. The cockpit already says "no speech recognition in this browser" (28932, 29042) |
| Debrief: clock, time table vs `@mm:ss`, whispers, held back, cost | debrief.sh (~250 lines, two inline node programs) | **yes** | `--prompter-debrief [LOG]`, newest log by default, built on `parseTimeMark` and the log schema the engine owns (§7) |
| Transcript per slide with talk clock, words per minute | debrief.sh `--transcript` | **yes** | `--prompter-debrief --transcript` |
| Policy replay | debrief.sh calls `--prompter-replay` | already | Stays; becomes the last section of the debrief |
| Newest log outside `old/`; test runs moved to `old/` by hand | debrief.sh, CLAUDE.md | yes (small) | Mark a dry run in the session record and the file name; debrief's default skips dry runs (§7) |
| Lint before packing | pack-talk.sh | yes | The build itself reports lint (§6) |
| Base package: engine + `node_modules` + Node for two CPUs (checksummed) + key + `Start.command` | pack-talk.sh | **no** | Policy-laden (key in clear, macOS-only, Node downloads). Stays local. Long-term the desktop app growing the prompter is the engine-shaped answer (L, see §11) |
| `--add`: small per-lecture archives, picked up by Start.command | pack-talk.sh | no | Local |
| Lecture picker over `lectures/` in Start.command | Start.command | no | Local |
| Engine-vs-lecture commit check (`.psi-talk`) | pack-talk.sh, Start.command | no | Local; would need the engine to print its own commit, which a release tarball does not have |
| Strip quarantine, pick arm64/x64/Rosetta Node | Start.command | no | Local |

What the scripts would shrink to with §3, §7 and the directory input:
rehearse.sh disappears (`./build.sh <name> --present`), debrief.sh disappears,
Start.command loses its port loop, curl loop, dry-run detection and URL
printing (roughly half of its 150 lines), build.sh loses mermaid and aliases.

## Ranked pain points

Ranked by how often the friction is felt: every save first, every talk next,
once per setup last.

### 1. A save during `--watch` loses the beat and can land on the wrong slide (every save)

**Observation.** Playwright probe against `--watch --serve --port 8792` on the
spoken-talk copy: forward six presses to `#second-time`, append a newline to
`source.md` → page reloads (1 navigation), still on `#second-time`. Then insert
one chunk before `#two-numbers` and save → the page reloads onto **`#board`**,
the slide before the one the author was on. The reason is in the code: the only
persisted position is `storageKey('activeIdx')` (20381, read in `loadPersisted`
20333–20336), an **index**, and `const revealed = {}` (20265) is never
persisted, so every reload also drops back to beat 0 of the current chunk. For
anyone tuning a stepped `::: draw` figure that is "save, press → three times,
look" per edit. The URL hash is not maintained while navigating (probe printed
`hash=` empty), so the hash-wins rule (22201) does not help either.

**Proposal.** In the watch-only `reloadScript` (7246), before `location.reload()`
stash `{chunkId, beat}` in `sessionStorage`; on boot, if present, jump to that
id and replay its beat count, then delete it. Only watch builds carry the
script, so a normal deck is untouched. Speaker follows the audience as it does
today.

**Effort S.** Replaces: nothing in the scripts – a pure engine gap, felt most
in the figure work HOUSE-STYLE pushes toward.

### 2. A broken save is invisible in the browser (every typo)

**Observation.** Same probe: writing `## bogus: Broken {#x}` to the source makes
the terminal print `[rebuild] build failed: … A \`word:\` prefix must be one of
these…`, while the open audience page shows nothing (`innerText` has neither
"failed" nor the message) and keeps the old build. `build-failed` is sent to
trusted sockets (watch section, `broadcast(…, true)`), but the only receiver is
the diagram editor's status line (`editor.mjs:8395`), which exists only while a
figure is being edited. An author whose terminal is behind the browser saves,
sees no change, and assumes the edit had no effect – the exact
stale-HTML trap CLAUDE.md warns about for engine developers, here for authors.

**Proposal.** A small fixed banner in the live views on `build-failed`, carrying
the first line of the message, cleared by the next reload. To keep it off a
projector mid-talk: show it in the cockpit always, and in the audience view only
when no cockpit is attached (the authoring case).

**Effort S–M.** Replaces: "keep an eye on the terminal".

### 3. Starting a talk or rehearsal takes a wrapper (every talk)

**Observations** (`node build.js talk/source.md --watch --serve --prompter
--prompter-dry-run`, fresh folder):

- **No cockpit URL is printed.** `runServe` lists only views that already exist
  (32790–32794), and `--watch` is not awaited before `runServe` (34429–34440),
  so on a folder with no previous build the output is
  `Serving talk on http://localhost:59512` and nothing else; the last line reads
  `Watching … (open the HTML files in Chrome)`. On a second run the list appears
  – from the *previous* build's files.
- **Random port by default** (`server.listen(wantedPort || 0, …)`, 32786). Each
  restart is a new origin, so `localStorage` – the persisted slide position, the
  theme, and the **unexported live annotations** (`storageKey('annotations')`,
  20374) – is a fresh, empty store after every restart. rehearse.sh's fixed
  8080 avoids this, apparently by accident.
- **Busy port = raw stack trace.** With a listener on 8765:
  `--watch --serve --port 8765` printed `Error: listen EADDRINUSE …` with a
  Node stack and exited 1 (not `userFacing`). Start.command's
  `while nc -z …; do PORT=$((PORT+1))` exists for this.
- **Restart with a tab open: the tab is orphaned.** The watch socket also binds
  port 0 (32215–32223) and that port is baked into the page; after a restart on
  the same `--port`, the probe saw 0 navigations and 12 `ERR_CONNECTION_REFUSED`
  console errors – the page retries the dead port every 500 ms forever. On the
  default random serve port even a manual reload fails, because the URL is gone.
- **The browser is never opened**, and nothing mentions Shift-S, which is the
  only way to switch the ear on.
- **No key:** `[prompter] disabled: no OPENROUTER_API_KEY in the environment.
  Nothing is sent; the transcript is still logged.` – no mention of
  `--prompter-dry-run`, `--env-file`, or where the key should go.
- Time to usable is not the problem: 308 ms for the 6-chunk deck.
- Ctrl-C (SIGINT) exits cleanly; the JSONL is appended line by line
  (`appendOutputFile`, souffleuse section) so nothing is lost, but there is no
  SIGINT handler (`grep "process.on('SIG"` → none) and no closing record or
  "your debrief is at … – read it with …" line.
- Two decks at once work (59530 and 59532), but only because of the random
  port that causes the persistence loss above.

**Proposal.** One mode for "give or rehearse this talk", e.g.
`node build.js <src> --present` = `--watch --serve --prompter` plus:
a **stable port per lecture** (a hash of the absolute source path into a high
range, next free one if taken, `--port` still wins); the watch socket on a
stable port too, and a server that answers a `hello` with a stale nonce by
sending `reload`, so tabs left open across a restart come back by themselves;
URLs printed **after** the initial build, cockpit first, with "Shift-S
switches the prompter on"; `--open` (implied) that opens speaker.html once the
server listens – Chrome when the prompter is on, with a one-line warning if
Chrome is missing; no key → dry run, said in one line with the fix; on SIGINT one
line naming the log and the debrief command. `EADDRINUSE` on an explicit
`--port` becomes a `userFacing` message.

Each part is also useful without `--present` (stable port and reconnect help
every `--watch --serve`), so it can land piecemeal. None of it touches the
views' `file://` contract or the source format; the security rules stay (Host
check, Origin check, nonce).

**Effort M** in total (port derivation + reconnect S, open + messages S,
`--present` wiring S). Replaces rehearse.sh entirely and the port loop, curl
loop, dry-run detection and URL block of Start.command.

### 4. Typo'd flags are silently ignored (every unfamiliar command)

**Observation.** All exit 0 and build an ordinary deck:
`--wacth --audience-only` (exit 0, `Wrote talk/audience.html`), `--serv`,
`--check-fit=true`, and `--port 8080` without `--serve`. The code says so
itself: "Nothing refuses an unknown flag in general" (comment above the
`--souffleuse` refusal, 34166). Instead, eight-plus hand-written refusals
exist for specific no-ops (`--prompter-model` without `--prompter`,
`--prompter-dry-run` without `--prompter`, every `--pdf-*` without
`--slides-pdf`, the old `--souffleuse*` names), each added after one bit.

**Proposal.** One `KNOWN_FLAGS` table (with which flags take values – the
`VALUE_FLAGS` set at 32804 is half of it already) and a refusal with a
did-you-mean (`--wacth` → `--watch`). The per-flag "X without Y" refusals stay
for their better messages. A gate can hold the table against the help text.

**Effort S.** Replaces the next hand-written no-op refusal before it is needed.

### 5. The review loop is five commands and three browser walks (every deck)

**Observation.** HOUSE-STYLE "The workflow that works" steps 10–14 are lint,
`--check-fit`, `--squint`, `--frames`, then `O` by hand, plus FRESH-EYES-REVIEW.md
carrying its own Playwright capture script (imports
`/Users/dh/Repositories/psi-slides/node_modules/playwright-core` by absolute
path) from before `--frames` existed. Timed on a copy of
`introsp/20-foundations` (42 chunks, 64 states): plain build 0.2 s,
`--check-fit` 66.4 s, `--squint` 16.5 s, `--frames` 51.5 s – 2 min 14 s in three
separate walks of the same states.

**Proposal.** `--review` = lint + build + one walk of the states that collects
fit, squint text and frames together, written to the usual three places, one
summary at the end. The three already share `openAudienceProbe`; the cost is
merging their per-state loops. Discoverability improves as a side effect: one
flag to learn instead of three described in three help paragraphs.

**Effort M.** Replaces steps 10–13 as separate commands; makes the
FRESH-EYES capture script removable.

### 6. A clean lint is not a clean build, and the build does not lint (every deck)

**Observation.** CLAUDE.md (content repo) and HOUSE-STYLE both say "Run both"
and "Always lint the specific file"; pack-talk.sh lints before packing because
the build would not. `build.js` never runs `lint.js`, and `--watch` never shows
a lint warning while writing.

**Proposal.** After a successful build, run `lint.js` on the source as a child
process (it is zero-dep and calls `main()` at module scope, so spawn rather than
import) and print its summary line, e.g. `[lint] 0 errors, 2 warnings (node
lint.js … for detail)`; under `--watch`, print it only when the count changes.
`--no-lint` to skip. Under `--events`, a `lint` event.

**Effort S.** Replaces the "run both" rule and pack-talk.sh's lint step.

### 7. The debrief lives in a bash script that tracks the engine's log format by hand (every talk)

**Observation.** debrief.sh is ~250 lines of bash with two inline Node programs
reading `prompter-*.jsonl`. It already had to follow the engine once: commit
f417024 (2026-10-13) adds `clock-set` handling after the engine began logging
it. Its mark parser `@(\d+):(\d\d)` on any line after any `{#id}` heading
diverges from the engine's `parseTimeMark` (`cue-cards.mjs:67`), which accepts
`h:mm:ss` and reads marks at the head of a note/card: `@1:02:30` would be read
as 62 s, and an `@12:30` in prose counts as a mark. `--prompter-replay` (34183)
covers only the policy rows. Two logging details make "which log is the talk"
manual (hence the `old/` convention in CLAUDE.md): the file name has minute
resolution, so two runs in one minute share a file (observed: two `session`
records in `prompter-20261016-0033.jsonl`), and the dry-run session record
carries no `dryRun` field (compared: identical but for `disabled`).

**Proposal.** `node build.js <src> --prompter-debrief [LOG]` printing the
clock, the time table against marks resolved by the engine's own note parser,
whispered / held back / cost, and the replay; `--transcript` for the spoken
words per slide. Log names get seconds and a `-dry` suffix for dry runs; the
session record gets `dryRun`; the default log is the newest non-dry one. The
`talk-debrief` skill then calls the engine instead of the script.

**Effort M.** Replaces debrief.sh and the `old/` sorting rule; removes a second
consumer of a log format the engine changes freely.

### 8. Directory input and `-h` fail with the wrong message (first contact)

**Observation.** `node build.js talk` → `Error: EISDIR: illegal operation on a
directory` with a stack trace, exit 1 (`buildOnce` readFileSync, 31842).
`node build.js -h` → `Input not found: …/-h` (flags are collected only from
tokens starting with `--`, 34123, so `flags.has('-h')` at 34217 can never be
true). `lint.js` accepts a directory; the build does not.

**Proposal.** A directory input resolves to `<dir>/source.md` (with a
`userFacing` message if absent); `-h` recognised. With directory input, the
four scripts' resolver could return a folder rather than build a path.

**Effort S.**

### 9. Help, `bin` and the first five minutes (once per user)

**Observation.** `node build.js --help` prints 101 lines **to stderr** and
**exits 1** when no input is given (`process.exit(inputPath ? 0 : 1)`); it is
fast (0.14 s). Groups are reasonable, but the first block is 15 usage lines and
`--serve` / `--port` / `--new` have no explanatory lines; the prompter block
does not mention Shift-S. There is no `bin` in package.json although both files
carry `#!/usr/bin/env node`, so the content repo's package.json hard-codes
`node ../psi-slides/build.js`. README Quickstart is clean (tarball → `npm
install` → build → open); `--new` scaffolds a lint-clean deck (`ok – 1 file(s),
0 error(s)`), but its hint says `run \`node build.js my-first/source.md
--watch\`` regardless of where `build.js` actually is, and sets no `lang:`. The
prompter section of README says "put it in the environment variable" and
nothing about how to keep the key out of shell history.

**Proposal.** Help to stdout, exit 0; a short help (ten lines: build, watch,
serve, present, review, new, lint) with `--help all` for the rest. Add
`"bin": {"psi-slides": "build.js", "psi-slides-lint": "lint.js"}` so a content
repo can `npm i -D ../psi-slides` and write `psi-slides …`. `--new` prints the
command with the real path of `build.js`.

**Effort S.**

### 10. The key (every talk on a new shell or machine)

**Observation.** The engine reads only `process.env.OPENROUTER_API_KEY`
(30658). rehearse.sh, Start.command and the engine's own memory notes all use
`node --env-file=.env`; pack-talk.sh parses the key out of the engine
checkout's `.env` with sed.

**Proposal (maybe).** Read the key, and only the key, from a user-owned file
(`~/.config/psi-slides/prompter.env`, mode checked) when the environment has
none, and say which source was used. **Do not** auto-load a `.env` beside
`source.md` or in cwd: a deck someone sent could ship one setting
`OPENROUTER_BASE_URL` and receive the deck and the room's transcript – the
`SECURITY.md` threat model applies. If this is not done, at least make the
missing-key message name `--env-file` and `--prompter-dry-run`.

**Effort S.** Replaces the `--env-file` plumbing in two scripts.

### 11. Packaging a talk for another Mac (rare, high stakes)

**Observation.** pack-talk.sh (21 KB) writes a 110 MB `psi-talk.tar.gz`
(bundles/ listing: 115,540,477 bytes) with engine, `node_modules`, Node for two
CPUs, the key in clear (`.env`, 0600) and a generated `Start.command` that is
byte-identical to the heredoc in the script (diffed). It exists because the
prompter is a Node sidecar of a watch build, and the desktop app – the
engine's no-terminal path – deliberately has no prompter (CLAUDE.md: "The
desktop app is untouched in v1").

**Proposal.** Keep it local. It carries a key-handling policy, macOS specifics
and Node downloads, none of which belong in a one-maintainer engine. What
should move in is what Start.command does *after* Node is found – §3 removes
about half of it. The engine-shaped long-term answer is the desktop app growing
the prompter (the three-things-in-one-commit list in CLAUDE.md plus the
privacy wording), which is **L** and only worth it if talks on borrowed Macs
become routine.

### 12. Smaller items

- **Watch builds stay on disk after Ctrl-C** with the reload script in them
  (`ws://127.0.0.1:59513` found in `speaker.html` after exit). Opened later
  they retry a dead port every 500 ms. Harmless, but an author who mails
  `audience.html` after authoring ships it. Low; a one-line note in the exit
  message ("rebuild without --watch before sending a view") would do.
- **`localhost` vs `127.0.0.1`.** The engine prints `http://localhost:PORT`,
  the scripts print `127.0.0.1`; both pass the Host check, but they are two
  origins with two `localStorage` stores. Print one spelling everywhere.
- **Mermaid step in build.sh** re-renders 15 committed SVGs on every build by
  default and depends on `~/r/mermaid-render-beautiful`. Drop it (or make it
  opt-in) – HOUSE-STYLE already declares Mermaid superseded.
- **Four copies of the resolver** in four scripts (build.sh `resolve_lecture`,
  rehearse.sh and debrief.sh inline, pack-talk.sh `resolve_lecture`) – one
  sourced `lib.sh` until §3/§7 retire two of them.

## Workarounds encoded in the content repo's instructions

From `psi-slides-mylectures/CLAUDE.md` and `HOUSE-STYLE.md`:

1. "Prefer linting the specific file … the messages are per source" / "Always
   lint the specific file" – lint output is not grouped usefully per file (§6).
2. "A clean lint is not a clean build … Run both" – the build does not lint (§6).
3. Steps 10–14 of "The workflow that works": four separate commands plus a
   manual `O` pass (§5).
4. FRESH-EYES-REVIEW.md ships its own Playwright capture script importing the
   engine's `node_modules` by absolute path – predates `--frames` (§5).
5. "Logs of test runs go into `old/` … never deleted" – the engine does not
   distinguish a rehearsal log from a talk log (§7).
6. "Run the dry run first" for `--optimize-images` – a reasonable habit, not a
   gap.
7. "`build.sh` still renders `.mmd` files" – a script feature kept alive by
   inertia (§12).
8. `npm run build -- …` with `../psi-slides/build.js` hard-coded – no `bin`
   (§9).
9. rehearse.sh's header: "Why --serve rather than file://: the cockpit's live
   demo hands its captured window directly … under one http origin" – the
   reason `--present` should imply `--serve`.
10. LIESMICH: "Cockpit UND Saalbild nur in Chrome öffnen" and "Beim ersten
    Shift-S fragt Chrome nach dem Mikrofon" – the engine prints neither (§3).
