import { expect, test } from 'vitest';

import type { GroupData } from '../src/lib.ts';
import { decodeGroup, encodeGroup } from '../src/lib.ts';

const group: GroupData = {
	title: 'Группа «Вторник» ~_.%',
	targetHours: 41.5,
	timeZone: 'Europe/Moscow',
	sessions: [
		{ date: '2026-06-02', start: '19:00', end: '22:30' },
		{ date: '2026-08-09', start: '08:00', end: '16:00' },
	],
};

test('codec round-trips unicode titles and multiple sessions', () => {
	expect(decodeGroup(encodeGroup(group))).toEqual(group);
});

test('codec preserves the group timezone', () => {
	const decoded = decodeGroup(encodeGroup({ ...group, timeZone: 'America/New_York' }));
	expect(decoded?.timeZone).toBe('America/New_York');
});

test('payload is a bare base64url token, no structure leaked', () => {
	const payload = encodeGroup(group);
	expect(payload).toMatch(/^[A-Za-z0-9_-]+$/); // base64url, no padding, no '~'
	expect(payload.length).toBeLessThan(120);
});

test('encode stamps the format marker, target, count and zone length', () => {
	const bytes = Buffer.from(encodeGroup(group), 'base64url');
	expect(bytes[0]).toBe(2); // format marker
	expect((bytes[1] << 8) | bytes[2]).toBe(83); // 41.5 h * 2
	expect(bytes[3]).toBe(2); // session count
	expect(bytes[4]).toBe(Buffer.byteLength('Europe/Moscow', 'utf-8')); // zone length (13)
});

test('decode reads a hand-packed blob', () => {
	const dateWord = ((2026 - 2000) << 9) | (1 << 5) | 5; // 2026-01-05
	const timeWord = ((10 * 60) << 13) | ((13 * 60) << 2); // 10:00-13:00
	const zone = Buffer.from('UTC', 'utf-8');
	const blob = Buffer.from([
		2, // marker
		0,
		40, // target 20 h
		1, // one session
		zone.length, // zone length
		...zone,
		(dateWord >> 8) & 0xff,
		dateWord & 0xff,
		(timeWord >> 16) & 0xff,
		(timeWord >> 8) & 0xff,
		timeWord & 0xff,
		...Buffer.from('Hi', 'utf-8'),
	]);
	expect(decodeGroup(blob.toString('base64url'))).toEqual({
		title: 'Hi',
		targetHours: 20,
		timeZone: 'UTC',
		sessions: [{ date: '2026-01-05', start: '10:00', end: '13:00' }],
	});
});

test('round-trips field boundaries', () => {
	const edge: GroupData = {
		title: '🎯',
		targetHours: 1000,
		timeZone: 'UTC',
		sessions: [
			{ date: '2000-01-01', start: '00:00', end: '23:59' },
			{ date: '2099-12-31', start: '00:00', end: '00:01' },
		],
	};
	expect(decodeGroup(encodeGroup(edge))).toEqual(edge);
});

test('empty sessions round-trip to an empty list', () => {
	const decoded = decodeGroup(encodeGroup({ ...group, sessions: [] }));
	expect(decoded?.sessions).toEqual([]);
	expect(decoded?.title).toBe(group.title);
});

test('target is quantized to the half hour', () => {
	const decoded = decodeGroup(encodeGroup({ ...group, targetHours: 40.3 }));
	expect(decoded?.targetHours).toBe(40.5);
});

test('decode returns null on malformed payloads', () => {
	expect(decodeGroup('')).toBeNull(); // empty
	expect(decodeGroup('%%%garbage%%%')).toBeNull(); // not base64url
	expect(decodeGroup(Buffer.from([2, 2]).toString('base64url'))).toBeNull(); // < 5 bytes
	expect(decodeGroup(Buffer.from([1, 0, 40, 0, 0]).toString('base64url'))).toBeNull(); // v1 marker
	// zone "UTC", N=1, but only 3 of the 5 session bytes present
	expect(
		decodeGroup(Buffer.from([2, 0, 40, 1, 3, 85, 84, 67, 0, 0, 0]).toString('base64url')),
	).toBeNull();
	// zone "UTC", N=5, no session bytes
	expect(decodeGroup(Buffer.from([2, 0, 40, 5, 3, 85, 84, 67]).toString('base64url'))).toBeNull();
	// zone "XXXX" is not a real IANA zone
	expect(
		decodeGroup(Buffer.from([2, 0, 40, 0, 4, 88, 88, 88, 88]).toString('base64url')),
	).toBeNull();
});

