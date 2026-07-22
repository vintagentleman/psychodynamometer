/**
 * Offset (ms, east-of-UTC positive) that `zone` was at the given UTC instant.
 * @param {number} utcMs
 * @param {string} zone
 * @returns {number}
 */
function zoneOffsetMs(utcMs, zone) {
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
	/** @type {Record<string, string>} */
	const f = {};
	for (const { type, value } of parts) f[type] = value;
	const asUTC = Date.UTC(+f.year, +f.month - 1, +f.day, +f.hour % 24, +f.minute, +f.second);
	return asUTC - utcMs;
}

/**
 * Epoch ms of a wall-clock interpreted in `zone`. The second pass corrects the
 * dates on which the offset changes (DST transitions).
 * @param {{ y: number, mo: number, d: number, h: number, mi: number }} wc
 * @param {string} zone
 * @returns {number}
 */
export function zonedToInstant(wc, zone) {
	const guess = Date.UTC(wc.y, wc.mo - 1, wc.d, wc.h, wc.mi);
	const ms = guess - zoneOffsetMs(guess, zone);
	return guess - zoneOffsetMs(ms, zone);
}

/**
 * `now` (an instant) as the group-zone civil date at local midnight — the ruler
 * for week bucketing, so "which week is now" is measured in the group's zone.
 * @param {Date} now
 * @param {string} zone
 * @returns {Date}
 */
export function zonedCivilDate(now, zone) {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone: zone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	}).formatToParts(now);
	/** @type {Record<string, string>} */
	const f = {};
	for (const { type, value } of parts) f[type] = value;
	return new Date(+f.year, +f.month - 1, +f.day);
}

/**
 * True when the viewer's local zone has the same offset as `zone` at instant
 * `ms` — i.e. the group time and the viewer's time coincide, so a separate
 * "your time" line adds nothing.
 * @param {number} ms
 * @param {string} zone
 * @returns {boolean}
 */
export function viewerMatchesZone(ms, zone) {
	return zoneOffsetMs(ms, zone) === -new Date(ms).getTimezoneOffset() * 60000;
}
