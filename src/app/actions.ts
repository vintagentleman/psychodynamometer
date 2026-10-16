import { t } from '../i18n.ts';
import {
	encodabilityError,
	encodeGroup,
	formatHoursNum,
	MAX_SESSIONS,
	MAX_TARGET_HOURS,
	parseSessions,
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
	let group: GroupData | null;
	if (state.mode === 'view') {
		group = state.data;
	} else {
		refreshComputed();
		// Stricter than markInvalidRows: a partly-filled row blocks the copy.
		for (const row of app.querySelectorAll('#rows .row')) {
			const r = readRow(row);
			markRow(row, !r.blank && !r.valid);
		}
		const draft = readForm();
		const reason = encodabilityError(draft);
		if (reason !== null) {
			reportError(reason);
			return;
		}
		group = shareableGroup(draft);
	}
	if (group === null) return;
	const url = `${location.origin}${location.pathname}#d=${encodeGroup(group)}`;
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

export async function downloadIcs() {
	if (state.mode !== 'view' || state.data === null) return;
	const data = state.data;
	// Must stay a dynamic import — static would put ical.js in the main chunk.
	const { buildIcs, icsFilename } = await import('../lib/ics.ts');
	const ics = buildIcs(data, parseSessions(data.sessions, data.timeZone), {
		untitledSummary: t(locale, 'untitledEvent'),
		nowMs: new Date().getTime(),
	});
	const href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
	const a = document.createElement('a');
	a.href = href;
	a.download = `${icsFilename(data.title)}.ics`;
	a.click();
	URL.revokeObjectURL(href);
}

export function shareLink() {
	if (typeof navigator.share !== 'function') return;
	if (state.mode !== 'view' || state.data === null) return;
	const url = `${location.origin}${location.pathname}#d=${encodeGroup(state.data)}`;
	// A dismissed share sheet rejects with AbortError; there is nothing to report.
	navigator.share({ title: state.data.title, url }).catch(() => {});
}
