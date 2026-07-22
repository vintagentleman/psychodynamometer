import {
	decodeGroup,
	encodeGroup,
	parseSession,
	parseSessions,
	computeProgress,
	progressSegments,
	findNextSession,
	weeklyBuckets,
	nowWeekIndex,
	formatDateShort,
	formatDateLong,
	formatMonth,
	formatWeekRange,
	formatHoursNum,
} from './lib.js';
import { messages, resolveLocale, t } from './i18n.js';

/** @typedef {import('./lib.js').GroupData} GroupData */
/** @typedef {import('./lib.js').SessionInput} SessionInput */
/** @typedef {import('./lib.js').Session} Session */
/** @typedef {import('./lib.js').WeekBucket} WeekBucket */

const app = /** @type {HTMLElement} */ (document.querySelector('#app'));

function readStoredLang() {
	try {
		return localStorage.getItem('lang');
	} catch {
		return null;
	}
}

/** @param {string} lang */
function storeLang(lang) {
	try {
		localStorage.setItem('lang', lang);
	} catch {
		/* storage blocked — non-fatal */
	}
}

let locale = resolveLocale(navigator.language, readStoredLang());
document.documentElement.lang = locale;

/**
 * Clone a template and resolve its data-i18n / data-i18n-aria bindings.
 * @param {string} id
 * @returns {DocumentFragment}
 */
