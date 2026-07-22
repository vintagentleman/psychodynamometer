import js from '@eslint/js';
import globals from 'globals';

export default [
	js.configs.recommended,
	{
		languageOptions: {
			ecmaVersion: 2023,
			sourceType: 'module',
			globals: { ...globals.browser },
		},
	},
	{
		files: ['test/**/*.js'],
		languageOptions: { globals: { ...globals.node } },
	},
	{
		files: ['e2e/**/*.mjs'],
		languageOptions: { globals: { ...globals.node, ...globals.browser } },
	},
	{ ignores: ['.superpowers/', 'dist/'] },
];
