import { expect, test } from 'vitest';

import {
	sameLocalYmd,
	viewerMatchesZone,
	zonedCivilDate,
	zonedToInstant,
	zoneOptions,
} from '../src/lib/tz.ts';

test('zonedToInstant maps wall-clock in a zone to a UTC instant (machine-TZ-independent)', () => {
	// asserted against Date.UTC(...), so these hold under any host TZ
	// Moscow is UTC+3, no DST
	expect(zonedToInstant({ y: 2026, mo: 6, d: 18, h: 19, mi: 0 }, 'Europe/Moscow')).toBe(
		Date.UTC(2026, 5, 18, 16, 0),
	);
	// EST, UTC-5
	expect(zonedToInstant({ y: 2026, mo: 1, d: 15, h: 9, mi: 0 }, 'America/New_York')).toBe(
		Date.UTC(2026, 0, 15, 14, 0),
	);
	// EDT, UTC-4
	expect(zonedToInstant({ y: 2026, mo: 7, d: 15, h: 9, mi: 0 }, 'America/New_York')).toBe(
		Date.UTC(2026, 6, 15, 13, 0),
	);
});

test('zonedToInstant is correct on both sides of a DST transition', () => {
	// Europe/London springs forward 2026-03-29 01:00 GMT -> 02:00 BST
	// still GMT (UTC+0)
	expect(zonedToInstant({ y: 2026, mo: 3, d: 29, h: 0, mi: 30 }, 'Europe/London')).toBe(
		Date.UTC(2026, 2, 29, 0, 30),
	);
	// now BST (UTC+1)
	expect(zonedToInstant({ y: 2026, mo: 3, d: 29, h: 3, mi: 0 }, 'Europe/London')).toBe(
		Date.UTC(2026, 2, 29, 2, 0),
	);
});

test('zonedCivilDate expresses an instant as the group-zone civil date', () => {
	// 20:00 UTC on Jun 14 is 23:00 Moscow (same day)
	expect(zonedCivilDate(new Date(Date.UTC(2026, 5, 14, 20, 0)), 'Europe/Moscow')).toEqual(
		new Date(2026, 5, 14),
	);
	// 22:00 UTC on Jun 14 is 01:00 Moscow the next day
	expect(zonedCivilDate(new Date(Date.UTC(2026, 5, 14, 22, 0)), 'Europe/Moscow')).toEqual(
		new Date(2026, 5, 15),
	);
});

test('sameLocalYmd compares only the calendar day, ignoring time of day', () => {
	expect(sameLocalYmd(new Date(2026, 6, 23, 0, 5), new Date(2026, 6, 23, 23, 55))).toBe(true);
	expect(sameLocalYmd(new Date(2026, 6, 23, 23, 0), new Date(2026, 6, 24, 1, 0))).toBe(false);
	// different month / year are not equal even on the same day-of-month
	expect(sameLocalYmd(new Date(2026, 5, 23), new Date(2026, 6, 23))).toBe(false);
	expect(sameLocalYmd(new Date(2025, 6, 23), new Date(2026, 6, 23))).toBe(false);
});

test('zoneOptions labels each zone with its padded GMT offset and sorts by offset', () => {
	// fixed instant → offsets come from the zone param, not the host TZ (deterministic)
	const opts = zoneOptions(Date.UTC(2026, 6, 1));
	const byValue = new Map(opts.map((o) => [o.value, o.label]));
	expect(byValue.get('Europe/Moscow')).toBe('(GMT+03:00) Europe/Moscow');
	// half-hour zone keeps its minutes
	expect(byValue.get('Asia/Colombo')).toBe('(GMT+05:30) Asia/Colombo');
	// ascending by offset: Kaliningrad (+2) < Moscow (+3) < Yekaterinburg (+5) < Colombo (+5:30)
	const idx = (v: string) => opts.findIndex((o) => o.value === v);
	expect(idx('Europe/Kaliningrad')).toBeLessThan(idx('Europe/Moscow'));
	expect(idx('Europe/Moscow')).toBeLessThan(idx('Asia/Yekaterinburg'));
	expect(idx('Asia/Yekaterinburg')).toBeLessThan(idx('Asia/Colombo'));
});

test('viewerMatchesZone compares the viewer offset to the group offset', () => {
	const ms = Date.UTC(2026, 5, 18, 16, 0);
	// UTC+14 and UTC-12 have different offsets, so the host (whatever its zone)
	// cannot match both — host-independent, and it exercises the comparison.
	expect(viewerMatchesZone(ms, 'Etc/GMT-14') && viewerMatchesZone(ms, 'Etc/GMT+12')).toBe(false);
});