test('decode rejects packed fields that are not real datetimes', () => {
	const pack = (dateWord: number, startMin: number, endMin: number) => {
		const timeWord = (startMin << 13) | (endMin << 2);
		return Buffer.from([
			2,
			0,
			40,
			1,
			3, // zone length
			85,
			84,
			67, // "UTC"
			(dateWord >> 8) & 0xff,
			dateWord & 0xff,
			(timeWord >> 16) & 0xff,
			(timeWord >> 8) & 0xff,
			timeWord & 0xff,
		]).toString('base64url');
	};
	const feb30 = ((2026 - 2000) << 9) | (2 << 5) | 30;
	expect(decodeGroup(pack(feb30, 600, 660))).toBeNull(); // Feb 30 rolls over
	const month13 = ((2026 - 2000) << 9) | (13 << 5) | 1;
	expect(decodeGroup(pack(month13, 600, 660))).toBeNull(); // month 13
	const jan1 = ((2026 - 2000) << 9) | (1 << 5) | 1;
	expect(decodeGroup(pack(jan1, 1500, 1560))).toBeNull(); // minute 1500 -> hour 25
	expect(decodeGroup(pack(jan1, 700, 600))).toBeNull(); // end before start
});

test('decode rejects a title with a broken utf-8 tail', () => {
	// marker, target, N=0, zone "UTC", then a lone 0xC3 (incomplete 2-byte sequence)
	expect(
		decodeGroup(Buffer.from([2, 0, 40, 0, 3, 85, 84, 67, 0xc3]).toString('base64url')),
	).toBeNull();
});

import { computeProgress, parseSession, parseSessions } from '../src/lib.ts';

test('parseSession validates and computes wall-clock duration', () => {
	const s = parseSession({ date: '2026-06-18', start: '19:00', end: '22:30' });
	expect(s?.hours).toBe(3.5);
	expect(s?.date).toBe('2026-06-18');
	expect(s?.start).toBe('19:00');
	expect(s?.end).toBe('22:30');
	expect(s && 'startDT' in s).toBe(false);
});

test('parseSessions hydrates instants and civil date in the group zone', () => {
	const [s] = parseSessions(
		[{ date: '2026-06-18', start: '19:00', end: '22:30' }],
		'Europe/Moscow',
	);
	expect(s.startMs).toBe(Date.UTC(2026, 5, 18, 16, 0));
	expect(s.endMs).toBe(Date.UTC(2026, 5, 18, 19, 30));
	expect(s.civilDate).toEqual(new Date(2026, 5, 18));
});

test('parseSession rejects end <= start and garbage', () => {
	expect(parseSession({ date: '2026-06-18', start: '19:00', end: '19:00' })).toBeNull();
	expect(parseSession({ date: '2026-06-18', start: '19:00', end: '18:00' })).toBeNull();
	expect(parseSession({ date: 'nonsense', start: '19:00', end: '20:00' })).toBeNull();
	expect(parseSession({ date: '', start: '', end: '' })).toBeNull();
});

test('parseSession rejects calendar dates that would silently roll over', () => {
	expect(parseSession({ date: '2026-02-30', start: '10:00', end: '11:00' })).toBeNull(); // Feb 30
	expect(parseSession({ date: '2026-02-29', start: '10:00', end: '11:00' })).toBeNull(); // 2026 is not a leap year
	expect(parseSession({ date: '2026-04-31', start: '10:00', end: '11:00' })).toBeNull(); // April has 30 days
});

test('parseSession accepts a genuine leap day', () => {
	const s = parseSession({ date: '2028-02-29', start: '10:00', end: '11:00' });
	expect(s?.date).toBe('2028-02-29');
});

