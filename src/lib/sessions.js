import { zonedToInstant } from './tz.js';

/** @typedef {{ date: string, start: string, end: string }} SessionInput */
/** @typedef {{ title: string, targetHours: number, timeZone: string, sessions: SessionInput[] }} GroupData */
/** @typedef {SessionInput & { hours: number, civilDate: Date, startMs: number, endMs: number }} Session */
/** @typedef {{ weekStart: Date, doneHours: number, upcomingHours: number }} WeekBucket */

/** @param {Session} a @param {Session} b */
const byStart = (a, b) => a.startMs - b.startMs;

/**
 * Validate raw input and compute its wall-clock duration. Zone-independent:
 * calendar/time validity does not depend on the group's timezone.
 * @param {SessionInput} input
 * @returns {{ date: string, start: string, end: string, hours: number } | null}
 */
export function parseSession(input) {
	const startDT = new Date(`${input.date}T${input.start}`);
	const endDT = new Date(`${input.date}T${input.end}`);
	if (Number.isNaN(startDT.getTime()) || Number.isNaN(endDT.getTime()) || endDT <= startDT) {
		return null;
	}
	// Reject silent date rollovers (2026-02-30 -> Mar 2) and years the 2-digit hash can't hold.
	const [year, month, day] = input.date.split('-').map(Number);
	if (
		year < 2000 ||
		year > 2099 ||
		startDT.getFullYear() !== year ||
		startDT.getMonth() + 1 !== month ||
		startDT.getDate() !== day
	) {
		return null;
	}
	// Wall-clock minutes, not the epoch delta, so a DST-spanning session reads right.
	const [startH, startMin] = input.start.split(':').map(Number);
	const [endH, endMin] = input.end.split(':').map(Number);
	const hours = (endH * 60 + endMin - (startH * 60 + startMin)) / 60;
	return { date: input.date, start: input.start, end: input.end, hours };
}

/**
 * Validate, hydrate into the group zone (instants + civil date), and sort.
 * Invalid inputs are dropped.
 * @param {SessionInput[]} inputs
 * @param {string} zone
 * @returns {Session[]}
 */
export function parseSessions(inputs, zone) {
	/** @type {Session[]} */
	const sessions = [];
	for (const input of inputs) {
		const valid = parseSession(input);
		if (valid === null) continue;
		const [year, month, day] = input.date.split('-').map(Number);
		const [startH, startMin] = input.start.split(':').map(Number);
		const [endH, endMin] = input.end.split(':').map(Number);
		sessions.push({
			...valid,
			civilDate: new Date(year, month - 1, day),
			startMs: zonedToInstant({ y: year, mo: month, d: day, h: startH, mi: startMin }, zone),
			endMs: zonedToInstant({ y: year, mo: month, d: day, h: endH, mi: endMin }, zone),
		});
	}
	return sessions.sort(byStart);
}

/**
 * @param {Session[]} sessions
 * @param {number} targetHours
 * @param {number} nowMs
 * @returns {{ completedHours: number, upcomingHours: number, remainingHours: number, percent: number }}
 */
export function computeProgress(sessions, targetHours, nowMs) {
	const completedHours = sessions
		.filter((session) => session.endMs <= nowMs)
		.reduce((sum, session) => sum + session.hours, 0);
	const upcomingHours = sessions
		.filter((session) => session.endMs > nowMs)
		.reduce((sum, session) => sum + session.hours, 0);
	const remainingHours = Math.max(0, targetHours - completedHours);
	const percent = targetHours > 0 ? Math.min(100, (completedHours / targetHours) * 100) : 0;
	return { completedHours, upcomingHours, remainingHours, percent };
}

/**
 * Done and upcoming widths as a % of target, clamped so the two never exceed
 * 100% (overshoot is absorbed).
 * @param {number} completedHours
 * @param {number} upcomingHours
 * @param {number} targetHours
 * @returns {{ donePct: number, upcomingPct: number }}
 */
