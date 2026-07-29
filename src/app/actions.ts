import { t } from '../i18n.ts';
import {
	encodabilityError,
	encodeGroup,
	formatHoursNum,
	isBlankInput,
	isComplete,
	MAX_SESSIONS,
	MAX_TARGET_HOURS,
	shareableGroup,
} from '../lib.ts';
import type { GroupData } from '../lib/sessions.ts';
import { markRow, markTarget, readForm, readRow, showBuildError } from './form.ts';
import { refreshComputed } from './render.ts';
import { app, locale, state } from './store.ts';

// replaceState, not `location.hash` — assigning the hash fires hashchange →
// route(), redundantly re-decoding and re-rendering the view we already built.
export function syncUrl() {
	const group = shareableGroup(readForm());
	history.replaceState(
		null,
		'',
		group ? `${location.pathname}#d=${encodeGroup(group)}` : location.pathname,
	);
}

export function reportError(reason: 'rows' | 'target' | 'count') {
	markTarget(reason === 'target');
	if (reason === 'target') {
		showBuildError('tooManyHours', { max: formatHoursNum(MAX_TARGET_HOURS, locale) });
	} else if (reason === 'count') {
		showBuildError('tooManySessions', { max: String(MAX_SESSIONS) });
	} else {
		showBuildError('fixRows');
	}
}

export function copyLink(copyButton: HTMLButtonElement) {
	let cleaned: GroupData;
	if (state.mode === 'view') {
		if (state.data === null) return;
		cleaned = state.data;
	} else {
		refreshComputed();
		const draft = readForm();
		let blocked = false;
		for (const row of app.querySelectorAll('#rows .row')) {
			const r = readRow(row);
			const bad = !r.blank && !r.valid;
			markRow(row, bad);
			blocked ||= bad;
		}
		if (blocked) {
			reportError('rows');
			return;
		}
		const reason = encodabilityError(draft);
		if (reason !== null) {
			reportError(reason);
			return;
		}
		cleaned = { ...draft, sessions: draft.sessions.filter((s) => !isBlankInput(s)) };
		if (!isComplete(cleaned)) return;
	}
	const url = `${location.origin}${location.pathname}#d=${encodeGroup(cleaned)}`;
	if (!navigator.clipboard) {
		showBuildError('copyFailed');
		return;
	}
	navigator.clipboard
		.writeText(url)
		.then(() => {
			copyButton.textContent = t(locale, 'copied');
			setTimeout(() => {
				copyButton.textContent = t(locale, 'copyLink');
			}, 1500);
		})
		.catch(() => showBuildError('copyFailed'));
}
