/*
 * Every rule that reads var(--zoom) sits on a slide.
 *
 * The auto-fit walk (fitZoomToChunk, clampZoomToWidth, psiExport.fitMeasure)
 * writes its trial zooms on the one chunk it is measuring, not on <html>,
 * because a change on <html> restyles and relays every element of every slide
 * - about 90 ms a step on lectures/diagrams, and a walk takes up to twenty
 * steps. That is only exact while every reader of the property is inside the
 * chunk. A rule outside it - a foot band, the viewport's padding, a piece of
 * chrome sized in calc(... * var(--zoom)) - would be measured at the old zoom
 * during the walk and change only when the result is committed, and if the
 * chunk's room depends on it the fit converges on a zoom that overflows.
 * Nothing throws: the slide is cut off in the hall.
 *
 * So every selector of such a rule must either name a chunk class (.chunk or
 * .chunk-...), or have its subject on the reviewed list below: classes the
 * renderers only ever emit inside a chunk article. A new rule outside both
 * fails here and names itself; the answer is either to put it on a chunk or
 * to write a different fit.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './harness.mjs';

export const name = 'every rule reading var(--zoom) sits on a slide';

// Subject class -> where the renderer emits it. Reviewed by hand.
const IN_CHUNK = {
  'tag-label':    'the expansion label, inside .chunk',
  'overlay-card': 'a card of ::: overlay, inside the chunk\'s .overlay-layer',
  'dock':         '::: dock, a child of the chunk',
  'margin-note':  '::: footnote, lifted into .chunk-content',
  'annot-box':    'the live annotation box, inside the chunk',
  'annot-add':    'the + note button, a child of the chunk',
  'exp-chev':     'a ::: expand chevron, inside the chunk\'s .exps',
};

// The selector of every leaf block whose declarations read var(--zoom), per
// CSS literal in build.js. Comments are dropped first; @media and @supports
// wrappers are not leaves and never carry the property themselves.
export function zoomSelectors(src) {
  const out = [];
  for (const m of src.matchAll(/^const ([A-Z_0-9]*CSS[A-Z_0-9]*)\s*=\s*`([\s\S]*?)^`;/gm)) {
    const css = m[2].replace(/\/\*[\s\S]*?\*\//g, '');
    const stack = [];
    let start = 0;
    for (let k = 0; k < css.length; k++) {
      if (css[k] === '{') { stack.push(css.slice(start, k).trim()); start = k + 1; }
      else if (css[k] === '}') {
        const body = css.slice(start, k), sel = stack.pop();
        if (body.includes('var(--zoom') && !body.includes('{')) {
          for (const one of sel.split(',')) out.push({ literal: m[1], selector: one.replace(/\s+/g, ' ').trim() });
        }
        start = k + 1;
      }
    }
  }
  return out;
}

function onSlide(selector) {
  if (/\.chunk(?![\w-])|\.chunk-[\w-]+/.test(selector)) return true;
  const last = selector.split(/[\s>+~]+/).filter(Boolean).pop() || '';
  const cls = /^\.([\w-]+)/.exec(last);
  return !!(cls && IN_CHUNK[cls[1]]);
}

export async function run({ report }) {
  const { ok, note } = report;
  const src = fs.readFileSync(path.join(ROOT, 'build.js'), 'utf8');
  const found = zoomSelectors(src);
  ok(found.length > 20, 'the CSS literals still hold the rules that read var(--zoom)', String(found.length));
  note(found.length + ' selector(s) read var(--zoom)');
  const off = found.filter(f => !onSlide(f.selector));
  ok(off.length === 0,
    'every one sits on .chunk or on a class the renderers only emit inside a chunk - the fit measures on the chunk',
    off.map(f => `${f.literal}: ${f.selector}`).join('\n           '));
  const unused = Object.keys(IN_CHUNK).filter(c => !found.some(f => new RegExp('\\.' + c + '(?![\\w-])').test(f.selector)));
  ok(unused.length === 0, 'every class on the reviewed list still has a rule reading var(--zoom)', unused.join(', '));

  // The gate must be able to fail.
  ok(!onSlide('body .foot-band') && !onSlide('#psiINT-viewport'), 'a rule outside a chunk is caught');
}
