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
