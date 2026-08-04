import { type PlainDate, Temporal } from './temporal.ts';

// Offset (whole minutes, east-of-UTC positive) that `zone` is at the given instant.
// Whole minutes: a second-aligned zone would otherwise leak "GMT+02:59.99" labels.
function offsetMinutes(utcMs: number, zone: string): number {
	const zdt = Temporal.Instant.fromEpochMilliseconds(utcMs).toZonedDateTimeISO(zone);
	return Math.round(zdt.offsetNanoseconds / 60_000_000_000);
}

// The instant `ms` as its civil date in `zone`.
export function civilDateInZone(ms: number, zone: string): PlainDate {
	return Temporal.Instant.fromEpochMilliseconds(ms).toZonedDateTimeISO(zone).toPlainDate();
}

// True when the viewer's local offset equals `zone`'s at `ms` — then no
// separate local-time line is needed.
export function viewerMatchesZone(ms: number, zone: string): boolean {
	return offsetMinutes(ms, zone) === offsetMinutes(ms, detectedZone());
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
			const offset = offsetMinutes(nowMs, zone);
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
