import ICAL from 'ical.js';
import { describe, expect, it } from 'vitest';

import { buildIcs, icsFilename } from '../src/lib/ics.ts';
import { type GroupData, parseSessions } from '../src/lib/sessions.ts';

const NOW = Date.UTC(2026, 6, 21, 12, 0);
const OPTS = { untitledSummary: 'Group session', nowMs: NOW };

const group: GroupData = {
	title: 'Tuesday Group',
	targetHours: 41.5,
	timeZone: 'UTC',
	sessions: [
		{ date: '2026-06-02', start: '19:00', end: '22:30' },
		{ date: '2026-06-30', start: '23:00', end: '01:00' },
	],
};

const build = (g: GroupData) => buildIcs(g, parseSessions(g.sessions, g.timeZone), OPTS);
const parseEvents = (ics: string) =>
	new ICAL.Component(ICAL.parse(ics)).getAllSubcomponents('vevent').map((v) => new ICAL.Event(v));

describe('buildIcs', () => {
	it('emits one VEVENT per session, past ones included', () => {
		expect(parseEvents(build(group))).toHaveLength(2);
	});

	it('stamps UTC instants, converting from the group zone', () => {
		const events = parseEvents(build(group));
		expect(events[0].startDate.toUnixTime()).toBe(Date.UTC(2026, 5, 2, 19, 0) / 1000);
		const moscow = { ...group, timeZone: 'Europe/Moscow' };
		expect(parseEvents(build(moscow))[0].startDate.toUnixTime()).toBe(
			Date.UTC(2026, 5, 2, 16, 0) / 1000,
		);
	});

	it('puts an overnight DTEND on the following day', () => {
		const events = parseEvents(build(group));
		expect(events[1].endDate.toUnixTime()).toBe(Date.UTC(2026, 6, 1, 1, 0) / 1000);
	});

	it('takes DTSTAMP from nowMs', () => {
		const events = parseEvents(build(group));
		const dtstamp = events[0].component.getFirstPropertyValue('dtstamp') as ICAL.Time;
		expect(dtstamp.toUnixTime()).toBe(NOW / 1000);
	});

	it('numbers each event within the schedule', () => {
		const summaries = parseEvents(build(group)).map((e) => e.summary);
		expect(summaries).toEqual(['Tuesday Group — 1/2', 'Tuesday Group — 2/2']);
	});

	it('round-trips a hostile title as literal text', () => {
		const title = 'Группа, "долгая"; \\ тест\nстрока';
		expect(parseEvents(build({ ...group, title }))[0].summary).toBe(`${title} — 1/2`);
	});

	it('round-trips a long Cyrillic title through folding', () => {
		const title = 'Группа продолжительной психодинамической терапии и поддержки, набор второй';
		expect(parseEvents(build({ ...group, title }))[0].summary).toBe(`${title} — 1/2`);
	});

	it('falls back to the untitled summary', () => {
		expect(parseEvents(build({ ...group, title: '' }))[0].summary).toBe('Group session — 1/2');
	});

	it('derives deterministic UIDs', () => {
		expect(build(group)).toBe(build(group));
		expect(parseEvents(build(group))[0].uid).toMatch(/^[0-9a-z]+-0@psychodynamometer$/);
	});

	it('keeps UIDs stable when an earlier session is added', () => {
		const before = parseEvents(build(group));
		const grown = {
			...group,
			sessions: [{ date: '2026-05-01', start: '10:00', end: '11:00' }, ...group.sessions],
		};
		const after = parseEvents(build(grown));
		expect(after[1].uid).toBe(before[0].uid);
		expect(after[2].uid).toBe(before[1].uid);
	});

	it('distinguishes identical duplicate sessions', () => {
		const doubled = { ...group, sessions: [group.sessions[0], group.sessions[0]] };
		const uids = parseEvents(build(doubled)).map((e) => e.uid);
		expect(new Set(uids).size).toBe(2);
	});

	it('matches the pinned serialization', () => {
		expect(build(group)).toMatchSnapshot();
	});
});

describe('icsFilename', () => {
	it('dashes whitespace', () => {
		expect(icsFilename('Tuesday Group')).toBe('Tuesday-Group');
	});

	it('strips filesystem-hostile characters', () => {
		expect(icsFilename('a/b\\c:d*e?f"g<h>i|j')).toBe('abcdefghij');
	});

	it('keeps Cyrillic', () => {
		expect(icsFilename('Группа 2026')).toBe('Группа-2026');
	});

	it('falls back on empty and unusable titles', () => {
		expect(icsFilename('')).toBe('sessions');
		expect(icsFilename('///')).toBe('sessions');
	});

	it('truncates to 64 characters', () => {
		expect(icsFilename('x'.repeat(70))).toHaveLength(64);
	});
});
