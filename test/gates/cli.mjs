/*
 * The command line's flag table, held against what main() reads and against
 * CLAUDE.md's commands block.
 *
 * build.js refuses a flag that is not in CLI_FLAGS, with the nearest name.
 * Before the table, an unknown flag built an ordinary deck and exited 0 –
 * `--wacth`, `--check-fitt`, `--check-fit=true` – and the eight specific
 * refusals main() carries were each written after one such no-op had cost
 * somebody a rehearsal. The table moves the failure the other way: a flag that
 * main() reads and the table lacks is now refused as unknown, so a new flag
 * added without its row fails on first use. This gate makes it fail here
 * first, by reading main()'s own literals, and it holds the two documents
 * that list the flags – the --help text is generated from the rows, so only
 * CLAUDE.md can fall behind.
 *
 * Read as text, like the frontmatter gate: build.js cannot be imported here.
 * The two constants between the `cli-flags:` markers are plain literals for
 * that reason.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './harness.mjs';

export const name = 'cli: one flag table, read by main(), listed in CLAUDE.md';

function loadTable(src) {
  const a = src.indexOf('// cli-flags:start');
  const b = src.indexOf('// cli-flags:end');
  if (a < 0 || b < a) return null;
  // eslint-disable-next-line no-new-func
  return new Function(src.slice(a, b) + '\nreturn { CLI_GROUPS, CLI_FLAGS };')();
}

export async function run({ report }) {
  const src = fs.readFileSync(path.join(ROOT, 'build.js'), 'utf8');
  const table = loadTable(src);
  if (!report.ok(!!table, 'build.js carries the table between its cli-flags markers')) return;
  const { CLI_GROUPS, CLI_FLAGS } = table;
  const names = CLI_FLAGS.map(f => f.name);
  const known = new Set(names);
  const groups = new Set(CLI_GROUPS.map(g => g.id));

  const dup = names.filter((n, i) => names.indexOf(n) !== i);
  report.ok(!dup.length, 'no flag has two rows', dup.join(', '));
  report.ok(names.every(n => /^--[a-z][a-z0-9-]*$/.test(n)), 'every name is --lower-case');
  const badValue = CLI_FLAGS.filter(f => f.value !== undefined
    && !['next', 'optional', 'equals'].includes(f.value)).map(f => f.name);
  report.ok(!badValue.length, 'every value kind is next, optional or equals', badValue.join(', '));
  const noNeed = CLI_FLAGS.filter(f => f.value === 'next' && !f.need).map(f => f.name);
  report.ok(!noNeed.length, 'a flag whose value is the next word says what the value is (need)',
    noNeed.join(', '));
  const dangling = [];
  for (const f of CLI_FLAGS) {
    for (const key of ['needs', 'takes', 'notWith']) {
      for (const n of f[key] || []) if (!known.has(n)) dangling.push(`${f.name}.${key}: ${n}`);
    }
  }
  report.ok(!dangling.length, 'needs, takes and notWith name flags of the table', dangling.join(', '));
  const noWhy = CLI_FLAGS.filter(f => f.needs && !f.why).map(f => f.name);
  report.ok(!noWhy.length, 'a flag refused without its partner says why (why)', noWhy.join(', '));
  const modeless = CLI_FLAGS.filter(f => (f.mode && (!f.takes || !f.does))
    || (f.notWith && !f.does)).map(f => f.name);
  report.ok(!modeless.length, 'a mode lists its company and says what it does instead',
    modeless.join(', '));
  const noGroup = CLI_FLAGS.filter(f => !groups.has(f.group)).map(f => f.name);
  report.ok(!noGroup.length, 'every flag sits in a --help group', noGroup.join(', '));
  const emptyGroup = CLI_GROUPS.filter(g => !CLI_FLAGS.some(f => f.group === g.id && !f.hidden))
    .map(g => g.id);
  report.ok(!emptyGroup.length, 'every --help group lists a flag', emptyGroup.join(', '));
  const undocumented = CLI_FLAGS.filter(f => !f.hidden && !f.doc).map(f => f.name);
  report.ok(!undocumented.length, 'every flag that is not hidden has a --help row',
    undocumented.join(', '));

  // What main() and its helpers read, in every spelling they read it. The
  // table's own text is cut out first, or every name would read itself.
  const a = src.indexOf('// cli-flags:start');
  const b = src.indexOf('// cli-flags:end');
  const rest = src.slice(0, a) + src.slice(b);
  const reads = new Set();
  const patterns = [
    /\bflags\.has\('(--[a-z0-9-]+)'\)/g,
    /\bvalues\.(?:get|has)\('(--[a-z0-9-]+)'\)/g,
    /\bargv\.(?:indexOf|includes)\('(--[a-z0-9-]+)'\)/g,
    /\bpdfFlag(?:Value|Given)\(argv, '(--[a-z0-9-]+)'\)/g,
    /\{ flag: '(--[a-z0-9-]+)'/g,
  ];
  for (const re of patterns) for (const m of rest.matchAll(re)) reads.add(m[1]);
  // Two lists are read through a filter rather than one name at a time.
  const onlyOpts = /const onlyFlags =\s*\[([^\]]*)\]/.exec(rest);
  report.ok(!!onlyOpts, 'the --*-only list is found where main() reads it');
  if (onlyOpts) for (const m of onlyOpts[1].matchAll(/'(--[a-z0-9-]+)'/g)) reads.add(m[1]);
  const slideOpts = /const SLIDE_PDF_OPTIONS = \[([^\]]*)\]/.exec(rest);
  report.ok(!!slideOpts, 'SLIDE_PDF_OPTIONS is found where the PDF export reads it');
  if (slideOpts) for (const m of slideOpts[1].matchAll(/'(--[a-z0-9-]+)'/g)) reads.add(m[1]);
  report.ok(reads.size >= 30, `the scan finds what main() reads (${reads.size} names)`);
  const missing = [...reads].filter(n => !known.has(n));
  report.ok(!missing.length, 'every flag main() reads has a row – without one it is refused as unknown',
    missing.join(', '));
  const dead = names.filter(n => !reads.has(n));
  report.ok(!dead.length, 'every row is a flag main() reads', dead.join(', '));

  // CLAUDE.md's commands block: the fenced bash block under "## Commands".
  const claude = fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8');
  const head = claude.indexOf('## Commands');
  const open = claude.indexOf('```bash', head);
  const close = claude.indexOf('\n```', open + 7);
  const block = head >= 0 && open >= 0 && close > open ? claude.slice(open, close) : '';
  report.ok(!!block, 'CLAUDE.md has a commands block');
  const unlisted = CLI_FLAGS.filter(f => !f.hidden
    && !new RegExp(f.name.replace(/[-]/g, '\\-') + '(?![a-z0-9-])').test(block)).map(f => f.name);
  report.ok(!unlisted.length, 'CLAUDE.md\'s commands block names every flag that is not hidden',
    unlisted.join(', '));
  report.ok(/(?<![a-z-])-h\b/.test(block), 'and -h, the one short spelling');
}
