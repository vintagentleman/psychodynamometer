import type { PlainDate } from './temporal.ts';

const DATE_LOCALES: Record<string, string> = { en: 'en-GB', ru: 'ru' };

// A civil date as a legacy Date at viewer-local midnight — the shape Intl wants.
export function plainDateToLocalDate(date: PlainDate): Date {
	return new Date(date.year, date.month - 1, date.day);
}

// localLine passes viewer-local legacy Dates; schedule rows pass civil PlainDates.
const toDate = (date: Date | PlainDate) =>
	date instanceof Date ? date : plainDateToLocalDate(date);

export function formatDateShort(date: Date | PlainDate, locale: string) {
	return new Intl.DateTimeFormat(DATE_LOCALES[locale] ?? locale, {
		weekday: 'short',
		day: 'numeric',
		month: 'short',
	}).format(toDate(date));
}

export function formatDateLong(date: Date | PlainDate, locale: string) {
	return new Intl.DateTimeFormat(DATE_LOCALES[locale] ?? locale, {
		weekday: 'long',
		day: 'numeric',
		month: 'long',
	}).format(toDate(date));
}

export function formatMonth(date: PlainDate, locale: string) {
	return new Intl.DateTimeFormat(DATE_LOCALES[locale] ?? locale, { month: 'short' }).format(
		plainDateToLocalDate(date),
	);
}

// Monday-to-Sunday range of the week starting at weekStart, e.g. "17 – 23 Aug".
export function formatWeekRange(weekStart: PlainDate, locale: string) {
	const weekEnd = weekStart.add({ days: 6 });
	return new Intl.DateTimeFormat(DATE_LOCALES[locale] ?? locale, {
		day: 'numeric',
		month: 'short',
	})
		.formatRange(plainDateToLocalDate(weekStart), plainDateToLocalDate(weekEnd))
		.replace(/\s/g, ' '); // ICU emits narrow no-break spaces; engines disagree
}

export function formatHoursNum(hours: number, locale: string) {
	return new Intl.NumberFormat(DATE_LOCALES[locale] ?? locale, {
		maximumFractionDigits: 1,
	})
		.format(hours)
		.replace(/\s/g, ' ');
}

// The zone's UTC-offset tag at instant `ms`, e.g. "GMT+3", localised.
export function formatOffsetTag(ms: number, zone: string, locale: string): string {
	const parts = new Intl.DateTimeFormat(DATE_LOCALES[locale] ?? locale, {
		timeZone: zone,
		timeZoneName: 'shortOffset',
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23',
	}).formatToParts(new Date(ms));
	return parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
}

export function formatRange(start: string, end: string, nextDay: boolean): string {
	return `${start}–${end}${nextDay ? ' +1' : ''}`;
}

// The instant `ms` as a clock time in the viewer's own local zone, "HH:MM".
export function formatLocalTime(ms: number, locale: string): string {
	return new Intl.DateTimeFormat(DATE_LOCALES[locale] ?? locale, {
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23',
	}).format(new Date(ms));
}
