import { zonedToInstant } from './tz.ts';

export type SessionInput = { date: string; start: string; end: string };
export type GroupData = {
	title: string;
	targetHours: number;
	timeZone: string;
	sessions: SessionInput[];
};
export type Session = SessionInput & {
	hours: number;
	civilDate: Date;
	startMs: number;
	endMs: number;
};
export type WeekBucket = { weekStart: Date; doneHours: number; upcomingHours: number };

const byStart = (a: Session, b: Session) => a.startMs - b.startMs;

// Zone-independent: calendar/time validity does not depend on the group's timezone.
export function parseSession(
	input: SessionInput,
): { date: string; start: string; end: string; hours: number } | null {
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

export function parseSessions(inputs: SessionInput[], zone: string): Session[] {
	const sessions: Session[] = [];
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
		.filter((session) => session.endMs <= nowMs)
		.reduce((sum, session) => sum + session.hours, 0);
	const upcomingHours = sessions
		.filter((session) => session.endMs > nowMs)
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
	const upcoming = sessions.filter((session) => session.endMs > nowMs).sort(byStart);
	const session = upcoming[0];
	if (session === undefined) return null;
	return { session, inProgress: session.startMs <= nowMs };
}

// Monday 00:00 local of the week containing the given date.
export function weekStartOf(date: Date): Date {
	const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
	monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
	return monday;
}

// Empty weeks stay in as zero-hour buckets (visible gaps). Week membership is
// keyed to the group-zone civil date, so the bucketing is identical for every viewer.
export function weeklyBuckets(sessions: Session[], nowMs: number): WeekBucket[] {
	if (sessions.length === 0) return [];
	const sorted = [...sessions].sort(byStart);
	const firstWeek = weekStartOf(sorted[0].civilDate);
	const lastWeek = weekStartOf(sorted[sorted.length - 1].civilDate);
	const buckets: WeekBucket[] = [];
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

export function nowWeekIndex(buckets: WeekBucket[], nowCivil: Date): number | null {
	for (let i = 0; i < buckets.length; i++) {
		const weekEnd = new Date(buckets[i].weekStart);
		weekEnd.setDate(weekEnd.getDate() + 7);
		if (nowCivil >= buckets[i].weekStart && nowCivil < weekEnd) return i;
	}
	return null;
}

export const isBlankInput = (s: SessionInput) => s.date === '' && s.start === '' && s.end === '';

// Title and target are both optional — a shareable group needs only one valid session.
export function isComplete(draft: GroupData) {
	return parseSessions(draft.sessions, draft.timeZone).length > 0;
}

export function shareableGroup(draft: GroupData): GroupData | null {
	if (draft.sessions.some((s) => !isBlankInput(s) && parseSession(s) === null)) return null;
	const cleaned = { ...draft, sessions: draft.sessions.filter((s) => !isBlankInput(s)) };
	return isComplete(cleaned) ? cleaned : null;
}
