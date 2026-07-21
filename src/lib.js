/** @typedef {{ date: string, start: string, end: string }} SessionInput */
/** @typedef {{ title: string, targetHours: number, sessions: SessionInput[] }} GroupData */

const SESSION_TOKEN = /^(\d{2})(\d{2})(\d{2})\.(\d{2})(\d{2})\.(\d{2})(\d{2})$/;

/**
 * Encode group data as a compact URL-fragment-safe string (schema 2):
 * `2~<targetHours>~<sessions>~<title>`. Sessions are `_`-joined
 * `YYMMDD.HHMM.HHMM`; the title is percent-encoded and kept LAST so an
 * embedded `~` cannot break parsing (the decoder rejoins the tail).
 * @param {GroupData} data
 * @returns {string}
 */
export function encodeGroup(data) {
	const sessions = data.sessions
		.map(
			(s) =>
				`${s.date.replaceAll('-', '').slice(2)}.${s.start.replace(':', '')}.${s.end.replace(':', '')}`,
		)
		.join('_');
	return `2~${data.targetHours}~${sessions}~${encodeURIComponent(data.title)}`;
}

/**
 * Decode a schema-2 payload back into group data. Null on any malformation.
 * @param {string} payload
 * @returns {GroupData | null}
 */
export function decodeGroup(payload) {
	const [version, target, sessionField, ...titleParts] = payload.split('~');
	if (version !== '2' || sessionField === undefined || titleParts.length === 0) return null;
	if (target === '') return null;
	const targetHours = Number(target);
	if (!Number.isFinite(targetHours) || targetHours < 0) return null;
	/** @type {SessionInput[]} */
	const sessions = [];
	if (sessionField !== '') {
		for (const token of sessionField.split('_')) {
			const match = SESSION_TOKEN.exec(token);
			if (match === null) return null;
			const [, yy, mo, dd, sh, sm, eh, em] = match;
			sessions.push({ date: `20${yy}-${mo}-${dd}`, start: `${sh}:${sm}`, end: `${eh}:${em}` });
		}
	}
	let title;
	try {
		title = decodeURIComponent(titleParts.join('~'));
	} catch {
		return null;
	}
	return { title, targetHours, sessions };
}

/** @typedef {SessionInput & { startDT: Date, endDT: Date, hours: number }} Session */

/**
 * Build a Session from raw input. Datetimes are naive local wall-clock.
 * @param {SessionInput} input
 * @returns {Session | null}
 */
export function parseSession(input) {
	const startDT = new Date(`${input.date}T${input.start}`);
	const endDT = new Date(`${input.date}T${input.end}`);
	if (Number.isNaN(startDT.getTime()) || Number.isNaN(endDT.getTime()) || endDT <= startDT) {
		return null;
	}
	const hours = (endDT.getTime() - startDT.getTime()) / 3_600_000;
	return { ...input, startDT, endDT, hours };
}

/**
 * Parse many inputs: invalid ones are dropped, the rest sorted chronologically.
 * @param {SessionInput[]} inputs
 * @returns {Session[]}
 */
export function parseSessions(inputs) {
	return inputs
		.map(parseSession)
		.filter((session) => session !== null)
		.sort((a, b) => a.startDT.getTime() - b.startDT.getTime());
}

/**
 * @param {Session[]} sessions
 * @param {number} targetHours
 * @param {Date} now
 * @returns {{ completedHours: number, remainingHours: number, percent: number }}
 */
export function computeProgress(sessions, targetHours, now) {
	const completedHours = sessions
		.filter((session) => session.endDT <= now)
		.reduce((sum, session) => sum + session.hours, 0);
	const remainingHours = Math.max(0, targetHours - completedHours);
	const percent = targetHours > 0 ? Math.min(100, (completedHours / targetHours) * 100) : 0;
	return { completedHours, remainingHours, percent };
}

/**
 * Earliest session that has not ended. A session running right now counts,
 * flagged inProgress.
 * @param {Session[]} sessions
 * @param {Date} now
 * @returns {{ session: Session, inProgress: boolean } | null}
 */
export function findNextSession(sessions, now) {
	const upcoming = sessions
		.filter((session) => session.endDT > now)
		.sort((a, b) => a.startDT.getTime() - b.startDT.getTime());
	const session = upcoming[0];
	if (session === undefined) return null;
	return { session, inProgress: session.startDT <= now };
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
 * Hours split by session end vs `now`, so a week straddling today carries
 * both a done and an upcoming share.
 * @param {Session[]} sessions
 * @param {Date} now
 * @returns {WeekBucket[]}
 */
export function weeklyBuckets(sessions, now) {
	if (sessions.length === 0) return [];
	const sorted = [...sessions].sort((a, b) => a.startDT.getTime() - b.startDT.getTime());
	const firstWeek = weekStartOf(sorted[0].startDT);
	const lastWeek = weekStartOf(sorted[sorted.length - 1].startDT);
	/** @type {WeekBucket[]} */
	const buckets = [];
	for (
		const cursor = new Date(firstWeek);
		cursor <= lastWeek;
		cursor.setDate(cursor.getDate() + 7)
	) {
		const weekStart = new Date(cursor);
		const weekEnd = new Date(weekStart);
		weekEnd.setDate(weekEnd.getDate() + 7);
		const inWeek = sorted.filter((s) => s.startDT >= weekStart && s.startDT < weekEnd);
		buckets.push({
			weekStart,
			doneHours: inWeek.filter((s) => s.endDT <= now).reduce((sum, s) => sum + s.hours, 0),
			upcomingHours: inWeek.filter((s) => s.endDT > now).reduce((sum, s) => sum + s.hours, 0),
		});
	}
	return buckets;
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
 * @param {number} hours
 * @param {string} locale
 */
export function formatHoursNum(hours, locale) {
	return new Intl.NumberFormat(DATE_LOCALES[locale] ?? locale, {
		maximumFractionDigits: 1,
	}).format(hours);
}
