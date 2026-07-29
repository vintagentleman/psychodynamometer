import { expect, test } from 'vitest';

import { decodeGroup, encodeGroup } from '../src/lib/codec.ts';
import type { GroupData } from '../src/lib/sessions.ts';

const token = (bytes: Buffer | number[]) => Buffer.from(bytes).toString('base64url');

const group: GroupData = {
	title: 'Группа «Вторник» ~_.%',
	targetHours: 41.5,
	timeZone: 'Europe/Moscow',
	sessions: [
		{ date: '2026-06-02', start: '19:00', end: '22:30' },
		{ date: '2026-08-09', start: '08:00', end: '16:00' },
	],
};

test('codec round-trips unicode titles and multiple sessions', () => {
	expect(decodeGroup(encodeGroup(group))).toEqual(group);
});

test('codec preserves the group timezone', () => {
	const decoded = decodeGroup(encodeGroup({ ...group, timeZone: 'America/New_York' }));
	expect(decoded?.timeZone).toBe('America/New_York');
});

test('payload is a bare base64url token, no structure leaked', () => {
	const payload = encodeGroup(group);
	expect(payload).toMatch(/^[A-Za-z0-9_-]+$/); // base64url, no padding, no '~'
	expect(payload.length).toBeLessThan(120);
});

test('encode stamps the format marker, target, count and zone length', () => {
	const bytes = Buffer.from(encodeGroup(group), 'base64url');
	expect(bytes[0]).toBe(2); // format marker
	expect((bytes[1] << 8) | bytes[2]).toBe(83); // 41.5 h * 2
	expect(bytes[3]).toBe(2); // session count
	expect(bytes[4]).toBe(Buffer.byteLength('Europe/Moscow', 'utf-8')); // zone length (13)
});

test('decode reads a hand-packed blob', () => {
	const dateWord = ((2026 - 2000) << 9) | (1 << 5) | 5; // 2026-01-05
	const timeWord = ((10 * 60) << 13) | ((13 * 60) << 2); // 10:00-13:00
	const zone = Buffer.from('UTC', 'utf-8');
	const blob = Buffer.from([
		2, // marker
		0,
		40, // target 20 h
		1, // one session
		zone.length, // zone length
		...zone,
		(dateWord >> 8) & 0xff,
		dateWord & 0xff,
		(timeWord >> 16) & 0xff,
		(timeWord >> 8) & 0xff,
		timeWord & 0xff,
		...Buffer.from('Hi', 'utf-8'),
	]);
	expect(decodeGroup(token(blob))).toEqual({
		title: 'Hi',
		targetHours: 20,
		timeZone: 'UTC',
		sessions: [{ date: '2026-01-05', start: '10:00', end: '13:00' }],
	});
});

test('round-trips field boundaries', () => {
	const edge: GroupData = {
		title: '🎯',
		targetHours: 1000,
		timeZone: 'UTC',
		sessions: [
			{ date: '2000-01-01', start: '00:00', end: '23:59' },
			{ date: '2099-12-31', start: '00:00', end: '00:01' },
		],
	};
	expect(decodeGroup(encodeGroup(edge))).toEqual(edge);
});

test('empty sessions round-trip to an empty list', () => {
	const decoded = decodeGroup(encodeGroup({ ...group, sessions: [] }));
	expect(decoded?.sessions).toEqual([]);
	expect(decoded?.title).toBe(group.title);
});

test('target is quantized to the half hour', () => {
	const decoded = decodeGroup(encodeGroup({ ...group, targetHours: 40.3 }));
	expect(decoded?.targetHours).toBe(40.5);
});

test('an overnight session round-trips with the format marker unchanged', () => {
	const night: GroupData = {
		title: 'Night',
		targetHours: 3,
		timeZone: 'UTC',
		sessions: [{ date: '2026-06-18', start: '22:00', end: '01:00' }],
	};
	const payload = encodeGroup(night);
	expect(decodeGroup(payload)).toEqual(night);
	expect(Buffer.from(payload, 'base64url')[0]).toBe(2); // old links must still decode
});

test('decode returns null on malformed payloads', () => {
	expect(decodeGroup('')).toBeNull(); // empty
	expect(decodeGroup('%%%garbage%%%')).toBeNull(); // not base64url
	expect(decodeGroup(token([2, 2]))).toBeNull(); // < 5 bytes
	expect(decodeGroup(token([1, 0, 40, 0, 0]))).toBeNull(); // v1 marker
	// zone "UTC", N=1, but only 3 of the 5 session bytes present
	expect(decodeGroup(token([2, 0, 40, 1, 3, 85, 84, 67, 0, 0, 0]))).toBeNull();
	// zone "UTC", N=5, no session bytes
	expect(decodeGroup(token([2, 0, 40, 5, 3, 85, 84, 67]))).toBeNull();
	// zone "XXXX" is not a real IANA zone
	expect(decodeGroup(token([2, 0, 40, 0, 4, 88, 88, 88, 88]))).toBeNull();
});

test('decode rejects packed fields that are not real datetimes', () => {
	const pack = (dateWord: number, startMin: number, endMin: number) => {
		const timeWord = (startMin << 13) | (endMin << 2);
		return token([
			2,
			0,
			40,
			1,
			3, // zone length
			85,
			84,
			67, // "UTC"
			(dateWord >> 8) & 0xff,
			dateWord & 0xff,
			(timeWord >> 16) & 0xff,
			(timeWord >> 8) & 0xff,
			timeWord & 0xff,
		]);
	};
	const feb30 = ((2026 - 2000) << 9) | (2 << 5) | 30;
	expect(decodeGroup(pack(feb30, 600, 660))).toBeNull(); // Feb 30 rolls over
	const month13 = ((2026 - 2000) << 9) | (13 << 5) | 1;
	expect(decodeGroup(pack(month13, 600, 660))).toBeNull(); // month 13
	const jan1 = ((2026 - 2000) << 9) | (1 << 5) | 1;
	expect(decodeGroup(pack(jan1, 1500, 1560))).toBeNull(); // minute 1500 -> hour 25
	expect(decodeGroup(pack(jan1, 600, 600))).toBeNull(); // zero-length session
});

test('decode rejects a title with a broken utf-8 tail', () => {
	// marker, target, N=0, zone "UTC", then a lone 0xC3 (incomplete 2-byte sequence)
	expect(decodeGroup(token([2, 0, 40, 0, 3, 85, 84, 67, 0xc3]))).toBeNull();
});
