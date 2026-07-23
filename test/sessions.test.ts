import { expect, test } from 'vitest';

import {
	computeProgress,
	findNextSession,
	isBlankInput,
	isComplete,
	nowWeekIndex,
	parseSession,
	parseSessions,
	progressSegments,
	shareableGroup,
	weeklyBuckets,
	weekStartOf,
} from '../src/lib/sessions.ts';

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

test('computeProgress also reports upcoming (not-yet-ended) hours', () => {
	expect(computeProgress(fixture, 10, Date.UTC(2026, 0, 10)).upcomingHours).toBe(5);
	expect(computeProgress(fixture, 10, Date.UTC(2026, 1, 1)).upcomingHours).toBe(0);
});

test('computeProgress reports planned hours and the signed schedule delta', () => {
	// fixture is 12 h planned (3 + 4 + 5)
	const over = computeProgress(fixture, 10, Date.UTC(2026, 0, 10)); // 12 vs 10 -> over-fill
	expect(over.plannedHours).toBe(12);
	expect(over.scheduleDelta).toBe(-2);
	const under = computeProgress(fixture, 15, Date.UTC(2026, 0, 10)); // 12 vs 15 -> under-fill
	expect(under.plannedHours).toBe(12);
	expect(under.scheduleDelta).toBe(3);
	expect(computeProgress(fixture, 12, Date.UTC(2026, 0, 10)).scheduleDelta).toBe(0); // exact
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

test('weekStartOf snaps to Monday', () => {
	expect(weekStartOf(new Date(2026, 5, 18))).toEqual(new Date(2026, 5, 15)); // Thu -> Mon
	expect(weekStartOf(new Date(2026, 5, 21))).toEqual(new Date(2026, 5, 15)); // Sun -> Mon
	expect(weekStartOf(new Date(2026, 5, 15))).toEqual(new Date(2026, 5, 15)); // Mon stays
});

// Jun 2 (Tue, wk of Jun 1) + Jun 18 (Thu, wk of Jun 15), seen Wed Jun 10 —
// three weekly buckets spanning the weeks of Jun 1 / Jun 8 / Jun 15.
const juneWeeks = weeklyBuckets(
	parseSessions(
		[
			{ date: '2026-06-02', start: '19:00', end: '22:00' }, // 3 h, ended
			{ date: '2026-06-18', start: '19:00', end: '23:00' }, // 4 h, upcoming
		],
		'UTC',
	),
	Date.UTC(2026, 5, 10, 12, 0),
);

test('weeklyBuckets spans first..last week, keeps empty weeks, splits by now', () => {
	expect(juneWeeks.length).toBe(3);
	expect(juneWeeks.map((b) => [b.doneHours, b.upcomingHours])).toEqual([
		[3, 0],
		[0, 0],
		[0, 4],
	]);
	expect(juneWeeks[0].weekStart).toEqual(new Date(2026, 5, 1));
	expect(juneWeeks[1].weekStart).toEqual(new Date(2026, 5, 8));
	expect(juneWeeks[2].weekStart).toEqual(new Date(2026, 5, 15));
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

test('nowWeekIndex finds the bucket that contains now, else null', () => {
	expect(nowWeekIndex(juneWeeks, new Date(2026, 5, 10))).toBe(1);
	expect(nowWeekIndex(juneWeeks, new Date(2026, 4, 1))).toBeNull();
	expect(nowWeekIndex(juneWeeks, new Date(2026, 7, 1))).toBeNull();
	expect(nowWeekIndex([], new Date(2026, 5, 10))).toBeNull();
});

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
