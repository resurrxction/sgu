# Конспекты

Static site: one Markdown file per lecture in `notes/`, built to `dist/`.

```
npm install
npm run dev     # http://localhost:4000, rebuilds on save
npm run build   # one-off build into dist/
```

## Adding a note

Create `notes/YYYY-MM-DD-short-slug.md`:

```markdown
---
title: Пределы функций
date: 2026-10-26
subject: Матанализ
---

Body in Markdown: ## headings, lists, **bold**, tables, > quotes.
```

- `title`, `date`, `subject` are required. Spell `subject` the same way every time; it drives the filter.
- The filename becomes the URL: `/n/2026-10-26-short-slug/`.
- Files starting with `_` are drafts and are skipped.

Site title and UI language (`ru` / `en`) are in `site.config.json`.

## Deploying

Push to `main` on GitHub. In the repo settings, set Pages → Source to "GitHub Actions". The workflow in `.github/workflows/pages.yml` builds and publishes.

## Search

Searches the full text of every note, split by `##` sections. Each result shows the matching section and an excerpt with the words highlighted. Opening a result highlights every match on the note page; step through them with the bar at the bottom, Enter / Shift+Enter, and close with Esc.

Matching is case-insensitive, treats ё as е, matches at word starts and trims Russian endings, so "интегралы" finds "интегралом". Use `##` headings in notes: they give search results their context and section links.