function cloneTemplate(id) {
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
function slot(root, selector) {
	return /** @type {HTMLElement} */ (root.querySelector(selector));
}

/**
 * @param {'done' | 'upcoming'} kind
 * @param {number} fraction
 */
function segment(kind, fraction) {
	const seg = /** @type {HTMLElement} */ (cloneTemplate('tpl-seg').firstElementChild);
	seg.classList.add(kind);
	seg.style.height = `${fraction * 100}%`;
	return seg;
}

function currentPayload() {
	const match = location.hash.match(/^#d=(.+)$/);
	return match ? match[1] : null;
}

function langToggleFragment() {
	const fragment = cloneTemplate('tpl-lang-toggle');
	for (const button of fragment.querySelectorAll('button.lang')) {
		const lang = /** @type {HTMLElement} */ (button).dataset.lang;
		button.classList.toggle('active', locale === lang);
		button.setAttribute('aria-pressed', String(locale === lang));
	}
	return fragment;
}

/** @param {SessionInput} input */
function sessionRow(input) {
	const fragment = cloneTemplate('tpl-form-row');
	/** @type {HTMLInputElement} */ (slot(fragment, '[name="date"]')).value = input.date;
	/** @type {HTMLInputElement} */ (slot(fragment, '[name="start"]')).value = input.start;
	/** @type {HTMLInputElement} */ (slot(fragment, '[name="end"]')).value = input.end;
	return fragment;
}

/** @param {SessionInput} s */
const isBlankInput = (s) => s.date === '' && s.start === '' && s.end === '';

/** @param {Element} row */
function readRow(row) {
	const [date, start, end] = [...row.querySelectorAll('input')].map((input) => input.value);
	const raw = { date, start, end };
	return {
		...raw,
		filled: date !== '' && start !== '' && end !== '',
		blank: isBlankInput(raw),
		valid: parseSession(raw) !== null,
	};
}

/**
 * @param {Element} row
 * @param {boolean} invalid
 */
function markRow(row, invalid) {
	row.classList.toggle('invalid', invalid);
	for (const input of row.querySelectorAll('input')) {
		if (invalid) input.setAttribute('aria-invalid', 'true');
		else input.removeAttribute('aria-invalid');
	}
}

function markInvalidRows() {
	for (const row of app.querySelectorAll('#rows .row')) {
		const r = readRow(row);
		markRow(row, r.filled && !r.valid);
	}
}

/** @param {string} key */
function showBuildError(key) {
	const note = slot(app, '.note-copyerror');
	note.hidden = false;
	note.textContent = t(locale, key);
}

function clearBuildError() {
	slot(app, '.note-copyerror').hidden = true;
}

/**
 * Read the edit-mode fields back into (possibly incomplete) group data.
 * @returns {GroupData}
 */
function readForm() {
	const title = /** @type {HTMLInputElement | null} */ (app.querySelector('input[name="title"]'));
	const target = /** @type {HTMLInputElement | null} */ (
		app.querySelector('input[name="targetHours"]')
	);
	const sessions = [...app.querySelectorAll('#rows .row')].map((row) => {
		const [date, start, end] = [...row.querySelectorAll('input')].map((i) => i.value);
		return { date, start, end };
	});
	return { title: title?.value ?? '', targetHours: Number(target?.value) || 0, sessions };
}

/** @param {GroupData} draft */
function isComplete(draft) {
	return (
		draft.title.trim() !== '' && draft.targetHours > 0 && parseSessions(draft.sessions).length > 0
	);
}

/**
 * The draft as a shareable group, or null if any non-blank row is invalid or a
 * required field is missing — i.e. exactly what would produce a valid link.
 * @param {GroupData} draft
 * @returns {GroupData | null}
 */
function shareableGroup(draft) {
	if (draft.sessions.some((s) => !isBlankInput(s) && parseSession(s) === null)) return null;
	const cleaned = { ...draft, sessions: draft.sessions.filter((s) => !isBlankInput(s)) };
	return isComplete(cleaned) ? cleaned : null;
}

/**
 * Mirror the current edit into the address bar via replaceState — no reload, no
 * hashchange (so no re-render / lost caret), no history entry. A shareable draft
 * becomes a #d= link; anything incomplete or invalid clears the hash so the URL
 * never lies.
 */
function syncUrl() {
	const group = shareableGroup(readForm());
	history.replaceState(
		null,
		'',
		group ? `${location.pathname}#d=${encodeGroup(group)}` : location.pathname,
	);
}

/** @type {{ mode: 'view' | 'edit', data: GroupData | null, badLink: boolean }} */
let state = { mode: 'edit', data: null, badLink: false };

/**
 * Recompute the derived regions — progress/meter, next, rhythm, and (view only)
 * the masthead sub-line and schedule list — from `data`. Never touches inputs,
 * so it is safe to call on every keystroke.
 * @param {Element} page
 * @param {GroupData} data
 * @param {Date} now
 * @param {'view' | 'edit'} mode
 */
function fillDerived(page, data, now, mode) {
	const sessions = parseSessions(data.sessions);
	const { completedHours, upcomingHours, remainingHours, percent } = computeProgress(
		sessions,
		data.targetHours,
		now,
	);
	const next = findNextSession(sessions, now);
	const buckets = weeklyBuckets(sessions, now);

	const completedSpan = page.querySelector('.subline-completed');
	if (completedSpan !== null) completedSpan.textContent = formatHoursNum(completedHours, locale);

	const rounded = Math.round(percent);
	slot(page, '.hero-value').textContent = `${rounded}%`;
	slot(page, '.hero-side').textContent =
		` · ${t(locale, 'remaining', { hours: formatHoursNum(remainingHours, locale) })}`;
	const meter = slot(page, '.meter');
	meter.setAttribute('role', 'progressbar');
	meter.setAttribute('aria-label', t(locale, 'progress'));
	meter.setAttribute('aria-valuemin', '0');
	meter.setAttribute('aria-valuemax', '100');
	meter.setAttribute('aria-valuenow', String(rounded));
	const segments = progressSegments(completedHours, upcomingHours, data.targetHours);
	slot(page, '.meter-done').style.width = `${segments.donePct}%`;
	slot(page, '.meter-upcoming').style.width = `${segments.upcomingPct}%`;
	slot(page, '.meter-now').style.left = `${segments.donePct}%`;

	slot(page, '.next-when').textContent = next
		? `${formatDateLong(next.session.startDT, locale)} · ${next.session.start}–${next.session.end}` +
			(next.inProgress ? ` · ${t(locale, 'inProgress')}` : '')
		: t(locale, sessions.length === 0 ? 'noSessions' : 'noUpcoming');

	fillRhythm(page, buckets, now);

	if (mode === 'view') fillScheduleView(page, sessions, next, now);
}

/**
 * @param {Element} page
 * @param {WeekBucket[]} buckets
 * @param {Date} now
 */
function fillRhythm(page, buckets, now) {
	const maxWeekHours = Math.max(...buckets.map((b) => b.doneHours + b.upcomingHours), 1);
	const strip = slot(page, '.strip');
	strip.replaceChildren();
	const nowIndex = nowWeekIndex(buckets, now);
	for (const [index, bucket] of buckets.entries()) {
		const total = bucket.doneHours + bucket.upcomingHours;
		const slotEl = /** @type {HTMLElement} */ (cloneTemplate('tpl-bar').firstElementChild);
		const bar = /** @type {HTMLElement} */ (slotEl.querySelector('.bar'));
		bar.style.height =
			total === 0 ? '0' : `${Math.max(8, Math.round((total / maxWeekHours) * 100))}%`;
		if (bucket.upcomingHours > 0)
			bar.appendChild(segment('upcoming', bucket.upcomingHours / total));
		if (bucket.doneHours > 0) bar.appendChild(segment('done', bucket.doneHours / total));
		slotEl.title = `${formatWeekRange(bucket.weekStart, locale)} · ${t(locale, 'hoursShort', {
			hours: formatHoursNum(total, locale),
		})}`;
		if (index === nowIndex) slotEl.classList.add('now');
		strip.appendChild(slotEl);
	}

	const axis = slot(page, '.axis');
	axis.replaceChildren();
	/** @type {{ month: string, weeks: number }[]} */
	const months = [];
	for (const bucket of buckets) {
		const month = formatMonth(bucket.weekStart, locale);
		const current = months[months.length - 1];
		if (current !== undefined && current.month === month) current.weeks += 1;
		else months.push({ month, weeks: 1 });
	}
	for (const group of months) {
		const cell = /** @type {HTMLElement} */ (cloneTemplate('tpl-axis-cell').firstElementChild);
		cell.textContent = group.month;
		cell.style.flexGrow = String(group.weeks);
		axis.appendChild(cell);
	}
}

/**
 * @param {Element} page
 * @param {Session[]} sessions
 * @param {{ session: Session, inProgress: boolean } | null} next
 * @param {Date} now
 */
function fillScheduleView(page, sessions, next, now) {
	const list = slot(page, '.schedule-slot');
	const ol = document.createElement('ol');
	ol.className = 'sessions';
	for (const session of sessions) {
		const row = cloneTemplate('tpl-session');
		const item = /** @type {HTMLElement} */ (row.firstElementChild);
		item.classList.toggle('past', session.endDT <= now);
		item.classList.toggle('next', next !== null && session === next.session);
		slot(row, '.date').textContent = formatDateShort(session.startDT, locale);
		slot(row, '.time').textContent = `${session.start}–${session.end}`;
		slot(row, '.hours').textContent = t(locale, 'hoursShort', {
			hours: formatHoursNum(session.hours, locale),
		});
		ol.appendChild(row);
	}
	list.replaceChildren(ol);
}

/**
 * Build the masthead sub-line "{completed} of {target} …". The target is plain
 * text in view and an inline input in edit; the completed figure lives in a
 * .subline-completed span that fillDerived updates in place, so editing the
 * target never rebuilds it and the caret survives.
 * @param {Element} page
 * @param {number} targetHours
 * @param {'view' | 'edit'} mode
 */
function buildSubline(page, targetHours, mode) {
	const subline = slot(page, '.subline');
	const template = messages[locale].headerHours ?? messages.en.headerHours ?? '';
	subline.replaceChildren();
	for (const part of template.split(/(\{completed\}|\{target\})/)) {
		if (part === '{completed}') {
			const span = document.createElement('span');
			span.className = 'subline-completed';
			subline.appendChild(span);
		} else if (part === '{target}' && mode === 'edit') {
			const input = document.createElement('input');
			input.name = 'targetHours';
			input.type = 'number';
			input.min = '0';
			input.step = '0.5';
			input.className = 'target-input';
			input.setAttribute('aria-label', t(locale, 'targetHours'));
			if (targetHours > 0) input.value = String(targetHours);
			subline.appendChild(input);
		} else if (part === '{target}') {
			subline.appendChild(document.createTextNode(formatHoursNum(targetHours, locale)));
		} else if (part !== '') {
			subline.appendChild(document.createTextNode(part));
		}
	}
}

/**
 * Rebuild #app from state: one skeleton, editable regions rendered for the
 * current mode. Handlers live on #app (wired once in wireApp) and survive every
 * replaceChildren, so nothing here re-attaches anything.
 */
function renderPage() {
	const data = state.data ?? { title: '', targetHours: 0, sessions: [] };
	const mode = state.mode;
	const page = /** @type {HTMLElement} */ (cloneTemplate('tpl-page').firstElementChild);
	page.classList.toggle('editing', mode === 'edit');

	const titleSlot = slot(page, '.title-slot');
	if (mode === 'view') {
		const h1 = document.createElement('h1');
		h1.textContent = data.title;
		titleSlot.appendChild(h1);
	} else {
		const input = document.createElement('input');
		input.name = 'title';
		input.className = 'title-input';
		input.placeholder = t(locale, 'groupName');
		input.value = data.title;
		titleSlot.appendChild(input);
	}

	buildSubline(page, data.targetHours, mode);

	const schedSlot = slot(page, '.schedule-slot');
	if (mode === 'edit') {
		const rows = data.sessions.length > 0 ? data.sessions : [{ date: '', start: '', end: '' }];
		const list = document.createElement('div');
		list.id = 'rows';
		for (const input of rows) list.appendChild(sessionRow(input));
		const add = document.createElement('button');
		add.type = 'button';
		add.className = 'ghost';
		add.id = 'add-row';
		add.textContent = t(locale, 'addSession');
		schedSlot.append(list, add);
	}

	const copyBtn = document.createElement('button');
	copyBtn.type = 'button';
	copyBtn.id = 'copy-link';
	copyBtn.textContent = t(locale, 'copyLink');
	const toggle = document.createElement('button');
	toggle.type = 'button';
	toggle.className = 'ghost';
	if (mode === 'view') {
		toggle.id = 'edit';
		toggle.textContent = t(locale, 'edit');
	} else {
		toggle.id = 'done';
		toggle.textContent = t(locale, 'doneEditing');
	}
	slot(page, '.page-actions').prepend(copyBtn, toggle);

	if (mode === 'edit' && state.badLink) slot(page, '.note-badlink').hidden = false;

	app.replaceChildren(langToggleFragment(), page);

	fillDerived(page, mode === 'edit' ? readForm() : data, new Date(), mode);
	if (mode === 'edit') markInvalidRows();
}

/**
 * Refresh the live glance (progress/next/rhythm) and row validity from the
 * current form values, without rebuilding the inputs — so the caret survives.
 */
function refreshComputed() {
	clearBuildError();
	fillDerived(slot(app, '.page'), readForm(), new Date(), 'edit');
	markInvalidRows();
	syncUrl();
}

/**
 * Copy the current group's share link to the clipboard. In edit mode the draft
 * is validated first; in view mode the already-complete data is re-encoded.
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
			locale = lang;
			storeLang(lang);
			document.documentElement.lang = lang;
			if (state.mode === 'edit') state = { ...state, data: readForm() };
			renderPage();
			return;
		}

		const copyButton = target.closest('#copy-link');
		if (copyButton !== null) {
			copyLink(/** @type {HTMLButtonElement} */ (copyButton));
			return;
		}

		if (target.closest('#edit') !== null) {
			state = { mode: 'edit', data: state.data, badLink: false };
			renderPage();
			return;
		}

		if (target.closest('#done') !== null) {
			const draft = readForm();
			state = {
				mode: 'view',
				data: { ...draft, sessions: draft.sessions.filter((s) => !isBlankInput(s)) },
				badLink: false,
			};
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
		state = { mode: 'edit', data: null, badLink: false };
		renderPage();
		return;
	}
	const data = decodeGroup(payload);
	if (data === null) {
		state = { mode: 'edit', data: null, badLink: true };
		renderPage();
		return;
	}
	state = { mode: 'view', data, badLink: false };
	try {
		renderPage();
	} catch {
		state = { mode: 'edit', data: null, badLink: true };
		renderPage();
	}
}

window.addEventListener('hashchange', route);
wireApp();
route();
