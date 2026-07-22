import browserslist from 'browserslist';
import { browserslistToTargets } from 'lightningcss';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	base: './',
	css: {
		transformer: 'lightningcss',
		lightningcss: { targets: browserslistToTargets(browserslist()) },
	},
	build: { target: 'baseline-widely-available', cssMinify: 'lightningcss' },
	test: { environment: 'node' },
});
