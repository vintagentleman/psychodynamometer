import { test } from 'node:test';
import assert from 'node:assert/strict';
import { messages, resolveLocale, t } from '../src/i18n.js';

test('stored language wins; otherwise navigator prefix; default en', () => {
	assert.equal(resolveLocale('ru-RU', 'en'), 'en');
	assert.equal(resolveLocale('ru-RU', null), 'ru');
	assert.equal(resolveLocale('en-US', null), 'en');
	assert.equal(resolveLocale('de', null), 'en');
	assert.equal(resolveLocale(undefined, null), 'en');
	assert.equal(resolveLocale('de', 'xx'), 'en');
});

test('t interpolates params', () => {
	assert.equal(t('ru', 'hoursShort', { hours: '4' }), '4 ч');
	assert.equal(
		t('en', 'headerHours', { completed: '28.5', target: '41.5' }),
		'28.5 of 41.5 contracted hours',
	);
});

test('t falls back to the key when missing', () => {
	assert.equal(t('en', 'nope'), 'nope');
});

test('dictionaries cover the same keys', () => {
	assert.deepEqual(Object.keys(messages.en).sort(), Object.keys(messages.ru).sort());
});
