// Small helpers shared by the two homework pages.

const $ = id => document.getElementById(id);
const pct = (v, digits = 1) => (100 * v).toFixed(digits) + '%';

// A minimal bar chart made of divs. `max` fixes the vertical scale; `ref` draws a dashed reference line.
function bars(el, values, labels, max, ref) {
  max = max || Math.max(...values.filter(Number.isFinite)) * 1.1;
  el.innerHTML = `<div class="relative flex items-end gap-1 h-36 border-b border-slate-300">` +
    (ref ? `<div class="absolute inset-x-0 border-t border-dashed border-slate-400" style="bottom:${100 * ref / max}%"></div>` : '') +
    values.map(v => `<div class="flex-1 bg-indigo-400 rounded-t" title="${Number.isFinite(v) ? +v.toFixed(3) : 'n/a'}" style="height:${Number.isFinite(v) ? 100 * v / max : 0}%"></div>`).join('') +
    `</div><div class="flex gap-1 text-[10px] text-slate-400 mt-1">${labels.map(l => `<div class="flex-1 text-center">${l}</div>`).join('')}</div>`;
}
