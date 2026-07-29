# Psychodynamometer

[![Live on GitHub Pages](https://img.shields.io/badge/live-GitHub%20Pages-2a78d6)](https://vintagentleman.github.io/psychodynamometer/)
[![standard-readme compliant](https://img.shields.io/badge/standard--readme-OK-green.svg?style=flat-square)](https://github.com/RichardLitt/standard-readme)

> Static, shareable progress visualiser for time-bounded therapy and coaching groups.

A progress page for time-bounded therapy and coaching groups: contracted hours
vs hours done, the next session, weekly rhythm and the full schedule — computed
live in the browser from data encoded in the link itself. No server, no
accounts, no runtime dependencies. It reads in English or Russian, and dates are
always spelled out.

## Table of Contents

- [Background](#background)
- [Install](#install)
- [Usage](#usage)
- [Development](#development)
- [Maintainers](#maintainers)
- [Contributing](#contributing)
- [License](#license)

## Background

Groups with irregular schedules (two 3-hour sessions one week, none the next, a
6-hour marathon later) are hard to track by hand. This answers "how far along
are we, and when do we next meet?" at a glance.

Everything lives in the URL. Group data is encoded in the hash as
`#d=<base64url token>` — a binary blob carrying the target, the sessions and the
title, with no readable structure by design. Progress is computed against the
viewer's own clock, so the page never falls behind the calendar: "next session"
and past-vs-upcoming are always current, and nothing is ever uploaded anywhere.

The schedule itself is a snapshot. A link records the plan as it stood when it
was made, so changing the schedule means sharing a new link — the ones already
sent keep showing the old plan.

Dates are never rendered numerically: a `18.06` vs `18.07` mix-up once cost a
participant a session, so that format is banned here by construction. Weekday
and spelled-out month are produced through `Intl.DateTimeFormat`, always.

## Install

The hosted version needs no installation — just open
[the page](https://vintagentleman.github.io/psychodynamometer/).

To run or build it locally, clone the repository and install the build-time
tooling (there are no runtime dependencies):

```bash
git clone https://github.com/vintagentleman/psychodynamometer.git
cd psychodynamometer
npm install
```

Node >= 26 is required.

## Usage

Open the page, fill in the group name, target hours and sessions, press **Copy
link**, then share the link. Anyone opening it sees the current progress — past
and upcoming sessions are computed against their clock. They can hit **Edit** to
adjust and re-share; the address bar stays in sync as you edit. Language
auto-detects (EN/RU) and can be toggled. A session that runs past midnight is
entered with an end time earlier than its start — 22:00 to 01:00 — and reads
with a `+1` marker.

The whole group is carried in the URL hash, so a link is fully self-contained:

```text
https://vintagentleman.github.io/psychodynamometer/#d=<base64url token>
```

A payload that fails to decode simply shows the "build a fresh one" screen.

## Development

Built with Vite — no framework and no runtime dependencies (build-time tooling
only). Source is TypeScript in erasable-syntax-only mode, type-checked by `tsc`
(the build itself never type-checks); pure logic lives in `src/lib/` with unit
tests on Vitest, DOM code in `src/app/`, and UI strings (en + ru) in
`src/i18n.ts`.

```bash
npm run check        # the gate: typecheck + lint + format check + tests + build
npm run dev          # vite dev server
npm run build        # bundle to dist/
npm run preview      # serve the built dist/ locally
npm test             # unit tests (vitest)
npm run test:e2e     # browser end-to-end suite (playwright)
```

The e2e suite needs `npx playwright install chromium` once per machine.

Browser support policy is **Baseline widely available**, declared in
`package.json` `browserslist` and enforced by lightningcss — no polyfills. See
[`CLAUDE.md`](CLAUDE.md) for the full set of project conventions.

## Maintainers

[@vintagentleman](https://github.com/vintagentleman) (Konstantin Sipunin).

## Contributing

Questions and bug reports are welcome via
[issues](https://github.com/vintagentleman/psychodynamometer/issues). PRs are
accepted.

Before opening a PR, run `npm run check` and make sure it passes. Commits follow
[Conventional Commits](https://www.conventionalcommits.org) (enforced by
commitlint, subject line only), and the codebase uses tabs, not spaces. Enable
commit-message linting once per clone with:

```bash
git config core.hooksPath .githooks
```

This project follows the
[standard-readme](https://github.com/RichardLitt/standard-readme) specification.

## License

[MIT](LICENSE) © 2026 Konstantin Sipunin.
