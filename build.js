// Builds notes/*.md into a static site in dist/.
//   node build.js          build once
//   node build.js --serve  build, watch for changes, serve on http://localhost:4000

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { marked } from 'marked';

const ROOT = import.meta.dirname;
const NOTES = path.join(ROOT, 'notes');
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'dist');

const STRINGS = {
  ru: {
    all: 'все',
    search: 'поиск по конспектам',
    back: '← все конспекты',
    older: '← раньше',
    newer: 'позже →',
    empty: 'ничего не найдено',
    found: 'найдено',
    prevMatch: 'предыдущее совпадение',
    nextMatch: 'следующее совпадение',
    clearMatches: 'убрать подсветку',
    download: 'скачать офлайн-копию',
    toTop: '↑ к содержанию',
    count: { one: 'конспект', few: 'конспекта', many: 'конспектов', other: 'конспекта' },
  },
  en: {
    all: 'all',
    search: 'search notes',
    back: '← all notes',
    older: '← older',
    newer: 'newer →',
    empty: 'nothing found',
    found: 'found',
    prevMatch: 'previous match',
    nextMatch: 'next match',
    clearMatches: 'clear highlight',
    download: 'download offline copy',
    toTop: '↑ contents',
    count: { one: 'note', other: 'notes' },
  },
};

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const decode = (s) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|nbsp);/gi, (_, e) => {
    if (e[0] !== '#') return { amp: '&', lt: '<', gt: '>', quot: '"', nbsp: ' ' }[e.toLowerCase()];
    return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
  });

