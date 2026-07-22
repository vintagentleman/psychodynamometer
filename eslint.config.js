import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
	js.configs.recommended,
	...tseslint.configs.recommended,
	{
		languageOptions: {
			ecmaVersion: 'latest',
			sourceType: 'module',
			globals: { ...globals.browser },
		},
	},
	{
		files: ['test/**/*.ts'],
		languageOptions: { globals: { ...globals.node } },
	},
	{
		files: ['e2e/**/*.ts'],
		languageOptions: { globals: { ...globals.node, ...globals.browser } },
	},
	{ ignores: ['.superpowers/', 'dist/'] },
];
