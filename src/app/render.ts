import { t } from '../i18n.ts';
import {
	civilDateInZone,
	computeProgress,
	cumulativePercents,
	detectedZone,
	findNextSession,
	formatDateLong,
	formatDateShort,
	formatHoursNum,
	formatLocalTime,
	formatMonth,
	formatOffsetTag,
	formatRange,
	formatWeekRange,
	MAX_TARGET_HOURS,
	nowWeekIndex,
	parseSessions,
	plainDateToLocalDate,
	progressSegments,
	sameLocalYmd,
	viewerMatchesZone,
	weeklyBuckets,
	zoneOptions,
} from '../lib.ts';
import type { GroupData, Session, WeekBucket } from '../lib/sessions.ts';
import type { PlainDate } from '../lib/temporal.ts';
import { cloneTemplate, segment, sessionRow, slot } from './dom.ts';
import { clearBuildError, markInvalidRows, readForm } from './form.ts';
import { app, locale, state } from './store.ts';
import { pinnedTheme, pinScheme } from './theme.ts';

function topbarFragment() {
	const fragment = cloneTemplate('tpl-topbar');
	for (const button of fragment.querySelectorAll('button.lang')) {
		(button as HTMLElement).ariaPressed = String(locale === (button as HTMLElement).dataset.lang);
	}
	const pinned = pinnedTheme();
	const pin = pinScheme();
	for (const button of fragment.querySelectorAll('button.theme')) {
		const active =
			(button as HTMLElement).dataset.themeChoice === 'system' ? pinned === null : pinned !== null;
		(button as HTMLElement).ariaPressed = String(active);
	}
	const pinButton = fragment.querySelector('button.theme[data-theme-choice="pin"]');
	if (pinButton !== null) {
		pinButton.classList.toggle('pin-light', pin === 'light');
		pinButton.classList.toggle('pin-dark', pin === 'dark');
		pinButton.setAttribute('aria-label', t(locale, pin === 'light' ? 'themeLight' : 'themeDark'));
	}
	return fragment;
}

// The viewer-local "start–end · GMT±N" line for a session, prefixed with its
// own date only when that local day differs from the group's civil date. The +1
// comes from the viewer's instants: a local end can cross midnight when the
// group's does not.
function localLine(
	session: Session,
	viewerZone: string,
	formatDate: (date: Date, locale: string) => string,
): string {
	const localStart = new Date(session.startZdt.epochMilliseconds);
	const localEnd = new Date(session.endZdt.epochMilliseconds);
	const range = formatRange(
		formatLocalTime(session.startZdt.epochMilliseconds, locale),
		formatLocalTime(session.endZdt.epochMilliseconds, locale),
		!sameLocalYmd(localStart, localEnd),
	);
	const tag = formatOffsetTag(session.startZdt.epochMilliseconds, viewerZone, locale);
	const prefix = sameLocalYmd(localStart, plainDateToLocalDate(session.civilDate))
		? ''
		: `${formatDate(localStart, locale)} · `;
	return `${prefix}${range} · ${tag}`;
}

// Recomputes derived regions only, never the inputs, so it's safe on every
// keystroke — the caret survives.
function fillDerived(page: Element, data: GroupData, now: Date, mode: 'view' | 'edit') {
	const zone = data.timeZone;
	const viewerZone = detectedZone();
	const nowMs = now.getTime();
	const nowCivil = civilDateInZone(nowMs, zone);
	const sessions = parseSessions(data.sessions, zone);
	const { completedHours, upcomingHours, remainingHours, scheduleDelta } = computeProgress(
		sessions,
		data.targetHours,
		nowMs,
	);
	const next = findNextSession(sessions, nowMs);
	const buckets = weeklyBuckets(sessions, nowMs);

	const completedSpan = page.querySelector('.subline-completed');
	if (completedSpan !== null) completedSpan.textContent = formatHoursNum(completedHours, locale);

	const zoneTag = page.querySelector('.subline-zone');
	if (zoneTag !== null) {
		zoneTag.textContent = ` · ${formatOffsetTag(nowMs, zone, locale)}`;
	}

	const segments = progressSegments(completedHours, upcomingHours, data.targetHours);
	const rounded = Math.round(segments.donePct);
	slot(page, '.hero-value').textContent = `${rounded}%`;
	let heroSide = ` · ${t(locale, 'remaining', { hours: formatHoursNum(remainingHours, locale) })}`;
	const fillGap = Math.round(Math.abs(scheduleDelta) * 10) / 10;
	if (fillGap !== 0) {
		const key = scheduleDelta > 0 ? 'unscheduled' : 'overscheduled';
		heroSide += ` · ${t(locale, key, { hours: formatHoursNum(fillGap, locale) })}`;
	}
	slot(page, '.hero-side').textContent = heroSide;
	slot(page, '.meter').ariaValueNow = String(rounded);
	slot(page, '.meter-done').style.width = `${segments.donePct}%`;
	slot(page, '.meter-upcoming').style.width = `${segments.upcomingPct}%`;
	slot(page, '.meter-now').style.left = `${segments.donePct}%`;

	slot(page, '.next-when').textContent = next
		? `${formatDateLong(next.session.civilDate, locale)} · ${formatRange(next.session.start, next.session.end, next.session.nextDay)}` +
			(next.inProgress ? ` · ${t(locale, 'inProgress')}` : '')
		: t(locale, sessions.length === 0 ? 'noSessions' : 'noUpcoming');

	const local = slot(page, '.next-local');
	if (next !== null && !viewerMatchesZone(next.session.startZdt.epochMilliseconds, zone)) {
		local.hidden = false;
		local.textContent = localLine(next.session, viewerZone, formatDateLong);
	} else {
		local.hidden = true;
	}

	fillRhythm(page, buckets, nowCivil);

	if (mode === 'view')
		fillScheduleView(page, sessions, next, nowMs, zone, viewerZone, data.targetHours);
}

