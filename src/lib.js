/** @typedef {{ date: string, start: string, end: string }} SessionInput */
/** @typedef {{ v: 1, title: string, targetHours: number, sessions: SessionInput[] }} GroupData */

/**
 * Encode group data as URL-safe base64 (UTF-8 safe — titles may be Cyrillic).
 * @param {GroupData} data
 * @returns {string}
 */
export function encodeGroup(data) {
	const bytes = new TextEncoder().encode(JSON.stringify(data));
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

/**
 * Decode a hash payload back into group data. Null on any malformation.
 * @param {string} payload
 * @returns {GroupData | null}
 */
export function decodeGroup(payload) {
	try {
		const binary = atob(payload.replaceAll('-', '+').replaceAll('_', '/'));
		const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
		const data = JSON.parse(new TextDecoder().decode(bytes));
		if (
			data === null ||
			typeof data !== 'object' ||
			data.v !== 1 ||
			typeof data.title !== 'string' ||
			typeof data.targetHours !== 'number' ||
			!Array.isArray(data.sessions)
		) {
			return null;
		}
		return data;
	} catch {
		return null;
	}
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
