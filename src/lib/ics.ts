import ICAL from 'ical.js';

import type { GroupData, Session } from './sessions.ts';

export type IcsOptions = { url: string; untitledSummary: string; nowMs: number };

// 32-bit FNV-1a over UTF-8 bytes, base36. Deterministic UIDs let a re-import
// update events in place instead of duplicating them.
function fnv1a36(input: string): string {
	let hash = 0x811c9dc5;
	for (const byte of new TextEncoder().encode(input)) {
		hash ^= byte;
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(36);
}

export function buildIcs(group: GroupData, sessions: Session[], opts: IcsOptions): string {
	const calendar = new ICAL.Component(['vcalendar', [], []]);
	calendar.updatePropertyWithValue('version', '2.0');
	calendar.updatePropertyWithValue('prodid', '-//psychodynamometer//EN');
	const stamp = ICAL.Time.fromJSDate(new Date(opts.nowMs), true);
	for (const [index, session] of sessions.entries()) {
		const vevent = new ICAL.Component('vevent');
		const event = new ICAL.Event(vevent);
		event.uid = `${fnv1a36(group.title + group.timeZone + session.date + session.start + session.end)}-${index}@psychodynamometer`;
		event.summary = group.title === '' ? opts.untitledSummary : group.title;
		// DESCRIPTION duplicates URL because many clients never surface URL.
		event.description = opts.url;
		event.startDate = ICAL.Time.fromJSDate(new Date(session.startZdt.epochMilliseconds), true);
		event.endDate = ICAL.Time.fromJSDate(new Date(session.endZdt.epochMilliseconds), true);
		vevent.updatePropertyWithValue('dtstamp', stamp);
		vevent.updatePropertyWithValue('url', opts.url);
		calendar.addSubcomponent(vevent);
	}
	return calendar.toString();
}

export function icsFilename(title: string): string {
	const dashed = title.trim().replace(/\s+/g, '-');
	// `ch > ' '` drops C0 controls and space; DEL sorts above space, hence the escape.
	const kept = Array.from(dashed)
		.filter((ch) => ch > ' ' && ch !== '\u007F' && !'/\\:*?"<>|'.includes(ch))
		.join('');
	const stem = Array.from(kept).slice(0, 64).join('');
	return stem === '' ? 'sessions' : stem;
}
