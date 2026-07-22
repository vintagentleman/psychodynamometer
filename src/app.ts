import '../style.css';
import { decodeGroup, isBlankInput } from './lib.ts';
import { app, locale, setLocale, state, setState, storeLang } from './app/store.ts';
import { slot, sessionRow } from './app/dom.ts';
import { readForm } from './app/form.ts';
import { renderPage, refreshComputed } from './app/render.ts';
import { copyLink, syncUrl } from './app/actions.ts';

document.documentElement.lang = locale;

function currentPayload(): string | null {
	const match = location.hash.match(/^#d=(.+)$/);
	return match ? match[1] : null;
}

// Wire every handler once, on the stable #app root. Each render replaces #app's
// children but never #app, so this delegation outlives all of them.
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
