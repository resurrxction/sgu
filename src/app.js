// Index page: subject filter + full-text search with highlighted excerpts.

import { terms, matches, score, highlight, snippet } from './find.js';

const q = document.getElementById('q');
const months = [...document.querySelectorAll('#list .month')];
const buttons = [...document.querySelectorAll('#subjects button')];
const empty = document.getElementById('empty');
const found = document.getElementById('found');
const forms = JSON.parse(found.dataset.forms);
const plural = new Intl.PluralRules(document.documentElement.lang);

const items = [...document.querySelectorAll('#list li')].map((li) => {
  const row = li.querySelector('.row');
  const title = li.querySelector('.title');
  return {
    li,
    row,
    title,
    titleText: title.textContent,
    meta: row.textContent,
    href: row.getAttribute('href'),
    hits: li.querySelector('.hits'),
  };
});

let subject = '';
let data = null;
let loading = null;

// search.json: { slug: [[sectionId, heading, text], ...] }
const load = () =>
  (loading ??= fetch('search.json')
    .then((r) => r.json())
    .then((d) => {
      data = d;
      apply();
    })
    .catch(() => {}));

function hitsHtml(sections, ts, href) {
  return sections
    .map((s, i) => ({ s, i, score: score(s[1] + ' ' + s[2], ts) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, 2)
    .sort((a, b) => a.i - b.i)
    .map(({ s: [id, heading, text] }) => {
      const label = heading ? `<span class="hit-h">${highlight(heading, ts)}</span>` : '';
      return `<a class="hit" href="${href}${id ? '#' + encodeURIComponent(id) : ''}">${label}${snippet(text, ts)}</a>`;
    })
    .join('');
}

function apply() {
  const raw = q.value.trim();
  const ts = terms(raw);
  const qs = ts.length ? '?q=' + encodeURIComponent(raw) : '';
  let shown = 0;

  for (const it of items) {
    const sections = data?.[it.li.dataset.slug] ?? [];
    const full = it.meta + ' ' + sections.map((s) => s[1] + ' ' + s[2]).join(' ');
    const ok = (!subject || it.li.dataset.subject === subject) && matches(full, ts);
    it.li.hidden = !ok;
    if (!ok) continue;
    shown++;
    it.row.href = it.href + qs;
    it.title.innerHTML = highlight(it.titleText, ts);
    it.hits.innerHTML = ts.length ? hitsHtml(sections, ts, it.href + qs) : '';
  }

  for (const m of months) m.hidden = !m.querySelector('li:not([hidden])');
  empty.hidden = shown > 0;
  found.hidden = !ts.length || !shown;
  found.textContent = `${found.dataset.prefix} ${shown} ${forms[plural.select(shown)] ?? forms.other}`;

  const params = raw ? '?' + new URLSearchParams({ q: raw }) : '';
  history.replaceState(null, '', location.pathname + params + (subject ? '#' + encodeURIComponent(subject) : ''));
}

function setSubject(s) {
  subject = buttons.some((b) => b.dataset.s === s) ? s : '';
  for (const b of buttons) b.setAttribute('aria-pressed', String(b.dataset.s === subject));
  apply();
}

for (const b of buttons) b.addEventListener('click', () => setSubject(b.dataset.s === subject ? '' : b.dataset.s));

q.addEventListener('focus', load);
q.addEventListener('input', () => {
  load();
  apply();
});
q.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const first = items.find((it) => !it.li.hidden);
    if (first) location.href = first.row.href;
  } else if (e.key === 'Escape') {
    q.value = '';
    apply();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === '/' && document.activeElement !== q) {
    e.preventDefault();
    q.focus();
  }
});

q.value = new URLSearchParams(location.search).get('q') ?? '';
if (q.value) load();
setSubject(decodeURIComponent(location.hash.slice(1)));
