# Psychodynamometer

[![Live on GitHub Pages](https://img.shields.io/badge/live-GitHub%20Pages-2a78d6)](https://vintagentleman.github.io/psychodynamometer/)

A static, shareable progress page for time-bounded therapy and coaching
groups: contracted hours vs hours done, the next session, weekly rhythm and
the full schedule — computed live in the browser from data encoded in the
link itself. No server, no accounts.

**Why:** groups with irregular schedules (two 3-hour sessions one week, none
the next, a 6-hour marathon later) are hard to track by hand. This answers
"how far along are we, and when do we next meet?" at a glance — in English
or Russian, with dates always spelled out (a `18.06` vs `18.07` mix-up once
cost a participant a session; that format is banned here by construction).

## Use it

Open the page, fill in the group name, target hours and sessions, press
**Copy link**, share the link. Anyone opening it sees current progress —
past and upcoming are computed against their clock, so the link never goes
stale. They can hit **Edit** to adjust and re-share; the address bar stays in
sync as you edit. Language auto-detects (EN/RU) and can be toggled.

The data lives entirely in the URL hash: nothing is uploaded anywhere.

## Development

Built with Vite — no framework, no runtime dependencies (build-time tooling
only). TypeScript (erasable-syntax-only) checked by `tsc`; unit tests on Vitest.

```bash
npm install          # dev tooling only
npm run check        # typecheck + lint + format check + tests + build
npm run test:e2e     # browser end-to-end suite (playwright)
npm run dev          # vite dev server
npm run build        # bundle to dist/
npm run preview      # serve the built dist/ locally
git config core.hooksPath .githooks   # once per clone: commit-msg linting
```

Browser support policy: **Baseline widely available**, declared in
package.json `browserslist` and enforced by lightningcss — no polyfills. See
`CLAUDE.md`.
