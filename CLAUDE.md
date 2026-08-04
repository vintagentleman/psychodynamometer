# psychodynamometer

Static group-progress visualiser (GitHub Pages), authored in TypeScript and
built with Vite. No frameworks. Dependency-free in spirit: the default page
load runs first-party code only. A runtime dependency is permitted only when
that load never pays for it — a feature-detected, self-retiring polyfill for
a future-platform API, or a feature-scoped library fetched on demand from a
user action. Vite bundles and minifies JS; lightningcss transforms and
minifies CSS.

## Hard rules

- **Browser target: Baseline widely available**, declared in package.json
  `browserslist` and enforced by lightningcss (down-levels modern CSS to that
  floor). Temporal is used via feature detection: native where the engine
  ships it, with `src/lib/temporal.ts` lazy-loading a polyfill where not. No
  other polyfills. Above-Baseline APIs are permitted only strictly
  feature-detected, never polyfilled and never required for core function —
  `Copy link` stays the universal path beside the feature-detected Share.
  Never call `Temporal.Now` (eslint-enforced) —
  "now" always arrives as a parameter, so the e2e frozen clock stays honest.
  Theme via `prefers-color-scheme` + `color-scheme`. CSS nesting and `:has()`
  are fine.
- **TypeScript, erasable-syntax-only** (`erasableSyntaxOnly` +
  `verbatimModuleSyntax` + `isolatedModules`, strict). No enums, namespaces or
  parameter properties — every annotation must fully erase, so Vite/esbuild
  strip types per file. `tsc --noEmit` is the type gate; the build never checks.
- **Tabs, not spaces**, everywhere.
- **Conventional commits** (commitlint enforces), **subject line only** — no
  body, no `Co-Authored-By` or other trailers.
- **Never commit specs, plans or design docs.** They live outside the repo
  in `~/.claude/specs/psycho-group-progress/`.
- **Dates are never rendered numeric** (`18.06` caused a real missed
  session). Weekday + spelled month via `Intl.DateTimeFormat`, always.
- Pure logic lives in `src/lib/` (unit-tested, no DOM, no CSS or `import.meta`
  imports — so Vitest and plain Node can both run it); DOM only in `src/app/`;
  UI strings only in `src/i18n.ts` (en + ru, same key sets). Package imports
  in `src/lib/` are allowed only where the dependency rule above sanctions
  them.
- Group data is encoded in the URL hash as `#d=<base64url token>`. The token
  is a binary blob — format marker, target in half-hours, session count, zone,
  one 5-byte record per session (packed date + start/end minute-of-day), then
  the UTF-8 title — base64url-encoded (see `src/lib/codec.ts`). It carries no
  readable structure by design; a payload that fails to decode shows the
  "build a fresh one" screen.
- User data reaches the DOM only via `<template>` cloning and
  `textContent`/attribute setters — never string-built HTML. Markup lives in
  `index.html` templates; `src/app/` only clones and fills them.

## Commands

- `npm run check` — the gate: typecheck + lint (markuplint + stylelint +
  eslint) + format check + tests (Vitest) + build.
- `npm run dev` — Vite dev server.
- `npm run build` — Vite build to `dist/` (gitignored, never committed).
- `npm run preview` — serve the built `dist/` locally.
- `npm test` — Vitest.
- `npm run test:e2e` — Playwright suite in `e2e/`, over the built `dist/`
  (needs `npx playwright install chromium` once per machine).
