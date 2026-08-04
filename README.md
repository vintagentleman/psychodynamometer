# Psychodynamometer

[![Live on GitHub Pages](https://img.shields.io/badge/live-GitHub%20Pages-2a78d6)](https://vintagentleman.github.io/psychodynamometer/)
[![standard-readme compliant](https://img.shields.io/badge/standard--readme-OK-green.svg?style=flat-square)](https://github.com/RichardLitt/standard-readme)

> Static, shareable progress visualiser for time-bounded therapy and coaching groups.

Contracted hours vs hours done, the next session, weekly rhythm and the full
schedule — computed in the browser from data carried in the link itself. No
server, no accounts, no tracking. Reads in English or Russian, and dates are
always spelled out, never numeric.

## Install

The hosted version needs no installation — just open
[the page](https://vintagentleman.github.io/psychodynamometer/).

To run it locally (Node >= 26):

```bash
git clone https://github.com/vintagentleman/psychodynamometer.git
cd psychodynamometer
npm install
npm run dev
```

## Usage

Fill in the group name, target hours and sessions, press **Copy link**, then
share the link. Anyone opening it sees the current progress, computed against
their own clock. The whole group is encoded in the URL hash, so a link is fully
self-contained — and a snapshot: changing the schedule means sharing a new
link, while the ones already sent keep showing the old plan.

## Development

Vite + TypeScript, no framework. The single runtime dependency is a Temporal
polyfill, lazy-loaded only where the engine lacks native support.

```bash
npm run check        # the gate: typecheck + lint + format check + tests + build
npm run dev          # vite dev server
npm test             # unit tests (vitest)
npm run test:e2e     # end-to-end suite (playwright)
```

See [`CLAUDE.md`](CLAUDE.md) for the full set of project conventions.

## Maintainers

[@vintagentleman](https://github.com/vintagentleman) (Konstantin Sipunin).

## Contributing

Issues and PRs are welcome. Run `npm run check` before opening a PR; commits
follow [Conventional Commits](https://www.conventionalcommits.org), subject
line only. Enable commit-message linting once per clone with
`git config core.hooksPath .githooks`.

This project follows the
[standard-readme](https://github.com/RichardLitt/standard-readme) specification.

## License

[MIT](LICENSE) © 2026 Konstantin Sipunin.
