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

// "GMT±HH:MM" for an east-of-UTC offset in minutes (UTC → "GMT+00:00").
function padOffset(minutes: number): string {
	const sign = minutes < 0 ? '-' : '+';
	const abs = Math.abs(minutes);
	const hh = String(Math.floor(abs / 60)).padStart(2, '0');
	const mm = String(abs % 60).padStart(2, '0');
	return `GMT${sign}${hh}:${mm}`;
}

// Every supported IANA zone as a picker option, labelled with its current
// offset and ordered by offset then name. Value stays IANA so storage/DST are
// unchanged; the labelled offset is the one in effect at nowMs.
export function zoneOptions(nowMs: number): { value: string; label: string }[] {
	return Intl.supportedValuesOf('timeZone')
		.map((zone) => {
			const offset = zoneOffsetMs(nowMs, zone) / 60000;
			return { value: zone, label: `(${padOffset(offset)}) ${zone}`, offset };
		})
		.sort((a, b) => a.offset - b.offset || a.value.localeCompare(b.value))
		.map(({ value, label }) => ({ value, label }));
}

export function detectedZone(): string {
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone;
	} catch {
		return 'UTC';
	}
}
