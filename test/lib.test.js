import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeGroup, decodeGroup } from '../src/lib.js';

/** @type {import('../src/lib.js').GroupData} */
const cyrillic = {
	v: 1,
	title: 'Группа «Вторник»',
	targetHours: 41.5,
	sessions: [{ date: '2026-06-02', start: '19:00', end: '22:30' }],
};

test('codec round-trips cyrillic data', () => {
	assert.deepEqual(decodeGroup(encodeGroup(cyrillic)), cyrillic);
});

test('encoded payload is url-safe (no +, /, =)', () => {
	assert.match(encodeGroup(cyrillic), /^[A-Za-z0-9_-]+$/);
});

test('decode returns null on garbage', () => {
	assert.equal(decodeGroup('%%%not-base64%%%'), null);
});

test('decode returns null on valid base64 of non-JSON', () => {
	assert.equal(decodeGroup(btoa('not json')), null);
});

test('decode returns null on wrong shape', () => {
	assert.equal(decodeGroup(btoa(JSON.stringify({ v: 1 }))), null);
});

test('decode returns null on unknown version', () => {
	assert.equal(decodeGroup(encodeGroup(/** @type {*} */ ({ ...cyrillic, v: 2 }))), null);
});
