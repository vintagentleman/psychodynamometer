import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeGroup, decodeGroup } from '../src/lib.js';

/** @type {import('../src/lib.js').GroupData} */
const cyrillic = {
	v: 1,
	title: 'Группа «Вторник»',
	targetHours: 41.5,
	sessions: [{ date: '2026-06-02', start: '19:00', end: '22:30' }],
};

test('codec round-trips cyrillic data', () => {
	assert.deepEqual(decodeGroup(encodeGroup(cyrillic)), cyrillic);
});

test('encoded payload is url-safe (no +, /, =)', () => {
	assert.match(encodeGroup(cyrillic), /^[A-Za-z0-9_-]+$/);
});

test('decode returns null on garbage', () => {
	assert.equal(decodeGroup('%%%not-base64%%%'), null);
});

test('decode returns null on valid base64 of non-JSON', () => {
	assert.equal(decodeGroup(btoa('not json')), null);
});

test('decode returns null on wrong shape', () => {
	assert.equal(decodeGroup(btoa(JSON.stringify({ v: 1 }))), null);
});

test('decode returns null on unknown version', () => {
	assert.equal(decodeGroup(encodeGroup(/** @type {*} */ ({ ...cyrillic, v: 2 }))), null);
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

test('weeklyBuckets spans first..last week, keeps empty weeks, tags status', () => {
	const sessions = parseSessions([
		{ date: '2026-06-02', start: '19:00', end: '22:00' }, // Tue, week of Jun 1, 3 h
		{ date: '2026-06-18', start: '19:00', end: '23:00' }, // Thu, week of Jun 15, 4 h
	]);
	const buckets = weeklyBuckets(sessions, new Date(2026, 5, 10, 12, 0)); // Wed, week of Jun 8
	assert.equal(buckets.length, 3);
	assert.deepEqual(
		buckets.map((b) => b.hours),
		[3, 0, 4],
	);
	assert.deepEqual(
		buckets.map((b) => b.status),
		['past', 'current', 'future'],
	);
	assert.deepEqual(buckets[0].weekStart, new Date(2026, 5, 1));
	assert.deepEqual(buckets[1].weekStart, new Date(2026, 5, 8));
	assert.deepEqual(buckets[2].weekStart, new Date(2026, 5, 15));
});

test('weeklyBuckets of nothing is empty', () => {
	assert.deepEqual(weeklyBuckets([], new Date()), []);
});

import { formatDateShort, formatDateLong, formatMonth, formatHoursNum } from '../src/lib.js';

test('dates render spelled out, never numeric-ambiguous', () => {
	const thu = new Date(2026, 5, 18);
	assert.equal(formatDateShort(thu, 'en'), 'Thu 18 Jun');
	assert.equal(formatDateShort(thu, 'ru'), 'чт, 18 июн.');
	const jul = new Date(2026, 6, 23);
	assert.equal(formatDateLong(jul, 'en'), 'Thursday 23 July');
	assert.equal(formatDateLong(jul, 'ru'), 'четверг, 23 июля');
	assert.equal(formatMonth(thu, 'en'), 'Jun');
});

test('hours localise decimal separators', () => {
	assert.equal(formatHoursNum(28.5, 'en'), '28.5');
	assert.equal(formatHoursNum(28.5, 'ru'), '28,5');
	assert.equal(formatHoursNum(4, 'en'), '4');
});