export function progressSegments(completedHours, upcomingHours, targetHours) {
	if (targetHours <= 0) return { donePct: 0, upcomingPct: 0 };
	const donePct = Math.min(100, (completedHours / targetHours) * 100);
	const upcomingPct = Math.min(100 - donePct, (upcomingHours / targetHours) * 100);
	return { donePct, upcomingPct };
}

/**
 * Earliest session that has not ended. A session running right now counts,
 * flagged inProgress.
 * @param {Session[]} sessions
 * @param {number} nowMs
 * @returns {{ session: Session, inProgress: boolean } | null}
 */
export function findNextSession(sessions, nowMs) {
	const upcoming = sessions.filter((session) => session.endMs > nowMs).sort(byStart);
	const session = upcoming[0];
	if (session === undefined) return null;
	return { session, inProgress: session.startMs <= nowMs };
}

/**
 * Monday 00:00 local of the week containing the given date.
 * @param {Date} date
 * @returns {Date}
 */
export function weekStartOf(date) {
	const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
	monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
	return monday;
}

/**
 * One bucket per calendar week from the first session's week through the
 * last's — weeks without sessions stay in, with zero hours (visible gaps).
 * Hours split by session end vs `nowMs`, so a week straddling today carries
 * both a done and an upcoming share. Week membership is keyed to the group-zone
 * civil date, so the bucketing is identical for every viewer.
 * @param {Session[]} sessions
 * @param {number} nowMs
 * @returns {WeekBucket[]}
 */
export function weeklyBuckets(sessions, nowMs) {
	if (sessions.length === 0) return [];
	const sorted = [...sessions].sort(byStart);
	const firstWeek = weekStartOf(sorted[0].civilDate);
	const lastWeek = weekStartOf(sorted[sorted.length - 1].civilDate);
	/** @type {WeekBucket[]} */
	const buckets = [];
	for (let cursor = new Date(firstWeek); cursor <= lastWeek; cursor.setDate(cursor.getDate() + 7)) {
		const weekStart = new Date(cursor);
		const weekEnd = new Date(weekStart);
		weekEnd.setDate(weekEnd.getDate() + 7);
		const inWeek = sorted.filter((s) => s.civilDate >= weekStart && s.civilDate < weekEnd);
		buckets.push({
			weekStart,
			doneHours: inWeek.filter((s) => s.endMs <= nowMs).reduce((sum, s) => sum + s.hours, 0),
			upcomingHours: inWeek.filter((s) => s.endMs > nowMs).reduce((sum, s) => sum + s.hours, 0),
		});
	}
	return buckets;
}

/**
 * Index of the bucket whose [weekStart, weekStart+7) contains the group-zone
 * civil date of now, or null when now is outside the rendered span (all-past or
 * all-future).
 * @param {WeekBucket[]} buckets
 * @param {Date} nowCivil
 * @returns {number | null}
 */
export function nowWeekIndex(buckets, nowCivil) {
	for (let i = 0; i < buckets.length; i++) {
		const weekEnd = new Date(buckets[i].weekStart);
		weekEnd.setDate(weekEnd.getDate() + 7);
		if (nowCivil >= buckets[i].weekStart && nowCivil < weekEnd) return i;
	}
	return null;
}

/** @param {SessionInput} s */
export const isBlankInput = (s) => s.date === '' && s.start === '' && s.end === '';

/** @param {GroupData} draft */
export function isComplete(draft) {
	return (
		draft.title.trim() !== '' &&
		draft.targetHours > 0 &&
		parseSessions(draft.sessions, draft.timeZone).length > 0
	);
}

/**
 * The draft as a shareable group, or null if any non-blank row is invalid or a
 * required field is missing — i.e. exactly what would produce a valid link.
 * @param {GroupData} draft
 * @returns {GroupData | null}
 */
export function shareableGroup(draft) {
	if (draft.sessions.some((s) => !isBlankInput(s) && parseSession(s) === null)) return null;
	const cleaned = { ...draft, sessions: draft.sessions.filter((s) => !isBlankInput(s)) };
	return isComplete(cleaned) ? cleaned : null;
}
