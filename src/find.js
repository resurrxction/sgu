// Search helpers shared by the index and note pages.
// Terms match at word starts; Russian endings are stripped so "интегралы" finds "интегралом".

const ENDINGS =
  /(?:иями|ями|ами|ого|его|ому|ему|ыми|ими|ией|ах|ях|ам|ям|ов|ев|ей|ой|ий|ый|ая|яя|ое|ее|ые|ие|ом|ем|ую|юю|ия|ию|а|я|о|е|ы|и|у|ю|ь|й)$/;

export const norm = (s) => s.toLowerCase().replaceAll('ё', 'е');

const stem = (w) => {
  if (w.length < 4) return w;
  const s = w.replace(ENDINGS, '');
  return s.length >= 3 ? s : w;
};

export const terms = (q) => [...new Set(norm(q ?? '').split(/[^\p{L}\p{N}]+/u).filter(Boolean).map(stem))];

const cache = new Map();
const re = (t) => {
  if (!cache.has(t)) {
    const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    cache.set(t, new RegExp(`(?<![\\p{L}\\p{N}])${escaped}[\\p{L}\\p{N}]*`, 'gu'));
  }
  return cache.get(t);
};

export const matches = (text, ts) => {
  const n = norm(text);
  return ts.every((t) => n.search(re(t)) !== -1);
};

export const score = (text, ts) => {
  const n = norm(text);
  return ts.filter((t) => n.search(re(t)) !== -1).length;
};

// Sorted, non-overlapping [start, end) ranges of every match in text.
export function ranges(text, ts) {
  const n = norm(text);
  const found = [];
  for (const t of ts) for (const m of n.matchAll(re(t))) found.push([m.index, m.index + m[0].length]);
  found.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const r of found) {
    const last = merged.at(-1);
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push(r);
  }
  return merged;
}

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// Escaped HTML of text[from, to) with matches wrapped in <mark>.
export function highlight(text, ts, from = 0, to = text.length) {
  let out = '';
  let pos = from;
  for (let [a, b] of ranges(text, ts)) {
    if (b <= from || a >= to) continue;
    a = Math.max(a, pos);
    b = Math.min(b, to);
    out += esc(text.slice(pos, a)) + '<mark>' + esc(text.slice(a, b)) + '</mark>';
    pos = b;
  }
  return out + esc(text.slice(pos, to));
}

// A short excerpt around the first match, with matches highlighted.
export function snippet(text, ts, length = 180) {
  if (text.length <= length) return highlight(text, ts);
  const first = ranges(text, ts)[0];
  let start = first ? Math.max(0, first[0] - 50) : 0;
  if (start > 0) {
    const space = text.indexOf(' ', start);
    if (space !== -1 && space < (first?.[0] ?? start)) start = space + 1;
  }
  let end = Math.min(text.length, start + length);
  if (end < text.length) {
    const space = text.lastIndexOf(' ', end);
    if (space > (first?.[1] ?? start)) end = space;
  }
  return (start > 0 ? '…' : '') + highlight(text, ts, start, end) + (end < text.length ? '…' : '');
}
