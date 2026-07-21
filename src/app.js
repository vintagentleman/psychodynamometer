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

/** @param {() => void} rerender */
function wireLangToggle(rerender) {
	for (const button of app.querySelectorAll('button.lang')) {
		button.addEventListener('click', () => {
			const lang = /** @type {HTMLElement} */ (button).dataset.lang;
			if (lang !== 'en' && lang !== 'ru') return;
			locale = lang;
			storeLang(lang);
			document.documentElement.lang = lang;
			rerender();
		});
	}
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

/** @param {GroupData} data */
function renderView(data) {
	app.replaceChildren(langToggleFragment(), viewFragment(data, new Date(), true));
	wireLangToggle(() => renderView(data));
	slot(app, '#edit').addEventListener('click', () => renderBuild(data, false));
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

/**
 * @param {GroupData | null} data
 * @param {boolean} badLink
 */
function renderBuild(data, badLink) {
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

	app.replaceChildren(langToggleFragment(), fragment);

	const form = /** @type {HTMLFormElement} */ (app.querySelector('#build'));
	const liveRows = slot(app, '#rows');
	const preview = slot(app, '#preview');
	const copyButton = /** @type {HTMLButtonElement} */ (app.querySelector('#copy-link'));
	wireLangToggle(() => renderBuild(readForm(), badLink));

	const update = () => {
		for (const row of liveRows.querySelectorAll('.row')) {
			const inputs = row.querySelectorAll('input');
			const [date, start, end] = [...inputs].map((input) => input.value);
			const filled = date !== '' && start !== '' && end !== '';
			row.classList.toggle('invalid', filled && parseSession({ date, start, end }) === null);
		}
		const draft = readForm();
		if (isComplete(draft)) preview.replaceChildren(viewFragment(draft, new Date()));
		else preview.replaceChildren(cloneTemplate('tpl-hint'));
	};

	form.addEventListener('input', update);
	slot(app, '#add-row').addEventListener('click', () => {
		liveRows.appendChild(sessionRow({ date: '', start: '', end: '' }));
		update();
	});
	liveRows.addEventListener('click', (event) => {
		const target = /** @type {HTMLElement} */ (event.target);
		if (target.closest('.remove') && liveRows.querySelectorAll('.row').length > 1) {
			target.closest('.row')?.remove();
			update();
		}
	});
	copyButton.addEventListener('click', () => {
		update();
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
	});
	update();
}

function route() {
	const payload = currentPayload();
	if (payload === null) {
		renderBuild(null, false);
		return;
	}
	const data = decodeGroup(payload);
	if (data === null) {
		renderBuild(null, true);
		return;
	}
	try {
		renderView(data);
	} catch {
		renderBuild(null, true);
	}
}

window.addEventListener('hashchange', route);
route();
