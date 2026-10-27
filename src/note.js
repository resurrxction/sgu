// Note page: highlight ?q= matches and step through them.

import { terms, ranges } from './find.js';

const raw = new URLSearchParams(location.search).get('q')?.trim();
const ts = terms(raw);
const bar = document.getElementById('findbar');
const article = document.querySelector('article');

function mark() {
  const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  for (const node of nodes) {
    const r = ranges(node.data, ts);
    if (!r.length) continue;
    const frag = document.createDocumentFragment();
    let pos = 0;
    for (const [a, b] of r) {
      const m = document.createElement('mark');
      m.className = 'match';
      m.textContent = node.data.slice(a, b);
      frag.append(node.data.slice(pos, a), m);
      pos = b;
    }
    frag.append(node.data.slice(pos));
    node.replaceWith(frag);
  }
  return [...article.querySelectorAll('mark.match')];
}

const marks = ts.length ? mark() : [];

if (marks.length) {
  const count = bar.querySelector('.find-n');
  let cur = -1;

  const go = (i, smooth = true) => {
    marks[cur]?.classList.remove('current');
    cur = (i + marks.length) % marks.length;
    marks[cur].classList.add('current');
    marks[cur].scrollIntoView({ block: 'center', behavior: smooth ? 'smooth' : 'instant' });
    count.textContent = `${cur + 1} / ${marks.length}`;
  };

  const close = () => {
    for (const m of marks) m.replaceWith(m.textContent);
    article.normalize();
    bar.hidden = true;
    history.replaceState(null, '', location.pathname + location.hash);
  };

  bar.querySelector('.find-q').textContent = raw;
  bar.hidden = false;

  // Start at the section the search result pointed to, if any.
  const target = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
  const start = target ? marks.findIndex((m) => target.compareDocumentPosition(m) & Node.DOCUMENT_POSITION_FOLLOWING) : 0;
  go(Math.max(start, 0), false);

  bar.addEventListener('click', (e) => {
    const act = e.target.closest('button')?.dataset.act;
    if (act === 'next') go(cur + 1);
    else if (act === 'prev') go(cur - 1);
    else if (act === 'close') close();
  });

  document.addEventListener('keydown', (e) => {
    if (bar.hidden) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'Enter' && document.activeElement === document.body) {
      e.preventDefault();
      go(e.shiftKey ? cur - 1 : cur + 1);
    }
  });
}
