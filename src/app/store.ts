import type { Locale } from '../i18n.ts';
import { resolveLocale } from '../i18n.ts';
import type { GroupData } from '../lib/sessions.ts';

export const app = document.querySelector('#app') as HTMLElement;

function readStoredLang(): string | null {
	try {
		return localStorage.getItem('lang');
	} catch {
		return null;
	}
}

export function storeLang(lang: string) {
	try {
		localStorage.setItem('lang', lang);
	} catch {
		/* storage blocked — non-fatal */
	}
}

export let locale: Locale = resolveLocale(navigator.language, readStoredLang());
export function setLocale(next: Locale) {
	locale = next;
}

type AppState = { mode: 'view' | 'edit'; data: GroupData | null; badLink: boolean };
export let state: AppState = { mode: 'edit', data: null, badLink: false };
export function setState(next: AppState) {
	state = next;
}
