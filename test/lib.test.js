import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeGroup, decodeGroup } from '../src/lib.js';

/** @type {import('../src/lib.js').GroupData} */
const group = {
	title: 'Группа «Вторник» ~_.%',
	targetHours: 41.5,
	timeZone: 'Europe/Moscow',
	sessions: [
		{ date: '2026-06-02', start: '19:00', end: '22:30' },
		{ date: '2026-08-09', start: '08:00', end: '16:00' },
	],
};

test('codec round-trips unicode titles and multiple sessions', () => {
	assert.deepEqual(decodeGroup(encodeGroup(group)), group);
});

test('codec preserves the group timezone', () => {
	const decoded = decodeGroup(encodeGroup({ ...group, timeZone: 'America/New_York' }));
	assert.ok(decoded);
	assert.equal(decoded.timeZone, 'America/New_York');
});

test('payload is a bare base64url token, no structure leaked', () => {
	const payload = encodeGroup(group);
	assert.match(payload, /^[A-Za-z0-9_-]+$/); // base64url, no padding, no '~'
	assert.ok(payload.length < 120, `expected compact, got ${payload.length}`);
});

test('encode stamps the format marker, target, count and zone length', () => {
	const bytes = Buffer.from(encodeGroup(group), 'base64url');
	assert.equal(bytes[0], 2); // format marker
	assert.equal((bytes[1] << 8) | bytes[2], 83); // 41.5 h * 2
	assert.equal(bytes[3], 2); // session count
	assert.equal(bytes[4], Buffer.byteLength('Europe/Moscow', 'utf-8')); // zone length (13)
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
	assert.deepEqual(decodeGroup(blob.toString('base64url')), {
		title: 'Hi',
		targetHours: 20,
		timeZone: 'UTC',
		sessions: [{ date: '2026-01-05', start: '10:00', end: '13:00' }],
	});
});

test('round-trips field boundaries', () => {
	/** @type {import('../src/lib.js').GroupData} */
	const edge = {
		title: '🎯',
		targetHours: 1000,
		timeZone: 'UTC',
		sessions: [
			{ date: '2000-01-01', start: '00:00', end: '23:59' },
			{ date: '2099-12-31', start: '00:00', end: '00:01' },
		],
	};
	assert.deepEqual(decodeGroup(encodeGroup(edge)), edge);
});

test('empty sessions round-trip to an empty list', () => {
	const decoded = decodeGroup(encodeGroup({ ...group, sessions: [] }));
	assert.ok(decoded);
	assert.deepEqual(decoded.sessions, []);
	assert.equal(decoded.title, group.title);
});

test('target is quantized to the half hour', () => {
	const decoded = decodeGroup(encodeGroup({ ...group, targetHours: 40.3 }));
	assert.ok(decoded);
	assert.equal(decoded.targetHours, 40.5);
});

test('decode returns null on malformed payloads', () => {
	assert.equal(decodeGroup(''), null); // empty
	assert.equal(decodeGroup('%%%garbage%%%'), null); // not base64url
	assert.equal(decodeGroup(Buffer.from([2, 2]).toString('base64url')), null); // < 5 bytes
	assert.equal(decodeGroup(Buffer.from([1, 0, 40, 0, 0]).toString('base64url')), null); // v1 marker
	// zone "UTC", N=1, but only 3 of the 5 session bytes present
	assert.equal(
		decodeGroup(Buffer.from([2, 0, 40, 1, 3, 85, 84, 67, 0, 0, 0]).toString('base64url')),
		null,
	);
	// zone "UTC", N=5, no session bytes
	assert.equal(decodeGroup(Buffer.from([2, 0, 40, 5, 3, 85, 84, 67]).toString('base64url')), null);
	// zone "XXXX" is not a real IANA zone
	assert.equal(
		decodeGroup(Buffer.from([2, 0, 40, 0, 4, 88, 88, 88, 88]).toString('base64url')),
		null,
	);
});

