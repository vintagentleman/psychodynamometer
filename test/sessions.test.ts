import { expect, test } from 'vitest';

import { MAX_SESSIONS, MAX_TARGET_HOURS } from '../src/lib/limits.ts';
import {
	computeProgress,
	cumulativePercents,
	encodabilityError,
	findNextSession,
	isBlankInput,
	isComplete,
	nowWeekIndex,
	parseSession,
	parseSessions,
	progressSegments,
	shareableGroup,
	sortSessionInputs,
	weeklyBuckets,
	weekStartOf,
} from '../src/lib/sessions.ts';
import { Temporal } from '../src/lib/temporal.ts';

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
	expect(s.startZdt.epochMilliseconds).toBe(Date.UTC(2026, 5, 18, 16, 0));
	expect(s.endZdt.epochMilliseconds).toBe(Date.UTC(2026, 5, 18, 19, 30));
	expect(s.civilDate.toString()).toBe('2026-06-18');
});

test('instants are correct on both sides of a DST transition', () => {
	// Europe/London springs forward 2026-03-29 01:00 GMT -> 02:00 BST
	const [gmt] = parseSessions(
		[{ date: '2026-03-29', start: '00:30', end: '01:00' }],
		'Europe/London',
	);
	expect(gmt.startZdt.epochMilliseconds).toBe(Date.UTC(2026, 2, 29, 0, 30));
	const [bst] = parseSessions(
		[{ date: '2026-03-29', start: '03:00', end: '04:00' }],
		'Europe/London',
	);
	expect(bst.startZdt.epochMilliseconds).toBe(Date.UTC(2026, 2, 29, 2, 0));
});

test('parseSession rejects a zero-length session and garbage', () => {
	expect(parseSession({ date: '2026-06-18', start: '19:00', end: '19:00' })).toBeNull();
	expect(parseSession({ date: '2026-06-18', start: '19:00', end: '25:00' })).toBeNull();
	expect(parseSession({ date: 'nonsense', start: '19:00', end: '20:00' })).toBeNull();
	expect(parseSession({ date: '', start: '', end: '' })).toBeNull();
});

test('parseSession reads an end before the start as ending the next day', () => {
	const s = parseSession({ date: '2026-06-18', start: '22:00', end: '01:00' });
	expect(s?.hours).toBe(3);
	expect(s?.nextDay).toBe(true);
	// the far edge: 19:00 to 18:00 is 23 hours, not an error
	expect(parseSession({ date: '2026-06-18', start: '19:00', end: '18:00' })?.hours).toBe(23);
});

test('parseSession marks a same-day session nextDay false', () => {
	expect(parseSession({ date: '2026-06-18', start: '19:00', end: '22:30' })?.nextDay).toBe(false);
});

test('parseSessions puts an overnight end on the following calendar day', () => {
	const [s] = parseSessions([{ date: '2026-06-18', start: '22:00', end: '01:00' }], 'UTC');
	expect(s.startZdt.epochMilliseconds).toBe(Date.UTC(2026, 5, 18, 22, 0));
	expect(s.endZdt.epochMilliseconds).toBe(Date.UTC(2026, 5, 19, 1, 0));
	expect(s.civilDate.toString()).toBe('2026-06-18'); // civilDate is the start date
});

test('parseSessions rolls an overnight end over a month and a year boundary', () => {
	const [aug] = parseSessions([{ date: '2026-08-31', start: '22:00', end: '01:00' }], 'UTC');
	expect(aug.endZdt.epochMilliseconds).toBe(Date.UTC(2026, 8, 1, 1, 0));
	const [dec] = parseSessions([{ date: '2026-12-31', start: '22:00', end: '01:00' }], 'UTC');
	expect(dec.endZdt.epochMilliseconds).toBe(Date.UTC(2027, 0, 1, 1, 0));
});

test('an overnight session spanning a DST transition keeps its wall-clock hours', () => {
	// Europe/Berlin springs forward 02:00 -> 03:00 on 2026-03-29, so 23:00-03:00
	// is 4 hours on the clock but only 3 real hours.
	const [s] = parseSessions(
		[{ date: '2026-03-28', start: '23:00', end: '03:00' }],
		'Europe/Berlin',
	);
	expect(s.hours).toBe(4);
	expect(s.endZdt.epochMilliseconds - s.startZdt.epochMilliseconds).toBe(3 * 3_600_000);
});

test('weeklyBuckets counts an overnight session in the week it began', () => {
	// Sunday 2026-06-21 22:00 -> Monday 2026-06-22 01:00, keyed to the Sunday's week.
	const sessions = parseSessions([{ date: '2026-06-21', start: '22:00', end: '01:00' }], 'UTC');
	const buckets = weeklyBuckets(sessions, Date.UTC(2026, 5, 1)); // now: before the session
	expect(buckets).toHaveLength(1);
	expect(buckets[0].weekStart.toString()).toBe('2026-06-15'); // Monday of that week
	expect(buckets[0].upcomingHours).toBe(3);
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
});

