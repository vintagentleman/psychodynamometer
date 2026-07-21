import {
	decodeGroup,
	encodeGroup,
	parseSession,
	parseSessions,
	computeProgress,
	findNextSession,
	weeklyBuckets,
	formatDateShort,
	formatDateLong,
	formatMonth,
	formatWeekRange,
	formatHoursNum,
} from './lib.js';
import { resolveLocale, t } from './i18n.js';

/** @typedef {import('./lib.js').GroupData} GroupData */
/** @typedef {import('./lib.js').SessionInput} SessionInput */

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
 * All markup lives in index.html templates; user data lands via
 * textContent only — nothing in this module concatenates HTML.
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
 * One stacked segment of a rhythm bar, sized as a fraction of the bar.
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

/**
 * The dashboard for one group, cloned from #tpl-view.
 * @param {GroupData} data
 * @param {Date} now
 * @param {boolean} [withFooter]
 * @returns {DocumentFragment}
 */
function viewFragment(data, now, withFooter = false) {
	const sessions = parseSessions(data.sessions);
	const { completedHours, remainingHours, percent } = computeProgress(
		sessions,
		data.targetHours,
		now,
	);
	const next = findNextSession(sessions, now);
	const buckets = weeklyBuckets(sessions, now);
	const maxWeekHours = Math.max(...buckets.map((b) => b.doneHours + b.upcomingHours), 1);

	const fragment = cloneTemplate('tpl-view');
	slot(fragment, 'h1').textContent = data.title;
	slot(fragment, '.masthead-hours').textContent = t(locale, 'headerHours', {
		completed: formatHoursNum(completedHours, locale),
		target: formatHoursNum(data.targetHours, locale),
	});

	slot(fragment, '.hero-value').textContent = `${Math.round(percent)}%`;
	slot(fragment, '.hero-side').textContent =
		` · ${t(locale, 'remaining', { hours: formatHoursNum(remainingHours, locale) })}`;
	const meter = slot(fragment, '.meter');
	meter.setAttribute('role', 'img');
	meter.setAttribute('aria-label', `${Math.round(percent)}%`);
	slot(fragment, '.meter-fill').style.width = `${percent}%`;

	slot(fragment, '.next-when').textContent = next
		? `${formatDateLong(next.session.startDT, locale)} · ${next.session.start}–${next.session.end}` +
			(next.inProgress ? ` · ${t(locale, 'inProgress')}` : '')
		: t(locale, sessions.length === 0 ? 'noSessions' : 'noUpcoming');

	const strip = slot(fragment, '.strip');
	for (const bucket of buckets) {
		const total = bucket.doneHours + bucket.upcomingHours;
		const slotEl = /** @type {HTMLElement} */ (cloneTemplate('tpl-bar').firstElementChild);
		const bar = /** @type {HTMLElement} */ (slotEl.querySelector('.bar'));
		bar.style.height =
			total === 0 ? '0' : `${Math.max(8, Math.round((total / maxWeekHours) * 100))}%`;
		// Upcoming stacks on top of done; the color boundary is "now", so no
		// separate today marker is needed (or possible to misplace).
		if (bucket.upcomingHours > 0) {
			bar.appendChild(segment('upcoming', bucket.upcomingHours / total));
		}
		if (bucket.doneHours > 0) {
			bar.appendChild(segment('done', bucket.doneHours / total));
		}
		slotEl.title = `${formatWeekRange(bucket.weekStart, locale)} · ${t(locale, 'hoursShort', {
			hours: formatHoursNum(total, locale),
		})}`;
		strip.appendChild(slotEl);
	}

	// Month labels group the weeks they cover: one cell per month, sized by
	// its week count and centered, so a label reads as belonging to the whole
	// month's bars rather than to whichever bar happens to sit above it.
	// Approximation: strip and axis share the 3px gap but differ in item
	// count, so interior month boundaries drift from true bar spans by a few
	// pixels (~2px worst case on realistic spans; zero at the edges).
	const axis = slot(fragment, '.axis');
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

	const list = slot(fragment, '.sessions');
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
		list.appendChild(row);
	}

	if (!withFooter) slot(fragment, '.page-actions').remove();
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

/**
 * Read the form back into (possibly incomplete) group data.
 * @returns {GroupData}
 */
function readForm() {
	const form = /** @type {HTMLFormElement} */ (app.querySelector('#build'));
	const formData = new FormData(form);
	const dates = formData.getAll('date');
	const starts = formData.getAll('start');
	const ends = formData.getAll('end');
	return {
		title: String(formData.get('title') ?? ''),
		targetHours: Number(formData.get('targetHours') ?? 0) || 0,
		sessions: dates.map((date, i) => ({
			date: String(date),
			start: String(starts[i] ?? ''),
			end: String(ends[i] ?? ''),
		})),
	};
}

/** @param {GroupData} draft */
function isComplete(draft) {
	return (
		draft.title.trim() !== '' && draft.targetHours > 0 && parseSessions(draft.sessions).length > 0
	);
}

/** @type {{ mode: 'view' | 'build', data: GroupData | null, badLink: boolean }} */
let state = { mode: 'build', data: null, badLink: false };