test('decode rejects packed fields that are not real datetimes', () => {
	/** @param {number} dateWord @param {number} startMin @param {number} endMin */
	const pack = (dateWord, startMin, endMin) => {
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
	assert.equal(decodeGroup(pack(feb30, 600, 660)), null); // Feb 30 rolls over
	const month13 = ((2026 - 2000) << 9) | (13 << 5) | 1;
	assert.equal(decodeGroup(pack(month13, 600, 660)), null); // month 13
	const jan1 = ((2026 - 2000) << 9) | (1 << 5) | 1;
	assert.equal(decodeGroup(pack(jan1, 1500, 1560)), null); // minute 1500 -> hour 25
	assert.equal(decodeGroup(pack(jan1, 700, 600)), null); // end before start
});

test('decode rejects a title with a broken utf-8 tail', () => {
	// marker, target, N=0, zone "UTC", then a lone 0xC3 (incomplete 2-byte sequence)
	assert.equal(
		decodeGroup(Buffer.from([2, 0, 40, 0, 3, 85, 84, 67, 0xc3]).toString('base64url')),
		null,
	);
});

import { parseSession, parseSessions, computeProgress } from '../src/lib.js';

test('parseSession validates and computes wall-clock duration', () => {
	const s = parseSession({ date: '2026-06-18', start: '19:00', end: '22:30' });
	assert.ok(s);
	assert.equal(s.hours, 3.5);
	assert.equal(s.date, '2026-06-18');
	assert.equal(s.start, '19:00');
	assert.equal(s.end, '22:30');
	assert.ok(!('startDT' in s));
});

test('parseSessions hydrates instants and civil date in the group zone', () => {
	const [s] = parseSessions(
		[{ date: '2026-06-18', start: '19:00', end: '22:30' }],
		'Europe/Moscow',
	);
	assert.equal(s.startMs, Date.UTC(2026, 5, 18, 16, 0));
	assert.equal(s.endMs, Date.UTC(2026, 5, 18, 19, 30));
	assert.deepEqual(s.civilDate, new Date(2026, 5, 18));
});

test('parseSession rejects end <= start and garbage', () => {
	assert.equal(parseSession({ date: '2026-06-18', start: '19:00', end: '19:00' }), null);
	assert.equal(parseSession({ date: '2026-06-18', start: '19:00', end: '18:00' }), null);
	assert.equal(parseSession({ date: 'nonsense', start: '19:00', end: '20:00' }), null);
	assert.equal(parseSession({ date: '', start: '', end: '' }), null);
});

test('parseSession rejects calendar dates that would silently roll over', () => {
	assert.equal(parseSession({ date: '2026-02-30', start: '10:00', end: '11:00' }), null); // Feb 30
	assert.equal(parseSession({ date: '2026-02-29', start: '10:00', end: '11:00' }), null); // 2026 is not a leap year
	assert.equal(parseSession({ date: '2026-04-31', start: '10:00', end: '11:00' }), null); // April has 30 days
});

test('parseSession accepts a genuine leap day', () => {
	const s = parseSession({ date: '2028-02-29', start: '10:00', end: '11:00' });
	assert.ok(s);
	assert.equal(s.date, '2028-02-29');
});

test('parseSession rejects dates outside the encodable 2000-2099 century', () => {
	assert.equal(parseSession({ date: '1999-12-31', start: '10:00', end: '11:00' }), null);
	assert.equal(parseSession({ date: '2100-01-01', start: '10:00', end: '11:00' }), null);
	assert.ok(parseSession({ date: '2000-01-01', start: '10:00', end: '11:00' })); // boundary
	assert.ok(parseSession({ date: '2099-12-31', start: '10:00', end: '11:00' })); // boundary
});

test('parseSession measures wall-clock hours, unaffected by a DST transition', () => {
	// 2026-03-29 is EU spring-forward (02:00 -> 03:00): 01:30-03:30 is 2 hours on
	// the clock even though only 1 real UTC hour elapses. (Run under a DST-observing
	// TZ, e.g. TZ=Europe/Berlin, to exercise the transition.)
	const s = parseSession({ date: '2026-03-29', start: '01:30', end: '03:30' });
	assert.ok(s);
	assert.equal(s.hours, 2);
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
	assert.equal(sessions.length, 2);
	assert.equal(sessions[0].date, '2026-01-05');
	assert.equal(sessions[1].date, '2026-01-20');
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
	assert.equal(p.completedHours, 7);
	assert.equal(p.remainingHours, 3);
	assert.equal(p.percent, 70);
});

test('computeProgress overshoot: percent caps, real hours shown, remaining clamps', () => {
	const p = computeProgress(fixture, 10, Date.UTC(2026, 1, 1));
	assert.equal(p.completedHours, 12);
	assert.equal(p.remainingHours, 0);
	assert.equal(p.percent, 100);
});

test('computeProgress with zero target yields zero percent', () => {
	assert.equal(computeProgress(fixture, 0, Date.UTC(2026, 1, 1)).percent, 0);
});

import { progressSegments } from '../src/lib.js';

test('computeProgress also reports upcoming (not-yet-ended) hours', () => {
	assert.equal(computeProgress(fixture, 10, Date.UTC(2026, 0, 10)).upcomingHours, 5);
	assert.equal(computeProgress(fixture, 10, Date.UTC(2026, 1, 1)).upcomingHours, 0);
});

test('progressSegments splits done / upcoming / unplanned against the target', () => {
	assert.deepEqual(progressSegments(7, 0, 10), { donePct: 70, upcomingPct: 0 });
	assert.deepEqual(progressSegments(4, 3, 10), { donePct: 40, upcomingPct: 30 });
});

test('progressSegments clamps overshoot so the bar never exceeds 100%', () => {
	assert.deepEqual(progressSegments(12, 0, 10), { donePct: 100, upcomingPct: 0 });
	assert.deepEqual(progressSegments(7, 6, 10), { donePct: 70, upcomingPct: 30 });
});

test('progressSegments is all zero with no target', () => {
	assert.deepEqual(progressSegments(5, 5, 0), { donePct: 0, upcomingPct: 0 });
});

import { findNextSession } from '../src/lib.js';

test('findNextSession picks the earliest not-yet-ended session', () => {
	const next = findNextSession(fixture, Date.UTC(2026, 0, 6));
	assert.ok(next);
	assert.equal(next.session.date, '2026-01-07');
	assert.equal(next.inProgress, false);
});

test('findNextSession flags a session running right now', () => {
	const next = findNextSession(fixture, Date.UTC(2026, 0, 20, 11, 0));
	assert.ok(next);
	assert.equal(next.session.date, '2026-01-20');
	assert.equal(next.inProgress, true);
});

test('findNextSession returns null when everything ended or list is empty', () => {
	assert.equal(findNextSession(fixture, Date.UTC(2026, 1, 1)), null);
	assert.equal(findNextSession([], Date.UTC(2026, 0, 1)), null);
});

import { weekStartOf, weeklyBuckets } from '../src/lib.js';

test('weekStartOf snaps to Monday', () => {
	assert.deepEqual(weekStartOf(new Date(2026, 5, 18)), new Date(2026, 5, 15)); // Thu -> Mon
	assert.deepEqual(weekStartOf(new Date(2026, 5, 21)), new Date(2026, 5, 15)); // Sun -> Mon
	assert.deepEqual(weekStartOf(new Date(2026, 5, 15)), new Date(2026, 5, 15)); // Mon stays
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
	assert.equal(buckets.length, 3);
	assert.deepEqual(
		buckets.map((b) => [b.doneHours, b.upcomingHours]),
		[
			[3, 0],
			[0, 0],
			[0, 4],
		],
	);
	assert.deepEqual(buckets[0].weekStart, new Date(2026, 5, 1));
	assert.deepEqual(buckets[1].weekStart, new Date(2026, 5, 8));
	assert.deepEqual(buckets[2].weekStart, new Date(2026, 5, 15));
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
	assert.equal(buckets.length, 1);
	assert.deepEqual([buckets[0].doneHours, buckets[0].upcomingHours], [2, 3]);
});

test('weeklyBuckets counts a session ending in the future as upcoming even in the current week', () => {
	// the exact shape of the reported bug: today Tue, session Thu same week
	const sessions = parseSessions([{ date: '2026-07-23', start: '12:00', end: '15:00' }], 'UTC');
	const buckets = weeklyBuckets(sessions, Date.UTC(2026, 6, 21, 12, 0)); // Tue 21 Jul
	assert.deepEqual([buckets[0].doneHours, buckets[0].upcomingHours], [0, 3]);
});

test('weeklyBuckets of nothing is empty', () => {
	assert.deepEqual(weeklyBuckets([], Date.now()), []);
});

test('weeklyBuckets keys weeks by the group-zone civil date, not the viewer', () => {
	// Sunday 21:00 Moscow — a late-Sunday session belongs to Sunday's week even
	// for a viewer who experiences it as Monday morning
	const sessions = parseSessions(
		[{ date: '2026-06-14', start: '21:00', end: '23:00' }],
		'Europe/Moscow',
	);
	const buckets = weeklyBuckets(sessions, Date.UTC(2026, 5, 1)); // before it -> upcoming
	assert.equal(buckets.length, 1);
	assert.deepEqual(buckets[0].weekStart, new Date(2026, 5, 8)); // Mon of the week of Sun Jun 14
	assert.deepEqual([buckets[0].doneHours, buckets[0].upcomingHours], [0, 2]);
});

import { nowWeekIndex } from '../src/lib.js';

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
	assert.equal(nowWeekIndex(buckets, new Date(2026, 5, 10)), 1);
	assert.equal(nowWeekIndex(buckets, new Date(2026, 4, 1)), null);
	assert.equal(nowWeekIndex(buckets, new Date(2026, 7, 1)), null);
	assert.equal(nowWeekIndex([], new Date(2026, 5, 10)), null);
});

