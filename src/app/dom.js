import { locale } from './store.js';
import { t } from '../i18n.js';

/** @typedef {import('../lib/sessions.js').SessionInput} SessionInput */

/**
 * Clone a template and resolve its data-i18n / data-i18n-aria bindings.
 * @param {string} id
 * @returns {DocumentFragment}
 */
export function cloneTemplate(id) {
	const template = /** @type {HTMLTemplateElement} */ (document.getElementById(id));
	const fragment = /** @type {DocumentFragment} */ (template.content.cloneNode(true));
	for (const el of fragment.querySelectorAll('[data-i18n]')) {
		el.textContent = t(locale, /** @type {HTMLElement} */ (el).dataset.i18n ?? '');
	}
	for (const el of fragment.querySelectorAll('[data-i18n-aria]')) {
		el.setAttribute(
			'aria-label',
			t(locale, /** @type {HTMLElement} */ (el).dataset.i18nAria ?? ''),
		);
	}
	return fragment;
}

/**
 * @param {DocumentFragment | Element} root
 * @param {string} selector
 */
export function slot(root, selector) {
	return /** @type {HTMLElement} */ (root.querySelector(selector));
}

/**
 * @param {'done' | 'upcoming'} kind
 * @param {number} fraction
 */
export function segment(kind, fraction) {
	const seg = /** @type {HTMLElement} */ (cloneTemplate('tpl-seg').firstElementChild);
	seg.classList.add(kind);
	seg.style.height = `${fraction * 100}%`;
	return seg;
}

/** @param {SessionInput} input */
export function sessionRow(input) {
	const fragment = cloneTemplate('tpl-form-row');
	/** @type {HTMLInputElement} */ (slot(fragment, '[name="date"]')).value = input.date;
	/** @type {HTMLInputElement} */ (slot(fragment, '[name="start"]')).value = input.start;
	/** @type {HTMLInputElement} */ (slot(fragment, '[name="end"]')).value = input.end;
	return fragment;
}
