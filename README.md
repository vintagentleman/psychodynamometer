# Group Progress

A static, shareable progress page for time-bounded therapy and coaching
groups: contracted hours vs hours done, the next session, weekly rhythm and
the full schedule — computed live in the browser from data encoded in the
link itself. No server, no accounts, no build step.

**Why:** groups with irregular schedules (two 3-hour sessions one week, none
the next, a 6-hour marathon later) are hard to track by hand. This answers
"how far along are we, and when do we next meet?" at a glance — in English
or Russian, with dates always spelled out (a `18.06` vs `18.07` mix-up once
cost a participant a session; that format is banned here by construction).

## Use it

Open the page, fill in the group name, target hours and sessions, press
**Copy link**, share the link. Anyone opening it sees current progress —
past and upcoming are computed against their clock, so the link never goes
stale. Language auto-detects (EN/RU) and can be toggled.

The data lives entirely in the URL hash: nothing is uploaded anywhere.

## Development

Plain ES modules — no bundler, no framework, no runtime dependencies.
JSDoc-typed JavaScript checked by `tsc`; tests on Node's built-in runner.

```bash
npm install          # dev tooling only
npm run check        # typecheck + lint (HTML + CSS + JS) + format check + tests
npm run test:e2e     # browser end-to-end suite (playwright)
npx -y serve .       # serve locally (ES modules need http://)
git config core.hooksPath .githooks   # once per clone: commit-msg linting
```

Browser support policy: **Baseline widely available** — no polyfills, no
build-time transforms. See `CLAUDE.md`.