import {
	formatDateShort,
	formatDateLong,
	formatMonth,
	formatWeekRange,
	formatHoursNum,
} from '../src/lib.js';

test('dates render spelled out, never numeric-ambiguous', () => {
	const thu = new Date(2026, 5, 18);
	assert.equal(formatDateShort(thu, 'en'), 'Thu 18 Jun');
	assert.equal(formatDateShort(thu, 'ru'), 'чт, 18 июн.');
	const jul = new Date(2026, 6, 23);
	assert.equal(formatDateLong(jul, 'en'), 'Thursday 23 July');
	assert.equal(formatDateLong(jul, 'ru'), 'четверг, 23 июля');
	assert.equal(formatMonth(thu, 'en'), 'Jun');
});

test('week ranges span monday to sunday, localised', () => {
	assert.equal(formatWeekRange(new Date(2026, 7, 17), 'en'), '17 – 23 Aug');
	assert.equal(formatWeekRange(new Date(2026, 7, 17), 'ru'), '17–23 авг.');
	// a week crossing a month boundary names both months
	assert.equal(formatWeekRange(new Date(2026, 5, 29), 'en'), '29 Jun – 5 Jul');
	assert.equal(formatWeekRange(new Date(2026, 5, 29), 'ru'), '29 июн. – 5 июл.');
});