test('parseSession rejects dates outside the encodable 2000-2099 century', () => {
	expect(parseSession({ date: '1999-12-31', start: '10:00', end: '11:00' })).toBeNull();
	expect(parseSession({ date: '2100-01-01', start: '10:00', end: '11:00' })).toBeNull();
	expect(parseSession({ date: '2000-01-01', start: '10:00', end: '11:00' })).toBeTruthy(); // boundary
	expect(parseSession({ date: '2099-12-31', start: '10:00', end: '11:00' })).toBeTruthy(); // boundary
});

test('parseSession measures wall-clock hours, unaffected by a DST transition', () => {
	// 2026-03-29 is EU spring-forward (02:00 -> 03:00): 01:30-03:30 is 2 hours on
	// the clock even though only 1 real UTC hour elapses. (Run under a DST-observing
	// TZ, e.g. TZ=Europe/Berlin, to exercise the transition.)
	const s = parseSession({ date: '2026-03-29', start: '01:30', end: '03:30' });
	expect(s?.hours).toBe(2);
});

test('parseSessions drops invalid entries and sorts chronologically', () => {
	const sessions = parseSessions(
		[
			{ date: '2026-01-20', start: '10:00', end: '15:00' },
			{ date: 'broken', start: '10:00', end: '11:00' },
			{ date: '2026-01-05', start: '10:00', end: '13:00' },
		],
		'UTC',
	);
	expect(sessions.length).toBe(2);
	expect(sessions[0].date).toBe('2026-01-05');
	expect(sessions[1].date).toBe('2026-01-20');
});

const fixture = parseSessions(
	[
		{ date: '2026-01-05', start: '10:00', end: '13:00' }, // 3 h
		{ date: '2026-01-07', start: '10:00', end: '14:00' }, // 4 h
		{ date: '2026-01-20', start: '10:00', end: '15:00' }, // 5 h
	],
	'UTC',
);

test('computeProgress counts only ended sessions', () => {
	const p = computeProgress(fixture, 10, Date.UTC(2026, 0, 10));
	expect(p.completedHours).toBe(7);
	expect(p.remainingHours).toBe(3);
	expect(p.percent).toBe(70);
});

test('computeProgress overshoot: percent caps, real hours shown, remaining clamps', () => {
	const p = computeProgress(fixture, 10, Date.UTC(2026, 1, 1));
	expect(p.completedHours).toBe(12);
	expect(p.remainingHours).toBe(0);
	expect(p.percent).toBe(100);
});

test('computeProgress with zero target yields zero percent', () => {
	expect(computeProgress(fixture, 0, Date.UTC(2026, 1, 1)).percent).toBe(0);
});

import { progressSegments } from '../src/lib.ts';

test('computeProgress also reports upcoming (not-yet-ended) hours', () => {
	expect(computeProgress(fixture, 10, Date.UTC(2026, 0, 10)).upcomingHours).toBe(5);
	expect(computeProgress(fixture, 10, Date.UTC(2026, 1, 1)).upcomingHours).toBe(0);
});

test('progressSegments splits done / upcoming / unplanned against the target', () => {
	expect(progressSegments(7, 0, 10)).toEqual({ donePct: 70, upcomingPct: 0 });
	expect(progressSegments(4, 3, 10)).toEqual({ donePct: 40, upcomingPct: 30 });
});

test('progressSegments clamps overshoot so the bar never exceeds 100%', () => {
	expect(progressSegments(12, 0, 10)).toEqual({ donePct: 100, upcomingPct: 0 });
	expect(progressSegments(7, 6, 10)).toEqual({ donePct: 70, upcomingPct: 30 });
});

test('progressSegments is all zero with no target', () => {
	expect(progressSegments(5, 5, 0)).toEqual({ donePct: 0, upcomingPct: 0 });
});

import { findNextSession } from '../src/lib.ts';

test('findNextSession picks the earliest not-yet-ended session', () => {
	const next = findNextSession(fixture, Date.UTC(2026, 0, 6));
	expect(next?.session.date).toBe('2026-01-07');
	expect(next?.inProgress).toBe(false);
});

