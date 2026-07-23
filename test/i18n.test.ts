import { expect, test } from 'vitest';

import { messages, resolveLocale, t } from '../src/i18n.ts';

test('stored language wins; otherwise navigator prefix; default en', () => {
	expect(resolveLocale('ru-RU', 'en')).toBe('en');
	expect(resolveLocale('ru-RU', null)).toBe('ru');
	expect(resolveLocale('en-US', null)).toBe('en');
	expect(resolveLocale('de', null)).toBe('en');
	expect(resolveLocale(undefined, null)).toBe('en');
	expect(resolveLocale('de', 'xx')).toBe('en');
});

test('t interpolates params', () => {
	expect(t('ru', 'hoursShort', { hours: '4' })).toBe('4 ч');
	expect(t('en', 'headerHours', { completed: '28.5', target: '41.5' })).toBe('28.5 of 41.5 hours');
});

test('t renders the schedule-fill notes in both locales', () => {
	expect(t('ru', 'unscheduled', { hours: '1' })).toBe('1 ч не запланировано');
	expect(t('en', 'unscheduled', { hours: '1' })).toBe('1 h unscheduled');
	expect(t('ru', 'overscheduled', { hours: '2' })).toBe('2 ч перепланировано');
	expect(t('en', 'overscheduled', { hours: '2' })).toBe('2 h overscheduled');
});

test('t falls back to the key when missing', () => {
	expect(t('en', 'nope')).toBe('nope');
});

test('dictionaries cover the same keys', () => {
	expect(Object.keys(messages.en).sort()).toEqual(Object.keys(messages.ru).sort());
});
