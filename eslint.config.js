import js from '@eslint/js';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
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
	{
		files: ['playwright.config.ts'],
		languageOptions: { globals: { ...globals.node } },
	},
	{
		plugins: { 'simple-import-sort': simpleImportSort },
		rules: {
			'simple-import-sort/imports': 'error',
			'simple-import-sort/exports': 'error',
			'no-restricted-properties': [
				'error',
				{
					object: 'Temporal',
					property: 'Now',
					message:
						'Now flows in as a nowMs parameter; Temporal.Now would dodge the frozen e2e clock.',
				},
			],
		},
	},
	{ ignores: ['.superpowers/', 'dist/'] },
];