/**
 * Build (but do not wire) the group-builder form, cloned from #tpl-build.
 * @param {GroupData | null} data
 * @param {boolean} badLink
 * @returns {DocumentFragment}
 */
function buildFragment(data, badLink) {
	const fragment = cloneTemplate('tpl-build');
	if (badLink) slot(fragment, '.note-badlink').hidden = false;
	else slot(fragment, '.note-badlink').remove();

	const rowsBox = slot(fragment, '#rows');
	const rows =
		data !== null && data.sessions.length > 0 ? data.sessions : [{ date: '', start: '', end: '' }];
	for (const input of rows) rowsBox.appendChild(sessionRow(input));
	/** @type {HTMLInputElement} */ (slot(fragment, '[name="title"]')).value = data?.title ?? '';
	/** @type {HTMLInputElement} */ (slot(fragment, '[name="targetHours"]')).value =
		data !== null && data.targetHours > 0 ? String(data.targetHours) : '';
	return fragment;
}

/**
 * Refresh the builder's per-row validity flags and live preview from the
 * current form values. The one surgical update we keep: the form inputs must
 * survive untouched — rebuilding them would drop the caret mid-type — so only
 * #preview and the row classes change here, never the inputs themselves.
 */
function update() {
	const liveRows = slot(app, '#rows');
	const preview = slot(app, '#preview');
	for (const row of liveRows.querySelectorAll('.row')) {
		const inputs = row.querySelectorAll('input');
		const [date, start, end] = [...inputs].map((input) => input.value);
		const filled = date !== '' && start !== '' && end !== '';
		row.classList.toggle('invalid', filled && parseSession({ date, start, end }) === null);
	}
	const draft = readForm();
	if (isComplete(draft)) preview.replaceChildren(viewFragment(draft, new Date()));
	else preview.replaceChildren(cloneTemplate('tpl-hint'));
}

/**
 * Rebuild #app's children from state. Handlers live on #app itself (wired
 * once in wireApp) and #app survives every replaceChildren, so nothing here
 * re-attaches anything.
 */
function render() {
	if (state.mode === 'view' && state.data !== null) {
		app.replaceChildren(langToggleFragment(), viewFragment(state.data, new Date(), true));
	} else {
		app.replaceChildren(langToggleFragment(), buildFragment(state.data, state.badLink));
		update();
	}
}

/**
 * Validate the builder, and on success copy a share link to the clipboard.
 * @param {HTMLButtonElement} copyButton
 */
function copyLink(copyButton) {
	update();
	const liveRows = slot(app, '#rows');
	const draft = readForm();
	let blocked = false;
	for (const row of liveRows.querySelectorAll('.row')) {
		const [date, start, end] = [...row.querySelectorAll('input')].map((input) => input.value);
		const empty = date === '' && start === '' && end === '';
		const bad = !empty && parseSession({ date, start, end }) === null;
		row.classList.toggle('invalid', bad);
		blocked ||= bad;
	}
	const cleaned = {
		...draft,
		sessions: draft.sessions.filter((s) => !(s.date === '' && s.start === '' && s.end === '')),
	};
	if (blocked || !isComplete(cleaned)) return;
	const url = `${location.origin}${location.pathname}#d=${encodeGroup(cleaned)}`;
	navigator.clipboard
		.writeText(url)
		.then(() => {
			copyButton.textContent = t(locale, 'copied');
			setTimeout(() => {
				copyButton.textContent = t(locale, 'copyLink');
			}, 1500);
		})
		.catch(() => {});
}

/**
 * Wire every handler once, on the stable #app root. Each render replaces
 * #app's children but never #app, so this delegation outlives all of them.
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
			// Capture what's typed so switching language mid-build keeps it.
			if (state.mode === 'build') state = { ...state, data: readForm() };
			render();
			return;
		}

		if (state.mode === 'view') {
			if (target.closest('#edit') !== null) {
				state = { mode: 'build', data: state.data, badLink: false };
				render();
			}
			return;
		}

		if (target.closest('#add-row') !== null) {
			slot(app, '#rows').appendChild(sessionRow({ date: '', start: '', end: '' }));
			update();
			return;
		}
		const removeButton = target.closest('.remove');
		if (removeButton !== null) {
			const liveRows = slot(app, '#rows');
			if (liveRows.querySelectorAll('.row').length > 1) {
				removeButton.closest('.row')?.remove();
				update();
			}
			return;
		}
		const copyButton = target.closest('#copy-link');
		if (copyButton !== null) copyLink(/** @type {HTMLButtonElement} */ (copyButton));
	});

	app.addEventListener('input', () => {
		if (state.mode === 'build') update();
	});
}

function route() {
	const payload = currentPayload();
	if (payload === null) {
		state = { mode: 'build', data: null, badLink: false };
		render();
		return;
	}
	const data = decodeGroup(payload);
	if (data === null) {
		state = { mode: 'build', data: null, badLink: true };
		render();
		return;
	}
	state = { mode: 'view', data, badLink: false };
	try {
		render();
	} catch {
		state = { mode: 'build', data: null, badLink: true };
		render();
	}
}

window.addEventListener('hashchange', route);
wireApp();
route();
