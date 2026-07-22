/** @type {Record<string, string>} */
const DATE_LOCALES = { en: 'en-GB', ru: 'ru' };

/**
 * @param {Date} date
 * @param {string} locale
 */
export function formatDateShort(date, locale) {
	return new Intl.DateTimeFormat(DATE_LOCALES[locale] ?? locale, {
		weekday: 'short',
		day: 'numeric',
		month: 'short',
	}).format(date);
}

/**
 * @param {Date} date
 * @param {string} locale
 */
export function formatDateLong(date, locale) {
	return new Intl.DateTimeFormat(DATE_LOCALES[locale] ?? locale, {
		weekday: 'long',
		day: 'numeric',
		month: 'long',
	}).format(date);
}

/**
 * @param {Date} date
 * @param {string} locale
 */
export function formatMonth(date, locale) {
	return new Intl.DateTimeFormat(DATE_LOCALES[locale] ?? locale, { month: 'short' }).format(date);
}

/**
 * Monday-to-Sunday range of the week starting at weekStart, e.g. "17 – 23 Aug".
 * @param {Date} weekStart
 * @param {string} locale
 */
export function formatWeekRange(weekStart, locale) {
	const weekEnd = new Date(weekStart);
	weekEnd.setDate(weekEnd.getDate() + 6);
	return new Intl.DateTimeFormat(DATE_LOCALES[locale] ?? locale, {
		day: 'numeric',
		month: 'short',
	})
		.formatRange(weekStart, weekEnd)
		.replace(/\s/g, ' '); // ICU emits narrow no-break spaces; engines disagree
}

/**
 * @param {number} hours
 * @param {string} locale
 */
export function formatHoursNum(hours, locale) {
	return new Intl.NumberFormat(DATE_LOCALES[locale] ?? locale, {
		maximumFractionDigits: 1,
	})
		.format(hours)
		.replace(/\s/g, ' ');
}

/**
 * The zone's UTC-offset tag at instant `ms`, e.g. "GMT+3", localised.
 * @param {number} ms
 * @param {string} zone
 * @param {string} locale
 * @returns {string}
 */
export function formatOffsetTag(ms, zone, locale) {
	const parts = new Intl.DateTimeFormat(DATE_LOCALES[locale] ?? locale, {
		timeZone: zone,
		timeZoneName: 'shortOffset',
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23',
	}).formatToParts(new Date(ms));
	return parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
}

/**
 * The instant `ms` as a clock time in the viewer's own local zone, "HH:MM".
 * @param {number} ms
 * @param {string} locale
 * @returns {string}
 */
export function formatLocalTime(ms, locale) {
	return new Intl.DateTimeFormat(DATE_LOCALES[locale] ?? locale, {
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23',
	}).format(new Date(ms));
}
