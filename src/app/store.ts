import type { Locale } from '../i18n.ts';
import { resolveLocale } from '../i18n.ts';
import type { GroupData } from '../lib/sessions.ts';

export const app = document.querySelector('#app') as HTMLElement;

function readStored(key: string): string | null {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}

export function writeStored(key: string, value: string | null) {
	try {
		if (value === null) localStorage.removeItem(key);
		else localStorage.setItem(key, value);
	} catch {
		/* storage blocked — the choice lasts for this page only */
	}
}

export let locale: Locale = resolveLocale(navigator.language, readStored('lang'));
export function setLocale(next: Locale) {
	locale = next;
}

type AppState = { mode: 'view' | 'edit'; data: GroupData | null; badLink: boolean };
export let state: AppState = { mode: 'edit', data: null, badLink: false };
export function setState(next: AppState) {
	state = next;
}
