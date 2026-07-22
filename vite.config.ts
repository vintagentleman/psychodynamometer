import { defineConfig } from 'vitest/config';
import browserslist from 'browserslist';
import { browserslistToTargets } from 'lightningcss';

export default defineConfig({
	base: './',
	css: {
		transformer: 'lightningcss',
		lightningcss: { targets: browserslistToTargets(browserslist()) },
	},
	build: { target: 'baseline-widely-available', cssMinify: 'lightningcss' },
	test: { environment: 'node' },
});
