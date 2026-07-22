import { locale } from './store.ts';
import { t } from '../i18n.ts';
import type { SessionInput } from '../lib/sessions.ts';

// Clone a template and resolve its data-i18n / data-i18n-aria bindings.
export function cloneTemplate(id: string): DocumentFragment {
	const template = document.getElementById(id) as HTMLTemplateElement;
	const fragment = template.content.cloneNode(true) as DocumentFragment;
	for (const el of fragment.querySelectorAll('[data-i18n]')) {
		el.textContent = t(locale, (el as HTMLElement).dataset.i18n ?? '');
	}
	for (const el of fragment.querySelectorAll('[data-i18n-aria]')) {
		el.setAttribute('aria-label', t(locale, (el as HTMLElement).dataset.i18nAria ?? ''));
	}
	return fragment;
}

export function slot(root: DocumentFragment | Element, selector: string) {
	return root.querySelector(selector) as HTMLElement;
}

export function segment(kind: 'done' | 'upcoming', fraction: number) {
	const seg = cloneTemplate('tpl-seg').firstElementChild as HTMLElement;
	seg.classList.add(kind);
	seg.style.height = `${fraction * 100}%`;
	return seg;
}

export function sessionRow(input: SessionInput) {
	const fragment = cloneTemplate('tpl-form-row');
	(slot(fragment, '[name="date"]') as HTMLInputElement).value = input.date;
	(slot(fragment, '[name="start"]') as HTMLInputElement).value = input.start;
	(slot(fragment, '[name="end"]') as HTMLInputElement).value = input.end;
	return fragment;
}
