import { expect, test } from 'vitest';

import {
	formatDateLong,
	formatDateShort,
	formatHoursNum,
	formatLocalTime,
	formatMonth,
	formatOffsetTag,
	formatWeekRange,
} from '../src/lib/format.ts';

test('dates render spelled out, never numeric-ambiguous', () => {
	const thu = new Date(2026, 5, 18);
	expect(formatDateShort(thu, 'en')).toBe('Thu 18 Jun');
	expect(formatDateShort(thu, 'ru')).toBe('чт, 18 июн.');
	const jul = new Date(2026, 6, 23);
	expect(formatDateLong(jul, 'en')).toBe('Thursday 23 July');
	expect(formatDateLong(jul, 'ru')).toBe('четверг, 23 июля');
	expect(formatMonth(thu, 'en')).toBe('Jun');
});

test('week ranges span monday to sunday, localised', () => {
	expect(formatWeekRange(new Date(2026, 7, 17), 'en')).toBe('17 – 23 Aug');
	expect(formatWeekRange(new Date(2026, 7, 17), 'ru')).toBe('17–23 авг.');
	// a week crossing a month boundary names both months
	expect(formatWeekRange(new Date(2026, 5, 29), 'en')).toBe('29 Jun – 5 Jul');
	expect(formatWeekRange(new Date(2026, 5, 29), 'ru')).toBe('29 июн. – 5 июл.');
});

test('hours localise decimal separators', () => {
	expect(formatHoursNum(28.5, 'en')).toBe('28.5');
	expect(formatHoursNum(28.5, 'ru')).toBe('28,5');
	expect(formatHoursNum(4, 'en')).toBe('4');
});

test('formatted hours use a plain space, not NBSP, as the ru group separator', () => {
	const out = formatHoursNum(1200, 'ru');
	expect(out).toBe('1 200');
	expect(out).not.toMatch(/[\u00a0\u202f]/); // no NBSP / narrow NBSP the engines disagree on
});

test('formatOffsetTag renders the zone offset', () => {
	expect(formatOffsetTag(Date.UTC(2026, 5, 18, 16, 0), 'Europe/Moscow', 'en')).toBe('GMT+3');
	expect(formatOffsetTag(Date.UTC(2026, 0, 15, 14, 0), 'America/New_York', 'en')).toBe('GMT-5');
});

test('formatLocalTime renders HH:MM', () => {
	// value is viewer-local (host-dependent); assert only the shape here — the
	// localised value is asserted in e2e where the browser timezone is pinned
	expect(formatLocalTime(Date.UTC(2026, 5, 18, 16, 0), 'en')).toMatch(/^\d{2}:\d{2}$/);
});
