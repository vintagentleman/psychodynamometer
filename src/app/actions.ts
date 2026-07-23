import { t } from '../i18n.ts';
import { encodeGroup, isBlankInput, isComplete, shareableGroup } from '../lib.ts';
import type { GroupData } from '../lib/sessions.ts';
import { markRow, readForm, readRow, showBuildError } from './form.ts';
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
			showBuildError('fixRows');
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