function fillRhythm(page: Element, buckets: WeekBucket[], nowCivil: PlainDate) {
	const maxWeekHours = Math.max(...buckets.map((b) => b.doneHours + b.upcomingHours), 1);
	const strip = slot(page, '.strip');
	strip.replaceChildren();
	const nowIndex = nowWeekIndex(buckets, nowCivil);
	for (const [index, bucket] of buckets.entries()) {
		const total = bucket.doneHours + bucket.upcomingHours;
		const slotEl = cloneTemplate('tpl-bar').firstElementChild as HTMLElement;
		const bar = slotEl.querySelector('.bar') as HTMLElement;
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
	const months: { month: string; weeks: number }[] = [];
	for (const bucket of buckets) {
		const month = formatMonth(bucket.weekStart, locale);
		const current = months[months.length - 1];
		if (current !== undefined && current.month === month) current.weeks += 1;
		else months.push({ month, weeks: 1 });
	}
	for (const group of months) {
		const cell = cloneTemplate('tpl-axis-cell').firstElementChild as HTMLElement;
		cell.textContent = group.month;
		cell.style.flexGrow = String(group.weeks);
		axis.appendChild(cell);
	}
}

function fillScheduleView(
	page: Element,
	sessions: Session[],
	next: { session: Session; inProgress: boolean } | null,
	nowMs: number,
	zone: string,
	viewerZone: string,
	targetHours: number,
) {
	const list = slot(page, '.schedule-slot');
	const ol = document.createElement('ol');
	ol.className = 'sessions';
	const percents = cumulativePercents(sessions, targetHours);
	for (const [index, session] of sessions.entries()) {
		const row = cloneTemplate('tpl-session');
		const item = row.firstElementChild as HTMLElement;
		item.classList.toggle('past', session.endZdt.epochMilliseconds <= nowMs);
		item.classList.toggle('next', next !== null && session === next.session);
		slot(row, '.date').textContent = formatDateShort(session.civilDate, locale);
		slot(row, '.time').textContent = formatRange(session.start, session.end, session.nextDay);
		if (!viewerMatchesZone(session.startZdt.epochMilliseconds, zone)) {
			slot(row, '.local-time').textContent = localLine(session, viewerZone, formatDateShort);
		}
		const hoursText = t(locale, 'hoursShort', { hours: formatHoursNum(session.hours, locale) });
		slot(row, '.hours').textContent =
			percents.length > 0 ? `${hoursText} · ${percents[index]}%` : hoursText;
		ol.appendChild(row);
	}
	list.replaceChildren(ol);
}

// The completed figure sits in its own .subline-completed span so the live
// refresh never rebuilds the target input, keeping its caret.
function buildSubline(page: Element, targetHours: number, mode: 'view' | 'edit') {
	const subline = slot(page, '.subline');
	subline.replaceChildren();
	// t() leaves unfilled placeholders in place.
	for (const part of t(locale, 'headerHours').split(/(\{completed\}|\{target\})/)) {
		if (part === '{completed}') {
			const span = document.createElement('span');
			span.className = 'subline-completed';
			subline.appendChild(span);
		} else if (part === '{target}' && mode === 'edit') {
			const input = document.createElement('input');
			input.name = 'targetHours';
			input.type = 'number';
			input.min = '0';
			input.max = String(MAX_TARGET_HOURS);
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
	const zoneSpan = document.createElement('span');
	zoneSpan.className = 'subline-zone';
	subline.appendChild(zoneSpan);
}

// Handlers live on #app (wired once in wireApp) and survive every
// replaceChildren, so nothing here re-attaches anything.
export function renderPage() {
	const data: GroupData = state.data ?? {
		title: '',
		targetHours: 0,
		timeZone: detectedZone(),
		sessions: [],
	};
	const mode = state.mode;
	const page = cloneTemplate('tpl-page').firstElementChild as HTMLElement;
	page.classList.toggle('editing', mode === 'edit');

	for (const el of page.querySelectorAll(mode === 'view' ? '.edit-only' : '.view-only'))
		el.remove();
	if (data.sessions.length === 0) page.querySelector('#download-ics')?.remove();
	if (typeof navigator.share !== 'function') page.querySelector('#share-link')?.remove();

	if (mode === 'view') {
		slot(page, '.masthead h2').textContent = data.title;
	} else {
		const title = slot(page, '.title-input') as HTMLInputElement;
		title.placeholder = t(locale, 'groupName');
		title.value = data.title;
		const rows = data.sessions.length > 0 ? data.sessions : [{ date: '', start: '', end: '' }];
		slot(page, '#rows').append(...rows.map(sessionRow));
		slot(page, '#zone-select').append(
			...zoneOptions(new Date().getTime()).map(
				({ value, label }) => new Option(label, value, false, value === data.timeZone),
			),
		);
	}

	buildSubline(page, data.targetHours, mode);

	if (mode === 'edit' && state.badLink) slot(page, '.note-badlink').hidden = false;

	app.replaceChildren(topbarFragment(), page);

	fillDerived(page, mode === 'edit' ? readForm() : data, new Date(), mode);
	if (mode === 'edit') markInvalidRows();
}

// Refreshes the live glance from current form values without rebuilding the
// inputs — so the caret survives.
export function refreshComputed() {
	clearBuildError();
	fillDerived(slot(app, '.page'), readForm(), new Date(), 'edit');
	markInvalidRows();
}

// Swaps only the topbar (theme/lang change) rather than rebuilding #app, which
// would drop unsaved input in the edit form.
export function refreshTopbar() {
	app.querySelector('.topbar')?.replaceWith(topbarFragment());
}
