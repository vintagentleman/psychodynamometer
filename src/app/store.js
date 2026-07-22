import { resolveLocale } from '../i18n.js';

/** @typedef {import('../lib/sessions.js').GroupData} GroupData */

export const app = /** @type {HTMLElement} */ (document.querySelector('#app'));

function readStoredLang() {
	try {
		return localStorage.getItem('lang');
	} catch {
		return null;
	}
}

/** @param {string} lang */
export function storeLang(lang) {
	try {
		localStorage.setItem('lang', lang);
	} catch {
		/* storage blocked — non-fatal */
	}
}

export let locale = resolveLocale(navigator.language, readStoredLang());
/** @param {import('../i18n.js').Locale} next */
export function setLocale(next) {
	locale = next;
}

/** @type {{ mode: 'view' | 'edit', data: GroupData | null, badLink: boolean }} */
export let state = { mode: 'edit', data: null, badLink: false };
/** @param {{ mode: 'view' | 'edit', data: GroupData | null, badLink: boolean }} next */
export function setState(next) {
	state = next;
}
