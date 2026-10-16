# Security review – psi-slides engine at 3bedb93

Reviewer dimension: security. Snapshot: the scratchpad worktree at 3bedb93.
Fixtures were built under `scratchpad/work/security/` and deleted afterwards.
"CONFIRMED" means reproduced here; "PLAUSIBLE" means read from the code and not
reproduced.

The headline: the build-time chokepoints (`assetAllowed`, `safeMatter`,
`writeOutputFile`, `outputDir`, `rewriteSourceFile`) held under every bypass I
tried, and so did `--serve`'s path handling and the watch socket's
origin/nonce gate. What gets through goes **around** them: the PDF and PNG
exports hand a browser a page whose *references* the build never vets, and that
browser renders local files the build would have refused to read. In the
desktop app's export window the deck's script can even `fetch()` them.

---

## 1. Desktop "Export as PDF…": deck JavaScript reads any local file, dot-files included, and can write it into the PDF

- **Severity: high**
- **CONFIRMED** in a harness that rebuilds `electronDriver().open()`'s window
  (Electron 44.0.0, the app's own `desktop/node_modules`): a hidden
  `BrowserWindow` with `sandbox: true, contextIsolation: true,
  nodeIntegration: false`, a non-persist partition, http(s)/ws(s) cancelled in
  `webRequest`, and the view loaded from `file://`. I did not click through the
  packaged app.
- **Where:** `desktop/main/pdf.js:182` (`BLOCKED_URLS` lists only
  `http/https/ws/wss`), `:200` (the only `onBeforeRequest`), `:258`
  (`load: (url) => win.loadURL(url)`, a `file:` URL of the built view).
- **Scenario:** someone sends you a `source.md` (a student's talk, a colleague's
  deck). Its Markdown carries a `<script>` (allowed by design). You open it in
  the builder and choose Export as PDF. In the export window this runs:
  ```js
  for (let n = 1; n < 9; n++) {
    const r = await fetch('../'.repeat(n) + '.ssh/id_rsa');
    if (r.ok) { document.body.append(await r.text()); break; }
  }
  ```
  In Electron a `file://` page can `fetch()` other `file://` URLs. Chrome
  refuses the same call (verified, see #2). The script then reads the file and
  puts it in the DOM: as white 1-px text, in `document.title` (PDF metadata),
  or base64'd on a page nobody reads. `printToPDF` bakes it in. In the harness,
  `fetch('../../.ssh/id_rsa')` from the lecture folder returned the planted key,
  and `fetch('file:///etc/hosts')` returned the hosts file. The network block
  does not help: the PDF is the channel. It leaves the machine when the
  lecturer uploads the handout or sends the PDF back to the deck's author "for
  review". Nothing restricts dot-folders or extensions here – that rule lives
  in `assetEscape`, which this path never consults. Directory fetches fail in
  Electron, so the script has to guess paths, but relative climbing from the
  lecture folder (above) makes `~/.ssh/id_rsa`, `~/.aws/credentials`,
  `~/.netrc` and `.env` files one loop away.
- **SECURITY.md** § Exporting a PDF promises "Nothing reaches the network" and
  "the page cannot leave its window". Both are true, and neither covers this.
- **Fix:** confine `file:` in the export session. Register a
  `ses.protocol.handle('file', …)` (or intercept) that serves only the paths
  under the lecture folder that `assetEscape` would allow, plus the view
  itself, and fails everything else. Alternatively serve the view from a custom
  scheme (`psi-export://`) whose handler maps only the lecture folder, so
  `file:` is never the page's origin. Add a `desktop/test` case: a deck whose
  script fetches a file one level above the asset root must export a PDF
  without those bytes.
- **Effort:** M

## 2. CLI PDF exports and `--frames` render local files the build refuses to read into the PDF/PNG

- **Severity: medium**
- **CONFIRMED** (`--print-pdf` and `--frames`; `--slides-pdf` and
  `--print-notes-pdf` share the mechanism).
- **Where:** `pdf-export.mjs:74` and `:84` route only `^https?:` and `^wss?:`;
  `build.js:32852` (`openAudienceProbe`'s `page.goto(file:…)`, used by
  `--frames`) routes nothing.
- **Scenario:** in Playwright's Chromium a deck's script cannot *read* a local
  file (`fetch`/XHR/iframe DOM all refused; checked). But the page can *show*
  one, and the export photographs what is shown. A chunk containing
  `<iframe src="../../secret.txt">`, `<iframe src="file:///etc/hosts">` and
  `<iframe src="../../">` produced a `print.pdf` whose text layer
  (`pdftotext`) holds the secret file, `/etc/hosts`, and a Chrome "Index of
  /…" directory listing (absolute path with the username, file names, sizes,
  dates). The `--frames` PNG of that slide showed the same.
  `<img src="../../photo.jpg">` works the same way for pictures.
- **Fix:** `page.route` sees `file:` requests too (checked). Abort every
  `file:` request outside the asset root (`assetEscape` decides) in
  `pdf-export.mjs` and in `openAudienceProbe`. SECURITY.md:62 should also say
  that a page opened from disk can *show* local files on screen – a projector
  included.
- **Effort:** S–M

## 3. `lint.js` writes the source's control characters to the terminal

- **Severity: low–medium** · **CONFIRMED**
- **Where:** `lint.js:5297`, `:5304`. `build.js` filters its output through
  `consoleSafe` (`build.js:31778`); lint has no counterpart.
- **Scenario:** SECURITY.md:103 recommends lint as the safe first look at a
  stranger's deck. A class token carrying escape sequences clears the screen,
  prints a fake clean result and hides the real `asset-outside-root` error. The
  exit code stays 1.
- **Fix:** a copy of `consoleSafe` in `lint.js` (stays zero-dep).
- **Effort:** S

## 4. `ws` 8.20.0 carries advisories; js-yaml and katex lower

- **Severity: low–medium** · **PLAUSIBLE** (from `npm audit`, not exploited)
- `ws` 8.20.0: memory exhaustion from tiny fragments (GHSA-96hv) and a memory
  disclosure (GHSA-58qx). The watch socket accepts origin `null` before the
  nonce check, so a sandboxed iframe on any web page that finds the port reaches
  the parser. The fix is inside the existing `^8.20.0` range – a lockfile bump.
- js-yaml 3.14.2 (through gray-matter): quadratic-CPU advisories – a
  frontmatter block can stall a build. katex 0.18.0: a low advisory.
- **Effort:** S

## 5. A `source.md` directly in the home folder gets `/Users/*` as asset root

- **Severity: low** · **CONFIRMED** (HOME overridden)
- **Where:** `assetRootNarrowed` (`build.js:270`, mirrored `lint.js:511`)
  narrows only when the folder *above* the lecture is home or a disk top, never
  when the lecture folder *is* one. A picture in a neighbouring account's home
  was inlined. Dot-folders stay refused.
- **Fix:** when the lecture folder is home or a disk root, read only from
  `assets/` and warn.
- **Effort:** S

## 6. `--serve` sends no hardening headers

- **Severity: low** · **CONFIRMED** (headers missing; impact speculative)
- **Where:** `build.js:32774`. No `frame-ancestors` / `X-Frame-Options`, no
  `nosniff`, no `Cross-Origin-Resource-Policy`. Any website can frame the
  cockpit, which carries the nonce, and probe whether pictures exist. The Host
  check still blocks reads.
- **Fix:** `Content-Security-Policy: frame-ancestors 'self'`,
  `X-Content-Type-Options: nosniff`, `Cross-Origin-Resource-Policy: same-origin`.
- **Effort:** S

## Checked and fine

- `safeMatter`, including BOM / `----` / case variants; gray-matter on
  `safeLoad`.
- Every build-time asset reader goes through `assetAllowed`: images, SVG,
  diagram images, backdrop, cover and closing images, clips, `fonts/`. Lint
  mirrors it, deduplicated by real path.
- `--optimize-images` stays in the lecture folder, passes ImageMagick an
  explicit decoder; `execFileSync` with argument arrays and absolute paths.
- All output writes use temp-file-and-rename; `videos/`, `frames/`, `assets/`
  refuse links; prompter files `0o600`, log opened `O_NOFOLLOW`.
- `--serve` paths: encoded `..`, backslash, NUL, symlinks, dot-names,
  `source.md`, prompter files, Host spoofing – all refused (curl).
- Watch socket: every message but `hello` needs the nonce; `patch` is limited
  to a draw block of the last build; `asset` upload has a strict name rule and
  stays in `assets/`.
- Prompter: `redact` / `terminalSafe`, length caps and `clampSpan` bound what a
  page can send; no page message can change the model.
- Runtime: `innerHTML` sites escape; JSON into `<script>` via `jsonForScript`;
  postMessage checks origin and peer window; figure swaps sanitised; reader
  import safe; embed iframes get no camera/microphone; KaTeX `trust: false`.
- Desktop main window: CSP, `contextIsolation`, `sandbox`, no Node;
  `openExternal` takes a name, never a URL; IPC inputs validated; browsers
  spawned with absolute paths.
