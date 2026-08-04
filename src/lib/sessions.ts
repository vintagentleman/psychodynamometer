import { MAX_SESSIONS, MAX_TARGET_HOURS } from './limits.ts';
import { type PlainDate, Temporal, type ZonedDateTime } from './temporal.ts';

export type SessionInput = { date: string; start: string; end: string };
export type GroupData = {
	title: string;
	targetHours: number;
	timeZone: string;
	sessions: SessionInput[];
};
export type Session = SessionInput & {
	hours: number;
	nextDay: boolean;
	civilDate: PlainDate;
	startZdt: ZonedDateTime;
	endZdt: ZonedDateTime;
};
export type WeekBucket = { weekStart: PlainDate; doneHours: number; upcomingHours: number };

const byStart = (a: Session, b: Session) =>
	a.startZdt.epochMilliseconds - b.startZdt.epochMilliseconds;

// The exact <input type=date> / <input type=time> shapes — Temporal's ISO
// parser is laxer (basic format, datetime strings) and must not widen what
// the form and codec can produce.
const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_SHAPE = /^\d{2}:\d{2}$/;

// Zone-independent: calendar/time validity does not depend on the group's timezone.
export function parseSession(
	input: SessionInput,
): { date: string; start: string; end: string; hours: number; nextDay: boolean } | null {
	if (!DATE_SHAPE.test(input.date) || !TIME_SHAPE.test(input.start) || !TIME_SHAPE.test(input.end))
		return null;
	// Temporal rejects rollovers (2026-02-30) and out-of-range times (25:00) outright.
	try {
		const { year } = Temporal.PlainDate.from(input.date);
		Temporal.PlainTime.from(input.start);
		Temporal.PlainTime.from(input.end);
		// Years the 2-digit hash field can't hold.
		if (year < 2000 || year > 2099) return null;
	} catch {
		return null;
	}
	// Wall-clock minutes, not the epoch delta, so a DST-spanning session reads right.
	const [startH, startM] = input.start.split(':').map(Number);
	const [endH, endM] = input.end.split(':').map(Number);
	const startMinute = startH * 60 + startM;
	const endMinute = endH * 60 + endM;
	if (endMinute === startMinute) return null;
	const nextDay = endMinute < startMinute;
	const hours = (endMinute - startMinute + (nextDay ? 1440 : 0)) / 60;
	return { date: input.date, start: input.start, end: input.end, hours, nextDay };
}

export function parseSessions(inputs: SessionInput[], zone: string): Session[] {
	const sessions: Session[] = [];
	for (const input of inputs) {
		const valid = parseSession(input);
		if (valid === null) continue;
		const civilDate = Temporal.PlainDate.from(valid.date);
		const startZdt = civilDate.toZonedDateTime({
			timeZone: zone,
			plainTime: Temporal.PlainTime.from(valid.start),
		});
		// PlainDate.add carries month and year ends, so an overnight end needs no case.
		const endZdt = (valid.nextDay ? civilDate.add({ days: 1 }) : civilDate).toZonedDateTime({
			timeZone: zone,
			plainTime: Temporal.PlainTime.from(valid.end),
		});
		sessions.push({ ...valid, civilDate, startZdt, endZdt });
	}
	return sessions.sort(byStart);
}

// ISO YYYY-MM-DD dates and 24h HH:MM times compare chronologically as plain
// strings, so this needs no timezone and is safe on malformed or partial rows.
export function sortSessionInputs(sessions: SessionInput[]): SessionInput[] {
	const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
	return [...sessions].sort(
		(a, b) => cmp(a.date, b.date) || cmp(a.start, b.start) || cmp(a.end, b.end),
	);
}

export function computeProgress(
	sessions: Session[],
	targetHours: number,
	nowMs: number,
): {
	completedHours: number;
	upcomingHours: number;
	remainingHours: number;
	percent: number;
	plannedHours: number;
	scheduleDelta: number;
} {
	const completedHours = sessions
		.filter((session) => session.endZdt.epochMilliseconds <= nowMs)
		.reduce((sum, session) => sum + session.hours, 0);
	const upcomingHours = sessions
		.filter((session) => session.endZdt.epochMilliseconds > nowMs)
		.reduce((sum, session) => sum + session.hours, 0);
	const remainingHours = Math.max(0, targetHours - completedHours);
	const percent = targetHours > 0 ? Math.min(100, (completedHours / targetHours) * 100) : 0;
	const plannedHours = completedHours + upcomingHours;
	const scheduleDelta = targetHours - plannedHours;
	return { completedHours, upcomingHours, remainingHours, percent, plannedHours, scheduleDelta };
}

