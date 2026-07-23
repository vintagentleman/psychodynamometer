// Offset (ms, east-of-UTC positive) that `zone` was at the given UTC instant.
function zoneOffsetMs(utcMs: number, zone: string): number {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone: zone,
		hourCycle: 'h23',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
	}).formatToParts(new Date(utcMs));
	const f: Record<string, string> = {};
	for (const { type, value } of parts) f[type] = value;
	const asUTC = Date.UTC(+f.year, +f.month - 1, +f.day, +f.hour % 24, +f.minute, +f.second);
	return asUTC - utcMs;
}

// Epoch ms of a wall-clock interpreted in `zone`. The second pass corrects the
// dates on which the offset changes (DST transitions).
export function zonedToInstant(
	wc: { y: number; mo: number; d: number; h: number; mi: number },
	zone: string,
): number {
	const guess = Date.UTC(wc.y, wc.mo - 1, wc.d, wc.h, wc.mi);
	const ms = guess - zoneOffsetMs(guess, zone);
	return guess - zoneOffsetMs(ms, zone);
}

// An instant as its civil date at local midnight in the group's zone.
export function zonedCivilDate(now: Date, zone: string): Date {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone: zone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	}).formatToParts(now);
	const f: Record<string, string> = {};
	for (const { type, value } of parts) f[type] = value;
	return new Date(+f.year, +f.month - 1, +f.day);
}

// True when the viewer's local offset equals `zone`'s at `ms` — then no
// separate "your time" line is needed.
export function viewerMatchesZone(ms: number, zone: string): boolean {
	return zoneOffsetMs(ms, zone) === -new Date(ms).getTimezoneOffset() * 60000;
}

// True when two dates fall on the same local calendar day.
export function sameLocalYmd(a: Date, b: Date): boolean {
	return (
		a.getFullYear() === b.getFullYear() &&
		a.getMonth() === b.getMonth() &&
		a.getDate() === b.getDate()
	);
}

export function detectedZone(): string {
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone;
	} catch {
		return 'UTC';
	}
}
