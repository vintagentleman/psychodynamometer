import { expect, test } from 'vitest';

import { civilDateInZone, sameLocalYmd, viewerMatchesZone, zoneOptions } from '../src/lib/tz.ts';

test('civilDateInZone expresses an instant as the group-zone civil date', () => {
	// 20:00 UTC on Jun 14 is 23:00 Moscow (same day)
	expect(civilDateInZone(Date.UTC(2026, 5, 14, 20, 0), 'Europe/Moscow').toString()).toBe(
		'2026-06-14',
	);
	// 22:00 UTC on Jun 14 is 01:00 Moscow the next day
	expect(civilDateInZone(Date.UTC(2026, 5, 14, 22, 0), 'Europe/Moscow').toString()).toBe(
		'2026-06-15',
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

test('zoneOptions rounds to whole minutes for a millisecond-carrying instant', () => {
	// a live Date.now() carries ms; the label must stay clean, not "GMT+02:59.99"
	const opts = zoneOptions(Date.UTC(2026, 6, 1, 12, 0, 0) + 250);
	const moscow = opts.find((o) => o.value === 'Europe/Moscow');
	expect(moscow?.label).toBe('(GMT+03:00) Europe/Moscow');
});

test('viewerMatchesZone compares the viewer offset to the group offset', () => {
	const ms = Date.UTC(2026, 5, 18, 16, 0);
	// UTC+14 and UTC-12 have different offsets, so the host (whatever its zone)
	// cannot match both — host-independent, and it exercises the comparison.
	expect(viewerMatchesZone(ms, 'Etc/GMT-14') && viewerMatchesZone(ms, 'Etc/GMT+12')).toBe(false);
});
