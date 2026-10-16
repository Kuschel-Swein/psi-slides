/*
 * local-files.mjs – which files on this machine a lecture may reach.
 *
 * One rule, asked in four places: the build reading a picture, a clip or a
 * face (`assetEscape`, through build.js's `assetAllowed`); `--serve`
 * answering a request (`servePathAllowed`); and a browser the engine drives
 * over a page opened from disk – the three PDF exports and the three probes
 * (`fileUrlAllowed`). The last is the reason this is a file of its own: the
 * desktop app prints the PDFs in Electron's own Chromium, in its main
 * process, and has to refuse the same `file:` requests the command line
 * refuses, so the rule has to be something both can load. build.js cannot
 * be imported for it – it runs main() at module scope and pulls in the
 * Markdown stack – so the rule moved here, and build.js imports it.
 *
 * Node-only and zero-dependency: node:fs, node:path, node:os and node:url,
 * nothing from node_modules, so the desktop's main process loads it from the
 * staged engine without the engine's dependencies. lint.js keeps a mirror of
 * the asset half (it imports nothing it does not have to), and
 * test/gates/untrusted.mjs holds the two equal on a real tree with real links.
 *
 * The decisions, in the order they bite:
 *
 *  - An asset is read from the lecture's folder or the folder one level up,
 *    after links are resolved, because lectures side by side share a
 *    picture folder (`../shared/logo.png`). Never through a folder whose
 *    name starts with a dot, and a link only to a file of the kind its name
 *    says.
 *  - When the folder above is the home folder or the top of a disk, one
 *    level up would be everything the person owns, so the root is the
 *    lecture's folder alone.
 *  - When the lecture's folder *is* the home folder or the top of a disk,
 *    the lecture's folder alone is the same everything, so only its
 *    `assets/` and `fonts/` are read – the two places a deck keeps what the
 *    build reads – and build.js says so once.
 *  - A page opened from disk may load what `--serve` would answer for the
 *    same lecture, and nothing else: a page can *show* a local file it
 *    cannot read – an iframe of `../../secret.txt`, a directory listing with
 *    the user's name in it – and a PDF or a PNG made from that page carries
 *    what it showed.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

// Whether `p` is `root` or somewhere below it. On path.relative rather than a
// string prefix, so /lectures-old is not inside /lectures.
export function pathWithin(root, p) {
  const rel = path.relative(root, p);
  return rel === '' || (rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel));
}

// realpath for a path that may not exist yet: the deepest part of it that
// does is resolved, and the rest is appended as written.
export function realpathLoose(p) {
  const abs = path.resolve(p);
  try { return fs.realpathSync(abs); }
  catch (e) {
    const parent = path.dirname(abs);
    if (parent === abs) return abs;
    return path.join(realpathLoose(parent), path.basename(abs));
  }
}

// The folder a lecture may read assets from: the one above the lecture's
// own, taken after links are resolved - above where the folder really is,
// not above the name it was reached by. A lecture folder reached through a
// link therefore reads its own files and its real parent's, and a `../`
// written against the link's parent is refused (the build resolves `..`
// lexically, so that would be a third folder). When the folder above is the
// home folder or the top of a disk - or the lecture's folder is one of them
// itself - the root is the lecture's folder alone: a deck unpacked at
// ~/talk would otherwise read ~/anything, and one at ~ every account's home.
// `home` is a parameter so the untrusted gate can say where home is.
export function assetRootOf(sourceDir, home = os.homedir()) {
  const own = realpathLoose(sourceDir);
  const parent = path.dirname(own);
  if (assetRootNarrowed(own, home)) return own;
  return parent;
}

// True when "one level up" would be everything the person owns: the folder
// above the lecture is the home folder or the top of a disk, or the lecture's
// folder is one of the two itself.
export function assetRootNarrowed(own, home = os.homedir()) {
  const parent = path.dirname(own);
  const realHome = realpathLoose(home);
  return parent === own || parent === path.parse(parent).root || parent === realHome || own === realHome;
}

// True when the lecture's folder is the home folder or the top of a disk, so
// that even the lecture's folder alone is everything: only EXPOSED_FOLDERS
// below it are read.
export function assetRootExposed(own, home = os.homedir()) {
  return path.dirname(own) === own || own === realpathLoose(home);
}
export const EXPOSED_FOLDERS = ['assets', 'fonts'];

// What a file is for, by its extension: a picture, a clip or a face, or
// null for anything else. Its own table rather than IMG_EXTS / VIDEO_EXTS /
// FONT_EXTS, so the untrusted gate can hold it to those three lists and to
// lint.js's copy.
export function assetKindOf(p) {
  const ext = path.extname(String(p)).slice(1).toLowerCase();
  if (['svg', 'png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return 'image';
  if (['mp4', 'webm', 'm4v', 'mov'].includes(ext)) return 'video';
  if (['woff2', 'woff', 'ttf', 'otf'].includes(ext)) return 'font';
  return null;
}

// Where `abs` really lands when the build may not read it, or null when it
// may: outside the asset root, inside it below a folder whose name starts
// with a dot (.ssh, .git, .config, .env ...), outside assets/ and fonts/ when
// the lecture's folder is the home folder or a disk's top, or a link whose
// target is not the kind of file its name says - `assets/pic.png ->
// ../contract.pdf` would otherwise be inlined as a picture of a PDF, bytes
// and all. A link counts as the file it points to.
export function assetEscape(abs, sourceDir, home = os.homedir()) {
  const real = realpathLoose(abs);
  const root = assetRootOf(sourceDir, home);
  if (!pathWithin(root, real)) return real;
  const rel = path.relative(root, real);
  if (rel && rel.split(path.sep).some(c => c.startsWith('.'))) return real;
  if (assetRootExposed(root, home)) {
    const parts = rel.split(path.sep);
    if (parts.length < 2 || !EXPOSED_FOLDERS.includes(parts[0])) return real;
  }
  // Only where the name and the file it lands on disagree about the
  // extension: a folder on the way being a link (/tmp on macOS) is not this.
  const named = path.resolve(abs);
  if (path.extname(real).toLowerCase() !== path.extname(named).toLowerCase()) {
    const want = assetKindOf(named);
    const got = assetKindOf(real);
    if (!got || (want && got !== want)) return real;
  }
  return null;
}

// ── what a page opened from the lecture may load ────────────────────
//
// The kinds of file the four views ask for: the views themselves, pictures,
// clips, faces, a PDF a slide links to. --serve answers these and nothing
// else, and a page the engine opens from disk may load these and nothing
// else.
export const SERVE_MIME = {
  html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg',
  jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm',
  mov: 'video/quicktime', woff2: 'font/woff2', woff: 'font/woff',
  ttf: 'font/ttf', otf: 'font/otf', pdf: 'application/pdf',
};

// The four views by name, and the folders a lecture whose folder is the home
// folder or a disk's top may still be loaded from: what the build reads
// (EXPOSED_FOLDERS) and videos/, where it stages a clip too large to inline.
export const VIEW_FILES = ['audience.html', 'speaker.html', 'print.html', 'print-notes.html'];
const EXPOSED_PAGE_FOLDERS = [...EXPOSED_FOLDERS, 'videos'];

// Whether a path below the lecture's folder may be answered: a kind the
// table knows, nothing below a dot-name, and not the prompter's files - the
// room's words rather than the deck. `exposed` (the lecture's folder is the
// home folder or a disk's top) narrows that to the four views and the
// folders above.
export function servePathAllowed(rel, exposed = false) {
  const parts = String(rel).split(/[\\/]+/).filter(Boolean);
  if (!parts.length) return false;
  if (parts.some(p => p.startsWith('.'))) return false;
  const leaf = parts[parts.length - 1];
  if (/^(?:prompter|souffleuse)-/i.test(leaf)) return false;
  if (exposed && !(parts.length === 1 ? VIEW_FILES.includes(leaf) : EXPOSED_PAGE_FOLDERS.includes(parts[0]))) {
    return false;
  }
  return Object.prototype.hasOwnProperty.call(SERVE_MIME, path.extname(leaf).slice(1).toLowerCase());
}

// Whether a page opened from the lecture's folder may load the local file
// `abs`: what --serve would answer for the same lecture. A file in the
// lecture's folder as servePathAllowed says, judged where it really is; one
// further out only when the build itself may read it as a picture, a clip
// or a face (the one-level-up rule). Never a folder - Chromium draws one as
// a listing of its names, under the user's name - and never a file that is
// not there.
export function pageFileAllowed(abs, sourceDir, home = os.homedir()) {
  let real;
  try {
    real = fs.realpathSync(abs);
    if (!fs.statSync(real).isFile()) return false;
  } catch { return false; }
  const own = realpathLoose(sourceDir);
  if (pathWithin(own, real)) return servePathAllowed(path.relative(own, real), assetRootExposed(own, home));
  return !!assetKindOf(abs) && !!assetKindOf(real) && assetEscape(abs, sourceDir, home) === null;
}

// The same for a URL, as a browser hands one to a request handler. Anything
// that is not a file: URL is not this rule's to judge and is refused here;
// the network has its own refusal in each driver.
export function fileUrlAllowed(url, sourceDir, home = os.homedir()) {
  let abs;
  try {
    const u = new URL(String(url));
    if (u.protocol !== 'file:') return false;
    abs = fileURLToPath(u);
  } catch { return false; }
  return pageFileAllowed(abs, sourceDir, home);
}