test('findNextSession flags a session running right now', () => {
	const next = findNextSession(fixture, Date.UTC(2026, 0, 20, 11, 0));
	expect(next?.session.date).toBe('2026-01-20');
	expect(next?.inProgress).toBe(true);
});

test('findNextSession returns null when everything ended or list is empty', () => {
	expect(findNextSession(fixture, Date.UTC(2026, 1, 1))).toBeNull();
	expect(findNextSession([], Date.UTC(2026, 0, 1))).toBeNull();
});

import { weeklyBuckets, weekStartOf } from '../src/lib.ts';

test('weekStartOf snaps to Monday', () => {
	expect(weekStartOf(new Date(2026, 5, 18))).toEqual(new Date(2026, 5, 15)); // Thu -> Mon
	expect(weekStartOf(new Date(2026, 5, 21))).toEqual(new Date(2026, 5, 15)); // Sun -> Mon
	expect(weekStartOf(new Date(2026, 5, 15))).toEqual(new Date(2026, 5, 15)); // Mon stays
});

test('weeklyBuckets spans first..last week, keeps empty weeks, splits by now', () => {
	const sessions = parseSessions(
		[
			{ date: '2026-06-02', start: '19:00', end: '22:00' }, // Tue, week of Jun 1, 3 h
			{ date: '2026-06-18', start: '19:00', end: '23:00' }, // Thu, week of Jun 15, 4 h
		],
		'UTC',
	);
	const buckets = weeklyBuckets(sessions, Date.UTC(2026, 5, 10, 12, 0)); // Wed, week of Jun 8
	expect(buckets.length).toBe(3);
	expect(buckets.map((b) => [b.doneHours, b.upcomingHours])).toEqual([
		[3, 0],
		[0, 0],
		[0, 4],
	]);
	expect(buckets[0].weekStart).toEqual(new Date(2026, 5, 1));
	expect(buckets[1].weekStart).toEqual(new Date(2026, 5, 8));
	expect(buckets[2].weekStart).toEqual(new Date(2026, 5, 15));
});

test('weeklyBuckets splits a week that straddles now into both segments', () => {
	const sessions = parseSessions(
		[
			{ date: '2026-06-08', start: '10:00', end: '12:00' }, // Mon, 2 h — ended
			{ date: '2026-06-12', start: '10:00', end: '13:00' }, // Fri, 3 h — upcoming
		],
		'UTC',
	);
	const buckets = weeklyBuckets(sessions, Date.UTC(2026, 5, 10, 12, 0)); // Wed same week
	expect(buckets.length).toBe(1);
	expect([buckets[0].doneHours, buckets[0].upcomingHours]).toEqual([2, 3]);
});

test('weeklyBuckets counts a session ending in the future as upcoming even in the current week', () => {
	// the exact shape of the reported bug: today Tue, session Thu same week
	const sessions = parseSessions([{ date: '2026-07-23', start: '12:00', end: '15:00' }], 'UTC');
	const buckets = weeklyBuckets(sessions, Date.UTC(2026, 6, 21, 12, 0)); // Tue 21 Jul
	expect([buckets[0].doneHours, buckets[0].upcomingHours]).toEqual([0, 3]);
});

test('weeklyBuckets of nothing is empty', () => {
	expect(weeklyBuckets([], Date.now())).toEqual([]);
});

test('weeklyBuckets keys weeks by the group-zone civil date, not the viewer', () => {
	// Sunday 21:00 Moscow — a late-Sunday session belongs to Sunday's week even
	// for a viewer who experiences it as Monday morning
	const sessions = parseSessions(
		[{ date: '2026-06-14', start: '21:00', end: '23:00' }],
		'Europe/Moscow',
	);
	const buckets = weeklyBuckets(sessions, Date.UTC(2026, 5, 1)); // before it -> upcoming
	expect(buckets.length).toBe(1);
	expect(buckets[0].weekStart).toEqual(new Date(2026, 5, 8)); // Mon of the week of Sun Jun 14
	expect([buckets[0].doneHours, buckets[0].upcomingHours]).toEqual([0, 2]);
});

import { nowWeekIndex } from '../src/lib.ts';