const toText = (html) =>
  decode(html.replace(/<\/?(?:p|li|ul|ol|h\d|blockquote|pre|table|tr|td|th|br|hr|div)\b[^>]*>/gi, ' ').replace(/<[^>]+>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();

// Headings get ids so search results can link straight to a section.
let headingIds = new Set();
marked.use({
  renderer: {
    heading({ tokens, depth, text }) {
      const base =
        text
          .toLowerCase()
          .replace(/[^\p{L}\p{N}]+/gu, '-')
          .replace(/^-+|-+$/g, '') || 'section';
      let id = base;
      for (let i = 2; headingIds.has(id); i++) id = `${base}-${i}`;
      headingIds.add(id);
      return `<h${depth} id="${id}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
    },
  },
});

// Splits rendered HTML into [id, heading, text] per h2–h4 section, for search.
function sectionsOf(html) {
  const parts = html.split(/<h([2-4]) id="([^"]*)">([\s\S]*?)<\/h\1>/);
  const sections = [['', '', toText(parts[0])]];
  for (let i = 1; i < parts.length; i += 4) sections.push([parts[i + 1], toText(parts[i + 2]), toText(parts[i + 3])]);
  return sections.filter(([id, h, t]) => id || h || t);
}

function parseNote(file) {
  const slug = path.basename(file, '.md');
  const raw = fs.readFileSync(file, 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n');
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) throw new Error(`${slug}.md: missing frontmatter`);

  const meta = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^(["'])(.*)\1$/, '$2');
  }
  for (const key of ['title', 'date', 'subject']) {
    if (!meta[key]) throw new Error(`${slug}.md: missing "${key}"`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meta.date)) throw new Error(`${slug}.md: date must be YYYY-MM-DD`);

  headingIds = new Set();
  const html = marked.parse(raw.slice(m[0].length));
  return { slug, ...meta, html, sections: sectionsOf(html) };
}

const OFFLINE_FILE = 'offline.html';

function layout({ lang, title, description, base, body, css }) {
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#000000">
<title>${esc(title)}</title>
${description ? `<meta name="description" content="${esc(description)}">` : ''}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:ital,wght@0,400;0,500;0,600;1,400&display=swap">
${css ? `<style>\n${css}</style>` : `<link rel="stylesheet" href="${base}style.css">`}
</head>
<body>
${body}
</body>
</html>
`;
}

function build() {
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));
  const lang = config.lang in STRINGS ? config.lang : 'ru';
  const t = STRINGS[lang];

  const dateFmt = (opts) => {
    const f = new Intl.DateTimeFormat(lang, { timeZone: 'UTC', ...opts });
    return (d) => f.format(new Date(`${d}T00:00:00Z`)).replace(/\s?г\.$/, '');
  };
  const fullDate = dateFmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const rowDate = dateFmt({ weekday: 'short', day: 'numeric', month: 'short' });
  const tinyDate = dateFmt({ day: '2-digit', month: '2-digit' });
  const monthName = dateFmt({ month: 'long' });
  const plural = new Intl.PluralRules(lang);
  const countLabel = (n) => `${n} ${t.count[plural.select(n)] ?? t.count.other}`;
  const searchIcon =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>';

  const notes = fs
    .readdirSync(NOTES)
    .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
    .map((f) => parseNote(path.join(NOTES, f)))
    .sort((a, b) => b.date.localeCompare(a.date) || b.slug.localeCompare(a.slug));

  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  for (const f of fs.readdirSync(SRC)) fs.copyFileSync(path.join(SRC, f), path.join(OUT, f));

  // Index
  const subjects = [...new Set(notes.map((n) => n.subject))].sort((a, b) => a.localeCompare(b, lang));
  const months = Map.groupBy(notes, (n) => n.date.slice(0, 7));

  const list = [...months]
    .map(([month, items]) => {
      const rows = items
        .map(
          (n) => `<li data-subject="${esc(n.subject)}" data-slug="${esc(n.slug)}"><a class="row" href="n/${esc(n.slug)}/">
<span class="row-main"><span class="title">${esc(n.title)}</span><span class="sub">${esc(n.subject)}</span></span>
<time datetime="${n.date}">${esc(rowDate(n.date))}</time>
</a><div class="hits"></div></li>`,
        )
        .join('\n');
      return `<section class="month">
<h2>${esc(monthName(month + '-01'))} ${month.slice(0, 4)}</h2>
<ol class="group">
${rows}
</ol>
</section>`;
    })
    .join('\n');

  const subjectButton = (value, label, count) =>
    `<button type="button" data-s="${esc(value)}" aria-pressed="${value === ''}"><span>${esc(label)}</span><span class="n">${count}</span></button>`;

  const indexBody = `<div class="page">
<aside class="side">
<header class="side-head">
<p class="muted">${countLabel(notes.length)}</p>
<h1><a href="./">${esc(config.title)}</a></h1>
</header>
<nav class="subnav subjects" id="subjects">
${subjectButton('', t.all, notes.length)}
${subjects.map((s) => subjectButton(s, s, notes.filter((n) => n.subject === s).length)).join('\n')}
</nav>
<a class="download" href="${OFFLINE_FILE}" download="${esc(config.title)}.html">${t.download}</a>
</aside>
<main class="content">
<label class="search">${searchIcon}<input type="search" id="q" placeholder="${t.search}" aria-label="${t.search}" autocomplete="off" spellcheck="false"></label>
<p id="found" class="found muted" data-prefix="${t.found}" data-forms="${esc(JSON.stringify(t.count))}" hidden></p>
<div id="list">
${list}
</div>
<p id="empty" class="muted" hidden>${t.empty}</p>
</main>
</div>
<script type="module" src="app.js"></script>`;

  fs.writeFileSync(
    path.join(OUT, 'index.html'),
    layout({ lang, title: config.title, description: config.description, base: '', body: indexBody }),
  );

  // Note pages
  for (const n of notes) {
    const same = notes.filter((x) => x.subject === n.subject);
    const i = same.indexOf(n);
    const older = same[i + 1];
    const newer = same[i - 1];
    const pagerLink = (x, label, cls) =>
      x ? `<a class="${cls}" href="../${esc(x.slug)}/"><span class="muted">${label}</span>${esc(x.title)}</a>` : '<span></span>';

    const lectures = same
      .map(
        (x) =>
          `<a href="../${esc(x.slug)}/"${x === n ? ' aria-current="page"' : ''}><span class="d">${esc(tinyDate(x.date))}</span><span class="t">${esc(x.title)}</span></a>`,
      )
      .join('\n');

    const body = `<div class="page">
<aside class="side">
<a class="back" href="../../">${t.back}</a>
<header class="side-head">
<p class="muted">${countLabel(same.length)}</p>
<h2><a href="../../#${encodeURIComponent(n.subject)}">${esc(n.subject)}</a></h2>
</header>
<nav class="subnav lectures">
${lectures}
</nav>
</aside>
<main class="content">
<article>
<header class="note-head">
<p class="muted"><time datetime="${n.date}">${esc(fullDate(n.date))}</time></p>
<h1>${esc(n.title)}</h1>
</header>
<div class="prose">
${n.html}
</div>
</article>
<nav class="pager">
${pagerLink(older, t.older, 'older')}
${pagerLink(newer, t.newer, 'newer')}
</nav>
</main>
</div>
<div class="findbar" id="findbar" hidden>
<span class="find-q"></span><span class="find-n"></span>
<button type="button" data-act="prev" aria-label="${t.prevMatch}"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg></button>
<button type="button" data-act="next" aria-label="${t.nextMatch}"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>
<button type="button" data-act="close" aria-label="${t.clearMatches}"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
</div>
<script type="module" src="../../note.js"></script>`;

    const dir = path.join(OUT, 'n', n.slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'index.html'),
      layout({ lang, title: `${n.title} — ${config.title}`, description: `${n.subject}, ${fullDate(n.date)}`, base: '../../', body }),
    );
  }

  // Offline copy: every note in one file with inlined CSS and no scripts, so it opens from disk
  const toc = subjects
    .map((s) => {
      const links = notes
        .filter((n) => n.subject === s)
        .map(
          (n) =>
            `<a href="#${esc(n.slug)}"><span class="d">${esc(tinyDate(n.date))}</span><span class="t">${esc(n.title)}</span></a>`,
        )
        .join('\n');
      return `<h2 class="toc-h">${esc(s)}</h2>\n<nav class="subnav lectures toc">\n${links}\n</nav>`;
    })
    .join('\n');

  const articles = subjects
    .flatMap((s) => notes.filter((n) => n.subject === s))
    .map(
      (n) => `<article class="offline-note" id="${esc(n.slug)}">
<header class="note-head">
<p class="muted">${esc(n.subject)} · <time datetime="${n.date}">${esc(fullDate(n.date))}</time></p>
<h1>${esc(n.title)}</h1>
</header>
<div class="prose">
${n.html.replace(/<h([2-4]) id="/g, `<h$1 id="${n.slug}-`)}
</div>
<a class="back" href="#top">${t.toTop}</a>
</article>`,
    )
    .join('\n');

  const offlineBody = `<div class="page" id="top">
<aside class="side">
<header class="side-head">
<p class="muted">${countLabel(notes.length)}</p>
<h1>${esc(config.title)}</h1>
</header>
${toc}
</aside>
<main class="content">
${articles}
</main>
</div>`;

  fs.writeFileSync(
    path.join(OUT, OFFLINE_FILE),
    layout({
      lang,
      title: config.title,
      description: config.description,
      body: offlineBody,
      css: fs.readFileSync(path.join(SRC, 'style.css'), 'utf8'),
    }),
  );

  // Full-text search data by section, loaded by app.js on first search
  fs.writeFileSync(path.join(OUT, 'search.json'), JSON.stringify(Object.fromEntries(notes.map((n) => [n.slug, n.sections]))));

  return notes.length;
}

function serve(port = 4000) {
  const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json' };
  http
    .createServer((req, res) => {
      let file = path.join(OUT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
      if (!file.startsWith(OUT)) return res.writeHead(403).end();
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
      if (!fs.existsSync(file)) return res.writeHead(404).end('Not found');
      res.writeHead(200, { 'content-type': (types[path.extname(file)] ?? 'application/octet-stream') + '; charset=utf-8' });
      fs.createReadStream(file).pipe(res);
    })
    .listen(port, () => console.log(`http://localhost:${port}`));
}

function rebuild() {
  try {
    const count = build();
    console.log(`built ${count} notes`);
  } catch (e) {
    console.error(e.message);
    if (!process.argv.includes('--serve')) process.exit(1);
  }
}

rebuild();

if (process.argv.includes('--serve')) {
  serve();
  let timer;
  for (const dir of [NOTES, SRC]) {
    fs.watch(dir, { recursive: true }, () => {
      clearTimeout(timer);
      timer = setTimeout(rebuild, 100);
    });
  }
}
