import { expect, test } from 'vitest';

import { viewerMatchesZone, zonedCivilDate, zonedToInstant } from '../src/lib/tz.ts';

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

test('viewerMatchesZone compares the viewer offset to the group offset', () => {
	const ms = Date.UTC(2026, 5, 18, 16, 0);
	// UTC+14 and UTC-12 have different offsets, so the host (whatever its zone)
	// cannot match both — host-independent, and it exercises the comparison.
	expect(viewerMatchesZone(ms, 'Etc/GMT-14') && viewerMatchesZone(ms, 'Etc/GMT+12')).toBe(false);
});
