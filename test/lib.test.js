import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeGroup, decodeGroup } from '../src/lib.js';

/** @type {import('../src/lib.js').GroupData} */
const group = {
	title: 'Группа «Вторник» ~_.%',
	targetHours: 41.5,
	sessions: [
		{ date: '2026-06-02', start: '19:00', end: '22:30' },
		{ date: '2026-08-09', start: '08:00', end: '16:00' },
	],
};

test('codec round-trips cyrillic and separator characters', () => {
	assert.deepEqual(decodeGroup(encodeGroup(group)), group);
});

test('payload is compact and fragment-safe', () => {
	const payload = encodeGroup(group);
	assert.match(payload, /^2~41\.5~260602\.1900\.2230_260809\.0800\.1600~/);
	assert.doesNotMatch(payload, /[^A-Za-z0-9~._%!*'()-]/);
});

test('empty sessions encode to an empty field', () => {
	const decoded = decodeGroup(encodeGroup({ ...group, sessions: [] }));
	assert.ok(decoded);
	assert.deepEqual(decoded.sessions, []);
});

test('decode returns null on malformed payloads', () => {
	assert.equal(decodeGroup('garbage'), null);
	assert.equal(decodeGroup('eyJ2IjoxfQ'), null); // old v1 base64url blob
	assert.equal(decodeGroup('1~10~~t'), null); // unknown version
	assert.equal(decodeGroup('2~10'), null); // missing fields
	assert.equal(decodeGroup('2~~260602.1900.2230~t'), null); // empty target
	assert.equal(decodeGroup('2~1e999~260602.1900.2230~t'), null); // non-finite target
	assert.equal(decodeGroup('2~-5~260602.1900.2230~t'), null); // negative target
	assert.equal(decodeGroup('2~10~26060.1900.2230~t'), null); // short date token
	assert.equal(decodeGroup('2~10~260602.1900~t'), null); // missing end time
	assert.equal(decodeGroup('2~10~~%E0%A4%A'), null); // broken percent-encoding
});

import { parseSession, parseSessions, computeProgress } from '../src/lib.js';

test('parseSession computes local datetimes and duration', () => {
	const s = parseSession({ date: '2026-06-18', start: '19:00', end: '22:30' });
	assert.ok(s);
	assert.equal(s.hours, 3.5);
	assert.deepEqual(s.startDT, new Date(2026, 5, 18, 19, 0));
	assert.deepEqual(s.endDT, new Date(2026, 5, 18, 22, 30));
});

test('parseSession rejects end <= start and garbage', () => {
	assert.equal(parseSession({ date: '2026-06-18', start: '19:00', end: '19:00' }), null);
	assert.equal(parseSession({ date: '2026-06-18', start: '19:00', end: '18:00' }), null);
	assert.equal(parseSession({ date: 'nonsense', start: '19:00', end: '20:00' }), null);
	assert.equal(parseSession({ date: '', start: '', end: '' }), null);
});

test('parseSessions drops invalid entries and sorts chronologically', () => {
	const sessions = parseSessions([
		{ date: '2026-01-20', start: '10:00', end: '15:00' },
		{ date: 'broken', start: '10:00', end: '11:00' },
		{ date: '2026-01-05', start: '10:00', end: '13:00' },
	]);
	assert.equal(sessions.length, 2);
	assert.equal(sessions[0].date, '2026-01-05');
	assert.equal(sessions[1].date, '2026-01-20');
});

const fixture = parseSessions([
	{ date: '2026-01-05', start: '10:00', end: '13:00' }, // 3 h
	{ date: '2026-01-07', start: '10:00', end: '14:00' }, // 4 h
	{ date: '2026-01-20', start: '10:00', end: '15:00' }, // 5 h
]);

test('computeProgress counts only ended sessions', () => {
	const p = computeProgress(fixture, 10, new Date(2026, 0, 10));
	assert.equal(p.completedHours, 7);
	assert.equal(p.remainingHours, 3);
	assert.equal(p.percent, 70);
});

test('computeProgress overshoot: percent caps, real hours shown, remaining clamps', () => {
	const p = computeProgress(fixture, 10, new Date(2026, 1, 1));
	assert.equal(p.completedHours, 12);
	assert.equal(p.remainingHours, 0);
	assert.equal(p.percent, 100);
});

test('computeProgress with zero target yields zero percent', () => {
	assert.equal(computeProgress(fixture, 0, new Date(2026, 1, 1)).percent, 0);
});

import { findNextSession } from '../src/lib.js';

test('findNextSession picks the earliest not-yet-ended session', () => {
	const next = findNextSession(fixture, new Date(2026, 0, 6));
	assert.ok(next);
	assert.equal(next.session.date, '2026-01-07');
	assert.equal(next.inProgress, false);
});

test('findNextSession flags a session running right now', () => {
	const next = findNextSession(fixture, new Date(2026, 0, 20, 11, 0));
	assert.ok(next);
	assert.equal(next.session.date, '2026-01-20');
	assert.equal(next.inProgress, true);
});

test('findNextSession returns null when everything ended or list is empty', () => {
	assert.equal(findNextSession(fixture, new Date(2026, 1, 1)), null);
	assert.equal(findNextSession([], new Date(2026, 0, 1)), null);
});

import { weekStartOf, weeklyBuckets } from '../src/lib.js';

test('weekStartOf snaps to Monday', () => {
	assert.deepEqual(weekStartOf(new Date(2026, 5, 18)), new Date(2026, 5, 15)); // Thu -> Mon
	assert.deepEqual(weekStartOf(new Date(2026, 5, 21)), new Date(2026, 5, 15)); // Sun -> Mon
	assert.deepEqual(weekStartOf(new Date(2026, 5, 15)), new Date(2026, 5, 15)); // Mon stays
});

test('weeklyBuckets spans first..last week, keeps empty weeks, splits by now', () => {
	const sessions = parseSessions([
		{ date: '2026-06-02', start: '19:00', end: '22:00' }, // Tue, week of Jun 1, 3 h
		{ date: '2026-06-18', start: '19:00', end: '23:00' }, // Thu, week of Jun 15, 4 h
	]);
	const buckets = weeklyBuckets(sessions, new Date(2026, 5, 10, 12, 0)); // Wed, week of Jun 8
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
	const sessions = parseSessions([
		{ date: '2026-06-08', start: '10:00', end: '12:00' }, // Mon, 2 h — ended
		{ date: '2026-06-12', start: '10:00', end: '13:00' }, // Fri, 3 h — upcoming
	]);
	const buckets = weeklyBuckets(sessions, new Date(2026, 5, 10, 12, 0)); // Wed same week
	assert.equal(buckets.length, 1);
	assert.deepEqual([buckets[0].doneHours, buckets[0].upcomingHours], [2, 3]);
});

test('weeklyBuckets counts a session ending in the future as upcoming even in the current week', () => {
	// the exact shape of the reported bug: today Tue, session Thu same week
	const sessions = parseSessions([{ date: '2026-07-23', start: '12:00', end: '15:00' }]);
	const buckets = weeklyBuckets(sessions, new Date(2026, 6, 21, 12, 0)); // Tue 21 Jul
	assert.deepEqual([buckets[0].doneHours, buckets[0].upcomingHours], [0, 3]);
});

test('weeklyBuckets of nothing is empty', () => {
	assert.deepEqual(weeklyBuckets([], new Date()), []);
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
