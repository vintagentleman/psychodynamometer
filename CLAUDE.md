# psychodynamometer

Static group-progress visualiser (GitHub Pages). No bundler, no minifier, no
runtime dependencies, no frameworks — plain ES modules served as authored.

## Hard rules

- **Browser support: Baseline widely available.** No `light-dark()`, no
  Temporal, no polyfills. Theme via `prefers-color-scheme` + `color-scheme`.
  CSS nesting and `:has()` are fine.
- **JS + JSDoc types only** (`tsc --noEmit --checkJs`, strict). No `.ts`.
- **Tabs, not spaces**, everywhere.
- **Conventional commits** (commitlint enforces), **subject line only** — no
  body, no `Co-Authored-By` or other trailers.
- **Never commit specs, plans or design docs.** They live outside the repo
  in `~/.claude/specs/psycho-group-progress/`.
- **Dates are never rendered numeric** (`18.06` caused a real missed
  session). Weekday + spelled month via `Intl.DateTimeFormat`, always.
- Pure logic lives in `src/lib.js` (unit-tested, no DOM); DOM only in
  `src/app.js`; UI strings only in `src/i18n.js` (en + ru, same key sets).
- Group data is encoded in the URL hash as `#d=<base64url token>`. The token
  is a binary blob — format marker, target in half-hours, session count, one
  5-byte record per session (packed date + start/end minute-of-day), then the
  UTF-8 title — base64url-encoded (see `src/lib.js`). It carries no readable
  structure by design; a payload that fails to decode shows the "build a fresh
  one" screen.
- User data reaches the DOM only via `<template>` cloning and
  `textContent`/attribute setters — never string-built HTML. Markup lives in
  `index.html` templates; `src/app.js` only clones and fills them.

## Commands

- `npm run check` — the gate: typecheck + lint (markuplint + stylelint +
  eslint) + format check + tests.
- `npm test` — Node built-in runner, tests in `test/`.
- `npm run test:e2e` — Playwright browser suite in `e2e/` (self-serving;
  needs `npx playwright install chromium` once per machine).
- `npx -y serve .` — local serving (modules need http).
