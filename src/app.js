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
	formatHoursNum,
} from './lib.js';
import { resolveLocale, t } from './i18n.js';

/** @typedef {import('./lib.js').GroupData} GroupData */
/** @typedef {import('./lib.js').SessionInput} SessionInput */

const app = /** @type {HTMLElement} */ (document.querySelector('#app'));
let locale = resolveLocale(navigator.language, null);

/** @param {unknown} value */
function esc(value) {
	return String(value).replace(
		/[&<>"']/g,
		(c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
	);
}

function currentPayload() {
	const match = location.hash.match(/^#d=(.+)$/);
	return match ? match[1] : null;
}

/**
 * The full dashboard for one group, as an HTML string (used for the main
 * view and, later, the build-mode live preview).
 * @param {GroupData} data
 * @param {Date} now
 * @param {string} [footerHTML]
 */
function viewHTML(data, now, footerHTML = '') {
	const sessions = parseSessions(data.sessions);
	const { completedHours, remainingHours, percent } = computeProgress(
		sessions,
		data.targetHours,
		now,
	);
	const next = findNextSession(sessions, now);
	const buckets = weeklyBuckets(sessions, now);
	const maxWeekHours = Math.max(...buckets.map((b) => b.hours), 1);

	const header = `
		<header class="masthead">
			<h1>${esc(data.title)}</h1>
			<p>${t(locale, 'headerHours', {
				completed: formatHoursNum(completedHours, locale),
				target: formatHoursNum(data.targetHours, locale),
			})}</p>
		</header>`;

	const progress = `
		<section class="block">
			<h2 class="label">${t(locale, 'progress')}</h2>
			<p class="hero">${Math.round(percent)}%<span class="hero-side"> · ${t(locale, 'remaining', {
				hours: formatHoursNum(remainingHours, locale),
			})}</span></p>
			<div class="meter" role="img" aria-label="${Math.round(percent)}%">
				<div class="meter-fill" style="width: ${percent}%"></div>
			</div>
		</section>`;

	const nextText = next
		? `${formatDateLong(next.session.startDT, locale)} · ${esc(next.session.start)}–${esc(
				next.session.end,
			)}${next.inProgress ? ` · ${t(locale, 'inProgress')}` : ''}`
		: t(locale, sessions.length === 0 ? 'noSessions' : 'noUpcoming');

	const nextCard = `
		<section class="block">
			<div class="next-card">
				<h2 class="label accent">${t(locale, 'nextSession')}</h2>
				<p class="next-when">${nextText}</p>
			</div>
		</section>`;

	const barItems = buckets.map((bucket) => {
		const height =
			bucket.hours === 0 ? 0 : Math.max(8, Math.round((bucket.hours / maxWeekHours) * 100));
		const label = `${formatDateShort(bucket.weekStart, locale)} · ${t(locale, 'hoursShort', {
			hours: formatHoursNum(bucket.hours, locale),
		})}`;
		return `<div class="bar ${bucket.status === 'future' ? 'upcoming' : 'done'}" style="height: ${height}%" title="${esc(label)}"></div>`;
	});
	if (buckets.length > 0) {
		const firstFuture = buckets.findIndex((bucket) => bucket.status === 'future');
		const divider = `<div class="today-divider"><span>${t(locale, 'today')}</span></div>`;
		barItems.splice(firstFuture === -1 ? barItems.length : firstFuture, 0, divider);
	}

	const rhythm = `
		<section class="block">
			<h2 class="label">${t(locale, 'rhythm')}</h2>
			<div class="strip">${barItems.join('')}</div>
			<div class="axis">
				<span>${buckets.length > 0 ? esc(formatMonth(buckets[0].weekStart, locale)) : ''}</span>
				<span>${buckets.length > 0 ? esc(formatMonth(buckets[buckets.length - 1].weekStart, locale)) : ''}</span>
			</div>
			<div class="legend">
				<span class="key"><i class="swatch done"></i>${t(locale, 'done')}</span>
				<span class="key"><i class="swatch upcoming"></i>${t(locale, 'upcoming')}</span>
			</div>
		</section>`;

	const rows = sessions.map((session) => {
		const isNext = next !== null && session === next.session;
		const isPast = session.endDT <= now;
		return `<li class="session${isPast ? ' past' : ''}${isNext ? ' next' : ''}">
			<i class="dot"></i>
			<span class="date">${esc(formatDateShort(session.startDT, locale))}</span>
			<span class="time">${esc(session.start)}–${esc(session.end)}</span>
			<span class="hours">${t(locale, 'hoursShort', { hours: formatHoursNum(session.hours, locale) })}</span>
		</li>`;
	});

	const schedule = `
		<section class="block">
			<h2 class="label">${t(locale, 'schedule')}</h2>
			<ol class="sessions">${rows.join('')}</ol>
		</section>`;

	return `<article class="page">${header}${progress}${nextCard}${rhythm}${schedule}${footerHTML}</article>`;
}

/** @param {GroupData} data */
function renderView(data) {
	const footer = `<footer class="page-actions"><button type="button" class="ghost" id="edit">${t(
		locale,
		'edit',
	)}</button></footer>`;
	app.innerHTML = viewHTML(data, new Date(), footer);
	/** @type {HTMLElement} */ (app.querySelector('#edit')).addEventListener('click', () =>
		renderBuild(data, false),
	);
}

/** @param {SessionInput} input */
function sessionRowHTML(input) {
	return `<div class="row">
		<input type="date" name="date" value="${esc(input.date)}" aria-label="${t(locale, 'date')}" />
		<input type="time" name="start" value="${esc(input.start)}" aria-label="${t(locale, 'start')}" />
		<input type="time" name="end" value="${esc(input.end)}" aria-label="${t(locale, 'end')}" />
		<button type="button" class="remove" aria-label="${t(locale, 'remove')}">×</button>
	</div>`;
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
		v: 1,
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
	const rows =
		data !== null && data.sessions.length > 0 ? data.sessions : [{ date: '', start: '', end: '' }];
	app.innerHTML = `
		<article class="page build">
			<header class="masthead"><h1>${t(locale, 'buildTitle')}</h1></header>
			${badLink ? `<p class="note">${t(locale, 'badLink')}</p>` : ''}
			<form id="build" class="block">
				<label class="field">${t(locale, 'groupName')}<input name="title" value="${esc(data?.title ?? '')}" /></label>
				<label class="field">${t(locale, 'targetHours')}<input name="targetHours" type="number" min="0" step="0.5" value="${
					data !== null && data.targetHours > 0 ? esc(data.targetHours) : ''
				}" /></label>
				<fieldset>
					<legend>${t(locale, 'sessions')}</legend>
					<div id="rows">${rows.map(sessionRowHTML).join('')}</div>
					<button type="button" class="ghost" id="add-row">${t(locale, 'addSession')}</button>
				</fieldset>
				<button type="button" id="copy-link">${t(locale, 'copyLink')}</button>
			</form>
			<h2 class="label preview-label">${t(locale, 'preview')}</h2>
			<div id="preview"></div>
		</article>`;

	const form = /** @type {HTMLFormElement} */ (app.querySelector('#build'));
	const rowsBox = /** @type {HTMLElement} */ (app.querySelector('#rows'));
	const preview = /** @type {HTMLElement} */ (app.querySelector('#preview'));
	const copyButton = /** @type {HTMLButtonElement} */ (app.querySelector('#copy-link'));

	const update = () => {
		for (const row of rowsBox.querySelectorAll('.row')) {
			const inputs = row.querySelectorAll('input');
			const [date, start, end] = [...inputs].map((input) => input.value);
			const filled = date !== '' && start !== '' && end !== '';
			row.classList.toggle('invalid', filled && parseSession({ date, start, end }) === null);
		}
		const draft = readForm();
		preview.innerHTML = isComplete(draft)
			? viewHTML(draft, new Date())
			: `<p class="note">${t(locale, 'previewHint')}</p>`;
	};

	form.addEventListener('input', update);

	/** @type {HTMLElement} */ (app.querySelector('#add-row')).addEventListener('click', () => {
		rowsBox.insertAdjacentHTML('beforeend', sessionRowHTML({ date: '', start: '', end: '' }));
		update();
	});

	rowsBox.addEventListener('click', (event) => {
		const target = /** @type {HTMLElement} */ (event.target);
		if (target.closest('.remove') && rowsBox.querySelectorAll('.row').length > 1) {
			target.closest('.row')?.remove();
			update();
		}
	});

	copyButton.addEventListener('click', () => {
		const draft = readForm();
		update();
		if (!isComplete(draft)) return;
		const url = `${location.origin}${location.pathname}#d=${encodeGroup(draft)}`;
		navigator.clipboard.writeText(url).then(() => {
			copyButton.textContent = t(locale, 'copied');
			setTimeout(() => {
				copyButton.textContent = t(locale, 'copyLink');
			}, 1500);
		});
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
	renderView(data);
}

window.addEventListener('hashchange', route);
route();
