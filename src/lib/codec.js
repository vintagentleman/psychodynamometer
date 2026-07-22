import { parseSession } from './sessions.js';

const FORMAT = 2;
const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder('utf-8', { fatal: true });

/** @param {number} n */
const pad2 = (n) => String(n).padStart(2, '0');

/**
 * Encode group data as a compact base64url URL-fragment token. The payload is
 * a binary blob — format marker, target in half-hours, session count, zone
 * length + IANA zone name, one 5-byte record per session (packed date +
 * start/end minute-of-day), then the UTF-8 title — carrying no readable
 * structure by design.
 * @param {import('./sessions.js').GroupData} data
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
 * @returns {import('./sessions.js').GroupData | null}
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
	/** @type {import('./sessions.js').SessionInput[]} */
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
