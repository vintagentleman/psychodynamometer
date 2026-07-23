import { messages, t } from '../i18n.ts';
import {
	computeProgress,
	detectedZone,
	findNextSession,
	formatDateLong,
	formatDateShort,
	formatHoursNum,
	formatLocalTime,
	formatMonth,
	formatOffsetTag,
	formatWeekRange,
	nowWeekIndex,
	parseSessions,
	progressSegments,
	viewerMatchesZone,
	weeklyBuckets,
	zonedCivilDate,
} from '../lib.ts';
import type { GroupData, Session, WeekBucket } from '../lib/sessions.ts';
import { cloneTemplate, segment, sessionRow, slot } from './dom.ts';
import { clearBuildError, markInvalidRows, readForm } from './form.ts';
import { app, locale, state } from './store.ts';

function topbarFragment() {
	const fragment = cloneTemplate('tpl-topbar');
	for (const button of fragment.querySelectorAll('button.lang')) {
		const lang = (button as HTMLElement).dataset.lang;
		button.classList.toggle('active', locale === lang);
		button.setAttribute('aria-pressed', String(locale === lang));
	}
	return fragment;
}

// Recompute the derived regions from `data`. Never touches inputs, so it is
// safe to call on every keystroke — the caret survives.
function fillDerived(page: Element, data: GroupData, now: Date, mode: 'view' | 'edit') {
	const zone = data.timeZone;
	const nowMs = now.getTime();
	const nowCivil = zonedCivilDate(now, zone);
	const sessions = parseSessions(data.sessions, zone);
	const { completedHours, upcomingHours, remainingHours, percent } = computeProgress(
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
		? `${formatDateLong(next.session.civilDate, locale)} · ${next.session.start}–${next.session.end}` +
			(next.inProgress ? ` · ${t(locale, 'inProgress')}` : '')
		: t(locale, sessions.length === 0 ? 'noSessions' : 'noUpcoming');

	const local = slot(page, '.next-local');
	if (next !== null && !viewerMatchesZone(next.session.startMs, zone)) {
		local.hidden = false;
		local.textContent =
			`${formatDateLong(new Date(next.session.startMs), locale)} · ` +
			`${formatLocalTime(next.session.startMs, locale)} · ${t(locale, 'yourTime')}`;
	} else {
		local.hidden = true;
	}

	fillRhythm(page, buckets, nowCivil);

	if (mode === 'view') fillScheduleView(page, sessions, next, nowMs, zone);
}

function fillRhythm(page: Element, buckets: WeekBucket[], nowCivil: Date) {
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
) {
	const list = slot(page, '.schedule-slot');
	const ol = document.createElement('ol');
	ol.className = 'sessions';
	for (const session of sessions) {
		const row = cloneTemplate('tpl-session');
		const item = row.firstElementChild as HTMLElement;
		item.classList.toggle('past', session.endMs <= nowMs);
		item.classList.toggle('next', next !== null && session === next.session);
		slot(row, '.date').textContent = formatDateShort(session.civilDate, locale);
		slot(row, '.time').textContent = `${session.start}–${session.end}`;
		if (session.endMs > nowMs && !viewerMatchesZone(session.startMs, zone)) {
			slot(row, '.local-time').textContent = formatLocalTime(session.startMs, locale);
		}
		slot(row, '.hours').textContent = t(locale, 'hoursShort', {
			hours: formatHoursNum(session.hours, locale),
		});
		ol.appendChild(row);
	}
	list.replaceChildren(ol);
}

// Build the masthead sub-line — target as text (view) or inline input (edit).
// The completed figure sits in its own .subline-completed span so the live
// refresh never rebuilds the target input, keeping its caret.
function buildSubline(page: Element, targetHours: number, mode: 'view' | 'edit') {
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
	const zoneSpan = document.createElement('span');
	zoneSpan.className = 'subline-zone';
	subline.appendChild(zoneSpan);
}

// Rebuild #app from state: one skeleton, editable regions rendered for the
// current mode. Handlers live on #app (wired once in wireApp) and survive every
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

	const titleSlot = slot(page, '.title-slot');
	if (mode === 'view') {
		const h2 = document.createElement('h2');
		h2.textContent = data.title;
		titleSlot.appendChild(h2);
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
		const zoneField = document.createElement('div');
		zoneField.className = 'zone-field';
		const zoneSelect = document.createElement('select');
		zoneSelect.id = 'zone-select';
		zoneSelect.setAttribute('aria-label', t(locale, 'timeZone'));
		for (const z of Intl.supportedValuesOf('timeZone')) {
			const opt = document.createElement('option');
			opt.value = z;
			opt.textContent = z;
			if (z === data.timeZone) opt.selected = true;
			zoneSelect.appendChild(opt);
		}
		const zoneHelp = document.createElement('p');
		zoneHelp.className = 'zone-help';
		zoneHelp.textContent = t(locale, 'timesInZone');
		zoneField.append(zoneSelect, zoneHelp);
		schedSlot.append(zoneField, list, add);
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

	app.replaceChildren(topbarFragment(), page);

	fillDerived(page, mode === 'edit' ? readForm() : data, new Date(), mode);
	if (mode === 'edit') markInvalidRows();
}

// Refresh the live glance (progress/next/rhythm) and row validity from the
// current form values, without rebuilding the inputs — so the caret survives.
export function refreshComputed() {
	clearBuildError();
	fillDerived(slot(app, '.page'), readForm(), new Date(), 'edit');
	markInvalidRows();
}