test('hours localise decimal separators', () => {
	assert.equal(formatHoursNum(28.5, 'en'), '28.5');
	assert.equal(formatHoursNum(28.5, 'ru'), '28,5');
	assert.equal(formatHoursNum(4, 'en'), '4');
});

test('formatted hours use a plain space, not NBSP, as the ru group separator', () => {
	const out = formatHoursNum(1200, 'ru');
	assert.equal(out, '1 200');
	assert.doesNotMatch(out, /[\u00a0\u202f]/); // no NBSP / narrow NBSP the engines disagree on
});

import { zonedToInstant, zonedCivilDate, formatOffsetTag, formatLocalTime } from '../src/lib.js';

test('zonedToInstant maps wall-clock in a zone to a UTC instant (machine-TZ-independent)', () => {
	// asserted against Date.UTC(...), so these hold under any host TZ
	assert.equal(
		zonedToInstant({ y: 2026, mo: 6, d: 18, h: 19, mi: 0 }, 'Europe/Moscow'),
		Date.UTC(2026, 5, 18, 16, 0), // Moscow is UTC+3, no DST
	);
	assert.equal(
		zonedToInstant({ y: 2026, mo: 1, d: 15, h: 9, mi: 0 }, 'America/New_York'),
		Date.UTC(2026, 0, 15, 14, 0), // EST, UTC-5
	);
	assert.equal(
		zonedToInstant({ y: 2026, mo: 7, d: 15, h: 9, mi: 0 }, 'America/New_York'),
		Date.UTC(2026, 6, 15, 13, 0), // EDT, UTC-4
	);
});

test('zonedToInstant is correct on both sides of a DST transition', () => {
	// Europe/London springs forward 2026-03-29 01:00 GMT -> 02:00 BST
	assert.equal(
		zonedToInstant({ y: 2026, mo: 3, d: 29, h: 0, mi: 30 }, 'Europe/London'),
		Date.UTC(2026, 2, 29, 0, 30), // still GMT (UTC+0)
	);
	assert.equal(
		zonedToInstant({ y: 2026, mo: 3, d: 29, h: 3, mi: 0 }, 'Europe/London'),
		Date.UTC(2026, 2, 29, 2, 0), // now BST (UTC+1)
	);
});

test('zonedCivilDate expresses an instant as the group-zone civil date', () => {
	// 20:00 UTC on Jun 14 is 23:00 Moscow (same day)
	assert.deepEqual(
		zonedCivilDate(new Date(Date.UTC(2026, 5, 14, 20, 0)), 'Europe/Moscow'),
		new Date(2026, 5, 14),
	);
	// 22:00 UTC on Jun 14 is 01:00 Moscow the next day
	assert.deepEqual(
		zonedCivilDate(new Date(Date.UTC(2026, 5, 14, 22, 0)), 'Europe/Moscow'),
		new Date(2026, 5, 15),
	);
});

test('formatOffsetTag renders the zone offset', () => {
	assert.equal(formatOffsetTag(Date.UTC(2026, 5, 18, 16, 0), 'Europe/Moscow', 'en'), 'GMT+3');
	assert.equal(formatOffsetTag(Date.UTC(2026, 0, 15, 14, 0), 'America/New_York', 'en'), 'GMT-5');
});

test('formatLocalTime renders HH:MM', () => {
	// value is viewer-local (host-dependent); assert only the shape here \u2014 the
	// localised value is asserted in e2e where the browser timezone is pinned
	assert.match(formatLocalTime(Date.UTC(2026, 5, 18, 16, 0), 'en'), /^\d{2}:\d{2}$/);
});
