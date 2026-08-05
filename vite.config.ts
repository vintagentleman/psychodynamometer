import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import browserslist from 'browserslist';
import { browserslistToTargets } from 'lightningcss';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

// Fills src/sw.ts's placeholders. The version also hashes the unhashed
// precached files (page, favicon) — an html-only deploy must still bump it.
function swManifest(): Plugin {
	return {
		name: 'sw-manifest',
		generateBundle(_options, bundle) {
			const names = Object.keys(bundle).filter((name) => name.startsWith('assets/'));
			const polyfill = names.find((name) => name.includes('temporal-polyfill'));
			const precache = names.filter((name) => name !== polyfill);
			const sw = bundle['sw.js'];
			if (sw === undefined || sw.type !== 'chunk' || polyfill === undefined) {
				throw new Error('sw-manifest: expected an sw.js chunk and a temporal-polyfill asset');
			}
			const version = createHash('sha1')
				.update(precache.join())
				.update(polyfill)
				.update(readFileSync(new URL('index.html', import.meta.url)))
				.update(readFileSync(new URL('public/assets/favicon.svg', import.meta.url)))
				.digest('hex')
				.slice(0, 8);
			sw.code = sw.code
				.replace('__PRECACHE__', JSON.stringify(precache))
				.replace('__POLYFILL__', JSON.stringify(polyfill))
				.replace('__VERSION__', JSON.stringify(version));
		},
	};
}

export default defineConfig({
	base: './',
	css: {
		transformer: 'lightningcss',
		lightningcss: { targets: browserslistToTargets(browserslist()) },
	},
	build: {
		target: 'baseline-widely-available',
		cssMinify: 'lightningcss',
		rollupOptions: {
			input: { index: 'index.html', sw: 'src/sw.ts' },
			output: {
				// Unhashed at the root: updates byte-diff a stable URL; location fixes the scope.
				entryFileNames: (chunk) => (chunk.name === 'sw' ? 'sw.js' : 'assets/[name]-[hash].js'),
			},
		},
	},
	plugins: [swManifest()],
	// Unit tests only; e2e/*.spec.ts is Playwright's, run via `playwright test`.
	test: { environment: 'node', include: ['test/**/*.test.ts'] },
});
