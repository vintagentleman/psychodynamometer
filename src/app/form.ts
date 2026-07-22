import { t } from '../i18n.ts';
import { detectedZone, isBlankInput, parseSession } from '../lib.ts';
import type { GroupData } from '../lib/sessions.ts';
import { slot } from './dom.ts';
import { app, locale } from './store.ts';

export function readRow(row: Element) {
	const [date, start, end] = [...row.querySelectorAll('input')].map((input) => input.value);
	const raw = { date, start, end };
	return {
		...raw,
		filled: date !== '' && start !== '' && end !== '',
		blank: isBlankInput(raw),
		valid: parseSession(raw) !== null,
	};
}

export function markRow(row: Element, invalid: boolean) {
	row.classList.toggle('invalid', invalid);
	for (const input of row.querySelectorAll('input')) {
		if (invalid) input.setAttribute('aria-invalid', 'true');
		else input.removeAttribute('aria-invalid');
	}
}

export function markInvalidRows() {
	for (const row of app.querySelectorAll('#rows .row')) {
		const r = readRow(row);
		markRow(row, r.filled && !r.valid);
	}
}

export function showBuildError(key: string) {
	const note = slot(app, '.note-copyerror');
	note.hidden = false;
	note.textContent = t(locale, key);
}

export function clearBuildError() {
	slot(app, '.note-copyerror').hidden = true;
}

// Read the edit-mode fields back into (possibly incomplete) group data.
export function readForm(): GroupData {
	const title = app.querySelector('input[name="title"]') as HTMLInputElement | null;
	const target = app.querySelector('input[name="targetHours"]') as HTMLInputElement | null;
	const sessions = [...app.querySelectorAll('#rows .row')].map((row) => {
		const [date, start, end] = [...row.querySelectorAll('input')].map((i) => i.value);
		return { date, start, end };
	});
	const zone = app.querySelector('#zone-select') as HTMLSelectElement | null;
	return {
		title: title?.value ?? '',
		targetHours: Number(target?.value) || 0,
		timeZone: zone?.value || detectedZone(),
		sessions,
	};
}
