import { decodeGroup, encodeGroup, isBlankInput, isComplete, shareableGroup } from './lib.js';
import { t } from './i18n.js';
import { app, locale, setLocale, state, setState, storeLang } from './app/store.js';
import { slot, sessionRow } from './app/dom.js';
import { readRow, readForm, markRow, showBuildError } from './app/form.js';
import { renderPage, refreshComputed } from './app/render.js';

/** @typedef {import('./lib.js').GroupData} GroupData */

document.documentElement.lang = locale;

function currentPayload() {
	const match = location.hash.match(/^#d=(.+)$/);
	return match ? match[1] : null;
}

/**
 * Write the persisted state into the address bar: a shareable draft becomes a
 * #d= link, anything else clears the hash. Uses replaceState, not
 * `location.hash` — assigning the hash fires hashchange → route(), a redundant
 * re-decode and re-render of the view we build ourselves.
 */
function syncUrl() {
	const group = shareableGroup(readForm());
	history.replaceState(
		null,
		'',
		group ? `${location.pathname}#d=${encodeGroup(group)}` : location.pathname,
	);
}

/**
 * Copy the current group's share link to the clipboard.
 * @param {HTMLButtonElement} copyButton
 */
function copyLink(copyButton) {
	/** @type {GroupData} */
	let cleaned;
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

/**
 * Wire every handler once, on the stable #app root. Each render replaces #app's
 * children but never #app, so this delegation outlives all of them.
 */
function wireApp() {
	app.addEventListener('click', (event) => {
		const target = /** @type {HTMLElement} */ (event.target);

		const langButton = target.closest('button.lang');
		if (langButton !== null) {
			const lang = /** @type {HTMLElement} */ (langButton).dataset.lang;
			if (lang !== 'en' && lang !== 'ru') return;
			setLocale(lang);
			storeLang(lang);
			document.documentElement.lang = lang;
			if (state.mode === 'edit') setState({ ...state, data: readForm() });
			renderPage();
			return;
		}

		const copyButton = target.closest('#copy-link');
		if (copyButton !== null) {
			copyLink(/** @type {HTMLButtonElement} */ (copyButton));
			return;
		}

		if (target.closest('#edit') !== null) {
			setState({ mode: 'edit', data: state.data, badLink: false });
			renderPage();
			return;
		}

		if (target.closest('#done') !== null) {
			syncUrl();
			const draft = readForm();
			setState({
				mode: 'view',
				data: { ...draft, sessions: draft.sessions.filter((s) => !isBlankInput(s)) },
				badLink: false,
			});
			renderPage();
			return;
		}

		if (target.closest('#add-row') !== null) {
			slot(app, '#rows').appendChild(sessionRow({ date: '', start: '', end: '' }));
			refreshComputed();
			return;
		}
		const removeButton = target.closest('.remove');
		if (removeButton !== null) {
			if (app.querySelectorAll('#rows .row').length > 1) {
				removeButton.closest('.row')?.remove();
				refreshComputed();
			}
		}
	});

	app.addEventListener('input', () => {
		if (state.mode === 'edit') refreshComputed();
	});
}

function route() {
	const payload = currentPayload();
	if (payload === null) {
		setState({ mode: 'edit', data: null, badLink: false });
		renderPage();
		return;
	}
	const data = decodeGroup(payload);
	if (data === null) {
		setState({ mode: 'edit', data: null, badLink: true });
		renderPage();
		return;
	}
	setState({ mode: 'view', data, badLink: false });
	try {
		renderPage();
	} catch {
		setState({ mode: 'edit', data: null, badLink: true });
		renderPage();
	}
}

window.addEventListener('hashchange', route);
wireApp();
route();
