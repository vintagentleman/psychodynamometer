import { defineConfig } from 'vite';
import browserslist from 'browserslist';
import { browserslistToTargets } from 'lightningcss';

export default defineConfig({
	base: './',
	css: {
		transformer: 'lightningcss',
		lightningcss: { targets: browserslistToTargets(browserslist()) },
	},
	build: { cssMinify: 'lightningcss' },
});
