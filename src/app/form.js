import { app, locale } from './store.js';
import { slot } from './dom.js';
import { parseSession, isBlankInput, detectedZone } from '../lib.js';
import { t } from '../i18n.js';

/** @typedef {import('../lib/sessions.js').GroupData} GroupData */

/** @param {Element} row */
export function readRow(row) {
	const [date, start, end] = [...row.querySelectorAll('input')].map((input) => input.value);
	const raw = { date, start, end };
	return {
		...raw,
		filled: date !== '' && start !== '' && end !== '',
		blank: isBlankInput(raw),
		valid: parseSession(raw) !== null,
	};
}

/**
 * @param {Element} row
 * @param {boolean} invalid
 */
export function markRow(row, invalid) {
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

/** @param {string} key */
export function showBuildError(key) {
	const note = slot(app, '.note-copyerror');
	note.hidden = false;
	note.textContent = t(locale, key);
}

export function clearBuildError() {
	slot(app, '.note-copyerror').hidden = true;
}

/**
 * Read the edit-mode fields back into (possibly incomplete) group data.
 * @returns {GroupData}
 */
export function readForm() {
	const title = /** @type {HTMLInputElement | null} */ (app.querySelector('input[name="title"]'));
	const target = /** @type {HTMLInputElement | null} */ (
		app.querySelector('input[name="targetHours"]')
	);
	const sessions = [...app.querySelectorAll('#rows .row')].map((row) => {
		const [date, start, end] = [...row.querySelectorAll('input')].map((i) => i.value);
		return { date, start, end };
	});
	const zone = /** @type {HTMLSelectElement | null} */ (app.querySelector('#zone-select'));
	return {
		title: title?.value ?? '',
		targetHours: Number(target?.value) || 0,
		timeZone: zone?.value || detectedZone(),
		sessions,
	};
}