// Clamped so the stacked done + upcoming widths never exceed 100%.
export function progressSegments(
	completedHours: number,
	upcomingHours: number,
	targetHours: number,
): { donePct: number; upcomingPct: number } {
	if (targetHours <= 0) return { donePct: 0, upcomingPct: 0 };
	const donePct = Math.min(100, (completedHours / targetHours) * 100);
	const upcomingPct = Math.min(100 - donePct, (upcomingHours / targetHours) * 100);
	return { donePct, upcomingPct };
}

// Cumulative % of target after each session; pass a date-sorted list. NOT
// clamped, unlike progressSegments — an over-filled plan reads past 100%.
export function cumulativePercents(sessions: Session[], targetHours: number): number[] {
	if (targetHours <= 0) return [];
	let running = 0;
	return sessions.map((session) => {
		running += session.hours;
		return Math.round((running / targetHours) * 100);
	});
}

// The in-progress session (started, not yet ended) counts as next, flagged inProgress.
export function findNextSession(
	sessions: Session[],
	nowMs: number,
): { session: Session; inProgress: boolean } | null {
	const upcoming = sessions
		.filter((session) => session.endZdt.epochMilliseconds > nowMs)
		.sort(byStart);
	const session = upcoming[0];
	if (session === undefined) return null;
	return { session, inProgress: session.startZdt.epochMilliseconds <= nowMs };
}

// Monday of the week containing the given civil date.
export function weekStartOf(date: PlainDate): PlainDate {
	return date.subtract({ days: date.dayOfWeek - 1 });
}

// Empty weeks stay in as zero-hour buckets (visible gaps). Week membership is
// keyed to the group-zone civil date, so the bucketing is identical for every viewer.
export function weeklyBuckets(sessions: Session[], nowMs: number): WeekBucket[] {
	if (sessions.length === 0) return [];
	const sorted = [...sessions].sort(byStart);
	const lastWeek = weekStartOf(sorted[sorted.length - 1].civilDate);
	const buckets: WeekBucket[] = [];
	for (
		let weekStart = weekStartOf(sorted[0].civilDate);
		Temporal.PlainDate.compare(weekStart, lastWeek) <= 0;
		weekStart = weekStart.add({ weeks: 1 })
	) {
		const weekEnd = weekStart.add({ weeks: 1 });
		const inWeek = sorted.filter(
			(s) =>
				Temporal.PlainDate.compare(s.civilDate, weekStart) >= 0 &&
				Temporal.PlainDate.compare(s.civilDate, weekEnd) < 0,
		);
		buckets.push({
			weekStart,
			doneHours: inWeek
				.filter((s) => s.endZdt.epochMilliseconds <= nowMs)
				.reduce((sum, s) => sum + s.hours, 0),
			upcomingHours: inWeek
				.filter((s) => s.endZdt.epochMilliseconds > nowMs)
				.reduce((sum, s) => sum + s.hours, 0),
		});
	}
	return buckets;
}

export function nowWeekIndex(buckets: WeekBucket[], nowCivil: PlainDate): number | null {
	for (let i = 0; i < buckets.length; i++) {
		const { weekStart } = buckets[i];
		if (
			Temporal.PlainDate.compare(nowCivil, weekStart) >= 0 &&
			Temporal.PlainDate.compare(nowCivil, weekStart.add({ weeks: 1 })) < 0
		)
			return i;
	}
	return null;
}

export const isBlankInput = (s: SessionInput) => s.date === '' && s.start === '' && s.end === '';

// The reason is symbolic, not an i18n key — UI strings live in i18n.ts.
export function encodabilityError(draft: GroupData): 'rows' | 'target' | 'count' | null {
	const filled = draft.sessions.filter((s) => !isBlankInput(s));
	if (filled.some((s) => parseSession(s) === null)) return 'rows';
	const target = draft.targetHours;
	if (!Number.isFinite(target) || target < 0 || target > MAX_TARGET_HOURS) return 'target';
	if (filled.length > MAX_SESSIONS) return 'count';
	return null;
}

// Title and target are both optional — a shareable group needs only one valid session.
export function isComplete(draft: GroupData) {
	return parseSessions(draft.sessions, draft.timeZone).length > 0;
}

export function shareableGroup(draft: GroupData): GroupData | null {
	if (encodabilityError(draft) !== null) return null;
	const cleaned = { ...draft, sessions: draft.sessions.filter((s) => !isBlankInput(s)) };
	return isComplete(cleaned) ? cleaned : null;
}