test('computeProgress overshoot: real hours shown, remaining clamps', () => {
	const p = computeProgress(fixture, 10, Date.UTC(2026, 1, 1));
	expect(p.completedHours).toBe(12);
	expect(p.remainingHours).toBe(0);
});

test('computeProgress also reports upcoming (not-yet-ended) hours', () => {
	expect(computeProgress(fixture, 10, Date.UTC(2026, 0, 10)).upcomingHours).toBe(5);
	expect(computeProgress(fixture, 10, Date.UTC(2026, 1, 1)).upcomingHours).toBe(0);
});

test('computeProgress reports the signed schedule delta', () => {
	// fixture is 12 h planned (3 + 4 + 5)
	expect(computeProgress(fixture, 10, Date.UTC(2026, 0, 10)).scheduleDelta).toBe(-2); // over-fill
	expect(computeProgress(fixture, 15, Date.UTC(2026, 0, 10)).scheduleDelta).toBe(3); // under-fill
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

test('progressSegments with zero target yields empty segments', () => {
	expect(progressSegments(12, 0, 0)).toEqual({ donePct: 0, upcomingPct: 0 });
});

test('progressSegments is all zero with no target', () => {
	expect(progressSegments(5, 5, 0)).toEqual({ donePct: 0, upcomingPct: 0 });
});

test('cumulativePercents tracks running progress after each session', () => {
	// precursor fixture: per-session hours summing to 40.5 against a 41.5 target
	const precursor = parseSessions(
		[
			{ date: '2026-06-02', start: '19:00', end: '22:30' }, // 3.5 -> 3.5
			{ date: '2026-06-09', start: '20:00', end: '23:00' }, // 3.0 -> 6.5
			{ date: '2026-06-18', start: '19:00', end: '23:00' }, // 4.0 -> 10.5
			{ date: '2026-06-25', start: '19:00', end: '22:30' }, // 3.5 -> 14.0
			{ date: '2026-06-30', start: '19:00', end: '22:30' }, // 3.5 -> 17.5
			{ date: '2026-07-16', start: '19:00', end: '21:00' }, // 2.0 -> 19.5
			{ date: '2026-07-18', start: '09:00', end: '12:00' }, // 3.0 -> 22.5
			{ date: '2026-07-23', start: '18:00', end: '21:00' }, // 3.0 -> 25.5
			{ date: '2026-07-28', start: '18:00', end: '21:00' }, // 3.0 -> 28.5
			{ date: '2026-08-04', start: '18:00', end: '22:00' }, // 4.0 -> 32.5
			{ date: '2026-08-09', start: '08:00', end: '16:00' }, // 8.0 -> 40.5
		],
		'UTC',
	);
	expect(cumulativePercents(precursor, 41.5)).toEqual([8, 16, 25, 34, 42, 47, 54, 61, 69, 78, 98]);
});

test('cumulativePercents does not clamp an over-filled plan', () => {
	// fixture = 3h,4h,5h = 12h; against target 10 the tail exceeds 100%
	expect(cumulativePercents(fixture, 10)).toEqual([30, 70, 120]);
});

test('cumulativePercents is empty for no target or no sessions', () => {
	expect(cumulativePercents(fixture, 0)).toEqual([]);
	expect(cumulativePercents([], 10)).toEqual([]);
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
	const monday = (d: string) => weekStartOf(Temporal.PlainDate.from(d)).toString();
	expect(monday('2026-06-18')).toBe('2026-06-15'); // Thu -> Mon
	expect(monday('2026-06-21')).toBe('2026-06-15'); // Sun -> Mon
	expect(monday('2026-06-15')).toBe('2026-06-15'); // Mon stays
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
	expect(juneWeeks[0].weekStart.toString()).toBe('2026-06-01');
	expect(juneWeeks[1].weekStart.toString()).toBe('2026-06-08');
	expect(juneWeeks[2].weekStart.toString()).toBe('2026-06-15');
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
	expect(buckets[0].weekStart.toString()).toBe('2026-06-08'); // Mon of the week of Sun Jun 14
	expect([buckets[0].doneHours, buckets[0].upcomingHours]).toEqual([0, 2]);
});

test('nowWeekIndex finds the bucket that contains now, else -1', () => {
	expect(nowWeekIndex(juneWeeks, Temporal.PlainDate.from('2026-06-10'))).toBe(1);
	expect(nowWeekIndex(juneWeeks, Temporal.PlainDate.from('2026-05-01'))).toBe(-1);
	expect(nowWeekIndex(juneWeeks, Temporal.PlainDate.from('2026-08-01'))).toBe(-1);
	expect(nowWeekIndex([], Temporal.PlainDate.from('2026-06-10'))).toBe(-1);
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

test('isComplete needs only a valid session — title and target are optional', () => {
	expect(isComplete(draft)).toBe(true);
	expect(isComplete({ ...draft, title: '' })).toBe(true);
	expect(isComplete({ ...draft, title: '  ' })).toBe(true);
	expect(isComplete({ ...draft, targetHours: 0 })).toBe(true);
	expect(isComplete({ ...draft, sessions: [] })).toBe(false);
	expect(
		isComplete({ ...draft, sessions: [{ date: '2026-01-05', start: '10:00', end: '10:00' }] }),
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
		sessions: [...draft.sessions, { date: '2026-02-01', start: '10:00', end: '10:00' }],
	};
	expect(shareableGroup(bad)).toBeNull();
});

test('shareableGroup returns null when there are no valid sessions', () => {
	expect(shareableGroup({ ...draft, sessions: [] })).toBeNull();
});

test('shareableGroup keeps an untitled group — the title is optional', () => {
	expect(shareableGroup({ ...draft, title: '' })?.title).toBe('');
});

test('shareableGroup keeps a zero-target group — the target is optional', () => {
	expect(shareableGroup({ ...draft, targetHours: 0 })?.targetHours).toBe(0);
});

test('sortSessionInputs orders by date, then start, then end', () => {
	const out = sortSessionInputs([
		{ date: '2026-06-18', start: '19:00', end: '23:00' },
		{ date: '2026-06-02', start: '19:00', end: '22:30' },
		{ date: '2026-06-18', start: '09:00', end: '12:00' },
		{ date: '2026-06-18', start: '19:00', end: '20:00' },
	]);
	expect(out.map((s) => `${s.date} ${s.start}-${s.end}`)).toEqual([
		'2026-06-02 19:00-22:30',
		'2026-06-18 09:00-12:00',
		'2026-06-18 19:00-20:00',
		'2026-06-18 19:00-23:00',
	]);
});

test('sortSessionInputs returns a new array and does not mutate the input', () => {
	const input = [
		{ date: '2026-06-09', start: '20:00', end: '23:00' },
		{ date: '2026-06-02', start: '19:00', end: '22:30' },
	];
	const out = sortSessionInputs(input);
	expect(out).not.toBe(input);
	expect(input[0].date).toBe('2026-06-09');
	expect(input[1].date).toBe('2026-06-02');
});

test('sortSessionInputs sorts blank and partial rows predictably, dropping none', () => {
	const out = sortSessionInputs([
		{ date: '2026-06-02', start: '19:00', end: '22:30' },
		{ date: '', start: '', end: '' },
		{ date: '2026-06-01', start: '', end: '' },
	]);
	expect(out).toHaveLength(3);
	expect(out.map((s) => s.date)).toEqual(['', '2026-06-01', '2026-06-02']);
});

const manyRows = (n: number) =>
	Array.from({ length: n }, (_, i) => ({
		date: `2026-${String(Math.floor(i / 28) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
		start: '10:00',
		end: '11:00',
	}));

test('encodabilityError passes a clean draft', () => {
	expect(encodabilityError(draft)).toBeNull();
	expect(encodabilityError({ ...draft, targetHours: 0 })).toBeNull();
});

test('encodabilityError reports an unparseable non-blank row, ignoring blanks', () => {
	expect(
		encodabilityError({
			...draft,
			sessions: [...draft.sessions, { date: '2026-02-01', start: '10:00', end: '10:00' }],
		}),
	).toBe('rows');
	expect(
		encodabilityError({
			...draft,
			sessions: [...draft.sessions, { date: '', start: '', end: '' }],
		}),
	).toBeNull();
});

test('encodabilityError guards the target against the 16-bit half-hour field', () => {
	expect(encodabilityError({ ...draft, targetHours: MAX_TARGET_HOURS })).toBeNull();
	expect(encodabilityError({ ...draft, targetHours: MAX_TARGET_HOURS + 0.5 })).toBe('target');
	expect(encodabilityError({ ...draft, targetHours: 40000 })).toBe('target');
	// defensive: readForm clamps these away before they can reach here
	expect(encodabilityError({ ...draft, targetHours: -0.5 })).toBe('target');
	expect(encodabilityError({ ...draft, targetHours: Number.NaN })).toBe('target');
});

test('encodabilityError guards the count against the one-byte session field', () => {
	expect(encodabilityError({ ...draft, sessions: manyRows(MAX_SESSIONS) })).toBeNull();
	expect(encodabilityError({ ...draft, sessions: manyRows(MAX_SESSIONS + 1) })).toBe('count');
	// blank rows are not sessions, so they do not push a full draft over the cap
	expect(
		encodabilityError({
			...draft,
			sessions: [...manyRows(MAX_SESSIONS), { date: '', start: '', end: '' }],
		}),
	).toBeNull();
});

test('encodabilityError reports rows before the target', () => {
	expect(
		encodabilityError({
			...draft,
			targetHours: 40000,
			sessions: [{ date: '2026-02-01', start: '10:00', end: '10:00' }],
		}),
	).toBe('rows');
});

test('shareableGroup refuses a draft the codec cannot carry', () => {
	expect(shareableGroup({ ...draft, targetHours: 40000 })).toBeNull();
	expect(shareableGroup({ ...draft, targetHours: -5 })).toBeNull();
	expect(shareableGroup({ ...draft, sessions: manyRows(MAX_SESSIONS + 1) })).toBeNull();
	expect(shareableGroup({ ...draft, sessions: manyRows(MAX_SESSIONS) })?.sessions.length).toBe(
		MAX_SESSIONS,
	);
});
