/** @typedef {{ date: string, start: string, end: string }} SessionInput */
/** @typedef {{ title: string, targetHours: number, timeZone: string, sessions: SessionInput[] }} GroupData */

const FORMAT = 2;
const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder('utf-8', { fatal: true });

/** @param {number} n */
const pad2 = (n) => String(n).padStart(2, '0');

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

/**
 * Encode group data as a compact base64url URL-fragment token. The payload is
 * a binary blob — format marker, target in half-hours, session count, zone
 * length + IANA zone name, one 5-byte record per session (packed date +
 * start/end minute-of-day), then the UTF-8 title — carrying no readable
 * structure by design.
 * @param {GroupData} data
 * @returns {string}
 */
export function encodeGroup(data) {
	const title = utf8Encoder.encode(data.title);
	const zone = utf8Encoder.encode(data.timeZone);
	const bytes = new Uint8Array(5 + zone.length + data.sessions.length * 5 + title.length);
	const halfHours = Math.round(data.targetHours * 2);
	bytes[0] = FORMAT;
	bytes[1] = (halfHours >> 8) & 0xff;
	bytes[2] = halfHours & 0xff;
	bytes[3] = data.sessions.length;
	bytes[4] = zone.length;
	bytes.set(zone, 5);
	let at = 5 + zone.length;
	for (const s of data.sessions) {
		const [year, month, day] = s.date.split('-').map(Number);
		const [startH, startMin] = s.start.split(':').map(Number);
		const [endH, endMin] = s.end.split(':').map(Number);
		const dateWord = ((year - 2000) << 9) | (month << 5) | day;
		const timeWord = ((startH * 60 + startMin) << 13) | ((endH * 60 + endMin) << 2);
		bytes[at++] = (dateWord >> 8) & 0xff;
		bytes[at++] = dateWord & 0xff;
		bytes[at++] = (timeWord >> 16) & 0xff;
		bytes[at++] = (timeWord >> 8) & 0xff;
		bytes[at++] = timeWord & 0xff;
	}
	bytes.set(title, at);
	return toBase64url(bytes);
}

/**
 * @param {string} zone
 * @returns {boolean}
 */
function isValidZone(zone) {
	try {
		new Intl.DateTimeFormat('en', { timeZone: zone });
		return true;
	} catch {
		return false;
	}
}

/**
 * Decode a base64url token back into group data. Null on any malformation.
 * @param {string} payload
 * @returns {GroupData | null}
 */
export function decodeGroup(payload) {
	const bytes = fromBase64url(payload);
	if (bytes === null || bytes.length < 5 || bytes[0] !== FORMAT) return null;
	const targetHours = ((bytes[1] << 8) | bytes[2]) / 2;
	const count = bytes[3];
	const zoneLen = bytes[4];
	if (bytes.length < 5 + zoneLen + count * 5) return null;
	let timeZone;
	try {
		timeZone = utf8Decoder.decode(bytes.subarray(5, 5 + zoneLen));
	} catch {
		return null;
	}
	if (!isValidZone(timeZone)) return null;
	/** @type {SessionInput[]} */
	const sessions = [];
	let at = 5 + zoneLen;
	for (let i = 0; i < count; i++) {
		const dateWord = (bytes[at] << 8) | bytes[at + 1];
		const timeWord = (bytes[at + 2] << 16) | (bytes[at + 3] << 8) | bytes[at + 4];
		at += 5;
		const startMin = (timeWord >> 13) & 0x7ff;
		const endMin = (timeWord >> 2) & 0x7ff;
		const session = {
			date: `${2000 + (dateWord >> 9)}-${pad2((dateWord >> 5) & 0xf)}-${pad2(dateWord & 0x1f)}`,
			start: `${pad2(Math.floor(startMin / 60))}:${pad2(startMin % 60)}`,
			end: `${pad2(Math.floor(endMin / 60))}:${pad2(endMin % 60)}`,
		};
		if (parseSession(session) === null) return null;
		sessions.push(session);
	}
	let title;
	try {
		title = utf8Decoder.decode(bytes.subarray(at));
	} catch {
		return null;
	}
	return { title, targetHours, timeZone, sessions };
}

/**
 * @param {Uint8Array} bytes
 * @returns {string}
 */
function toBase64url(bytes) {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

/**
 * @param {string} token
 * @returns {Uint8Array | null}
 */
function fromBase64url(token) {
	if (!/^[A-Za-z0-9_-]*$/.test(token)) return null;
	const b64 = token.replaceAll('-', '+').replaceAll('_', '/');
	const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
	let binary;
	try {
		binary = atob(padded);
	} catch {
		return null;
	}
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

/** @typedef {SessionInput & { hours: number, civilDate: Date, startMs: number, endMs: number }} Session */

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

/** @typedef {{ weekStart: Date, doneHours: number, upcomingHours: number }} WeekBucket */

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
