import '../style.css';

import { copyLink, downloadIcs, reportError, shareLink, syncUrl } from './app/actions.ts';
import { sessionRow, slot } from './app/dom.ts';
import { readForm } from './app/form.ts';
import { refreshComputed, refreshTopbar, renderPage } from './app/render.ts';
import { app, locale, setLocale, setState, state, storeLang } from './app/store.ts';
import { applyTheme, pinnedTheme, pinScheme } from './app/theme.ts';
import {
	decodeGroup,
	encodabilityError,
	isBlankInput,
	MAX_SESSIONS,
	sortSessionInputs,
} from './lib.ts';

document.documentElement.lang = locale;

function currentPayload(): string | null {
	const match = location.hash.match(/^#d=(.+)$/);
	return match ? match[1] : null;
}

// Handlers are delegated on the stable #app root; render replaces #app's
// children but never #app, so they outlive every render.
function wireApp() {
	app.addEventListener('click', (event) => {
		const target = event.target as HTMLElement;

		const langButton = target.closest('button.lang');
		if (langButton !== null) {
			const lang = (langButton as HTMLElement).dataset.lang;
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
			copyLink(copyButton as HTMLButtonElement);
			return;
		}

		const downloadButton = target.closest('#download-ics');
		if (downloadButton !== null) {
			void downloadIcs();
			return;
		}

		const shareButton = target.closest('#share-link');
		if (shareButton !== null) {
			shareLink();
			return;
		}

		const themeButton = target.closest('button.theme');
		if (themeButton !== null) {
			applyTheme(
				(themeButton as HTMLElement).dataset.themeChoice === 'system' ? null : pinScheme(),
			);
			refreshTopbar();
			return;
		}

		if (target.closest('#edit') !== null) {
			setState({ mode: 'edit', data: state.data, badLink: false });
			renderPage();
			return;
		}

		if (target.closest('#done') !== null) {
			const draft = readForm();
			const reason = encodabilityError(draft);
			// Rows are already red and Copy explains them; these two have no other tell.
			if (reason === 'target' || reason === 'count') {
				reportError(reason);
				return;
			}
			syncUrl();
			setState({
				mode: 'view',
				data: {
					...draft,
					sessions: sortSessionInputs(draft.sessions.filter((s) => !isBlankInput(s))),
				},
				badLink: false,
			});
			renderPage();
			return;
		}

		if (target.closest('#add-row') !== null) {
			// Counts rows, not sessions: the form never holds more than the codec can carry.
			if (app.querySelectorAll('#rows .row').length >= MAX_SESSIONS) {
				reportError('count');
				return;
			}
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
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
	if (pinnedTheme() === null) refreshTopbar();
});
wireApp();
route();