test('nowWeekIndex finds the bucket that contains now, else null', () => {
	const buckets = weeklyBuckets(
		parseSessions(
			[
				{ date: '2026-06-02', start: '19:00', end: '22:00' },
				{ date: '2026-06-18', start: '19:00', end: '23:00' },
			],
			'UTC',
		),
		Date.UTC(2026, 5, 10, 12, 0),
	); // weeks of Jun 1, Jun 8, Jun 15
	expect(nowWeekIndex(buckets, new Date(2026, 5, 10))).toBe(1);
	expect(nowWeekIndex(buckets, new Date(2026, 4, 1))).toBeNull();
	expect(nowWeekIndex(buckets, new Date(2026, 7, 1))).toBeNull();
	expect(nowWeekIndex([], new Date(2026, 5, 10))).toBeNull();
});

import {
	formatDateLong,
	formatDateShort,
	formatHoursNum,
	formatMonth,
	formatWeekRange,
} from '../src/lib.ts';

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

import { formatLocalTime, formatOffsetTag, zonedCivilDate, zonedToInstant } from '../src/lib.ts';

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

test('formatOffsetTag renders the zone offset', () => {
	expect(formatOffsetTag(Date.UTC(2026, 5, 18, 16, 0), 'Europe/Moscow', 'en')).toBe('GMT+3');
	expect(formatOffsetTag(Date.UTC(2026, 0, 15, 14, 0), 'America/New_York', 'en')).toBe('GMT-5');
});

test('formatLocalTime renders HH:MM', () => {
	// value is viewer-local (host-dependent); assert only the shape here — the
	// localised value is asserted in e2e where the browser timezone is pinned
	expect(formatLocalTime(Date.UTC(2026, 5, 18, 16, 0), 'en')).toMatch(/^\d{2}:\d{2}$/);
});

import { viewerMatchesZone } from '../src/lib.ts';

test('viewerMatchesZone compares the viewer offset to the group offset', () => {
	const ms = Date.UTC(2026, 5, 18, 16, 0);
	// UTC+14 and UTC-12 have different offsets, so the host (whatever its zone)
	// cannot match both — host-independent, and it exercises the comparison.
	expect(viewerMatchesZone(ms, 'Etc/GMT-14') && viewerMatchesZone(ms, 'Etc/GMT+12')).toBe(false);
});

import { isBlankInput, isComplete, shareableGroup } from '../src/lib.ts';

const draft = {
	title: 'G',
	targetHours: 10,
	timeZone: 'UTC',
	sessions: [{ date: '2026-01-05', start: '10:00', end: '13:00' }],
};

test('isBlankInput is true only when every field is empty', () => {
	expect(isBlankInput({ date: '', start: '', end: '' })).toBe(true);
	expect(isBlankInput({ date: '2026-01-05', start: '', end: '' })).toBe(false);
});

test('isComplete needs a title, a positive target and at least one valid session', () => {
	expect(isComplete(draft)).toBe(true);
	expect(isComplete({ ...draft, title: '  ' })).toBe(false);
	expect(isComplete({ ...draft, targetHours: 0 })).toBe(false);
	expect(isComplete({ ...draft, sessions: [] })).toBe(false);
	expect(
		isComplete({ ...draft, sessions: [{ date: '2026-01-05', start: '13:00', end: '10:00' }] }),
	).toBe(false);
});

test('shareableGroup drops blank rows and returns the cleaned group when complete', () => {
	const withBlank = {
		...draft,
		sessions: [...draft.sessions, { date: '', start: '', end: '' }],
	};
	const out = shareableGroup(withBlank);
	expect(out?.sessions.length).toBe(1);
	expect(out?.timeZone).toBe('UTC');
});

test('shareableGroup returns null when a non-blank row is invalid', () => {
	const bad = {
		...draft,
		sessions: [...draft.sessions, { date: '2026-02-01', start: '13:00', end: '10:00' }],
	};
	expect(shareableGroup(bad)).toBeNull();
});

test('shareableGroup returns null when the group is incomplete', () => {
	expect(shareableGroup({ ...draft, title: '' })).toBeNull();
});
