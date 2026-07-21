import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { encodeGroup } from '../src/lib.js';

/** @type {Record<string, string>} */
const TYPES = {
	'.html': 'text/html',
	'.css': 'text/css',
	'.js': 'text/javascript',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
};
const root = fileURLToPath(new URL('..', import.meta.url));
const server = createServer(async (req, res) => {
	try {
		const path = normalize(decodeURIComponent((req.url ?? '/').split('?')[0]));
		const file = path === '/' || path === '\\' ? '/index.html' : path;
		const body = await readFile(join(root, file));
		res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
		res.end(body);
	} catch {
		res.writeHead(404);
		res.end();
	}
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(undefined)));
const address = /** @type {import('node:net').AddressInfo} */ (server.address());
const BASE = `http://127.0.0.1:${address.port}`;

const data = {
	title: 'Tuesday Group',
	targetHours: 41.5,
	sessions: [
		{ date: '2026-06-02', start: '19:00', end: '22:30' },
		{ date: '2026-06-09', start: '20:00', end: '23:00' },
		{ date: '2026-06-18', start: '19:00', end: '23:00' },
		{ date: '2026-06-25', start: '19:00', end: '22:30' },
		{ date: '2026-06-30', start: '19:00', end: '22:30' },
		{ date: '2026-07-16', start: '19:00', end: '21:00' },
		{ date: '2026-07-18', start: '09:00', end: '12:00' },
		{ date: '2026-07-23', start: '18:00', end: '21:00' },
		{ date: '2026-07-28', start: '18:00', end: '21:00' },
		{ date: '2026-08-04', start: '18:00', end: '22:00' },
		{ date: '2026-08-09', start: '08:00', end: '16:00' },
	],
};

const url = `${BASE}/#d=${encodeGroup(data)}`;
/** @type {string[]} */
const results = [];
/**
 * @param {string} name
 * @param {boolean} cond
 * @param {string} [detail]
 */
const check = (name, cond, detail = '') =>
	results.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);

const browser = await chromium.launch();
const ctx = await browser.newContext({
	viewport: { width: 400, height: 900 },
	permissions: ['clipboard-read', 'clipboard-write'],
});
const page = await ctx.newPage();
// Freeze the page clock: fixtures below are absolute dates authored against
// this "today", so the suite stays deterministic as real time passes.
await page.clock.install({ time: new Date(2026, 6, 21, 12, 0) });
/** @type {string[]} */
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

// --- View mode ---
await page.goto(url);
check('masthead title', (await page.textContent('.masthead h1')) === 'Tuesday Group');
const masthead = (await page.textContent('.masthead-hours')) ?? '';
check('masthead hours line', /of 41.5 contracted hours/.test(masthead), masthead.trim());
const hero = (await page.textContent('.hero')) ?? '';
check('hero percent + remaining', /%/.test(hero) && /h left/.test(hero), hero.trim());
const nextWhen = (await page.textContent('.next-when')) ?? '';
check('next session spelled long date', /23 July/.test(nextWhen), nextWhen.trim());
check('no numeric DD.MM anywhere', !/\d{2}\.\d{2}/.test((await page.textContent('.page')) ?? ''));
const bars = await page.$$('.strip .bar');
check('rhythm bars = 10 weekly buckets', bars.length === 10, `got ${bars.length}`);
const zeroBars = await page.$$eval(
	'.strip .bar',
	(els) => els.filter((el) => el.style.height === '0px' || el.style.height === '0').length,
);
check('empty week visible as gap', zeroBars === 1, `${zeroBars} zero-height bars`);
check('no today divider exists', (await page.$$('.today-divider')).length === 0);
// week of 20 Jul contains only the future 23 Jul session — must NOT read as done
check(
	'current week with only future sessions renders upcoming',
	await page.$eval(
		'.strip .slot:nth-child(8) .bar',
		(bar) => bar.querySelector('.seg.done') === null && bar.querySelector('.seg.upcoming') !== null,
	),
);
check('done segments in 6 weeks', (await page.$$('.strip .bar .seg.done')).length === 6);
check('upcoming segments in 3 weeks', (await page.$$('.strip .bar .seg.upcoming')).length === 3);
const axisLabels = await page.$$eval('.axis .axis-cell', (cells) =>
	cells.map((cell) => cell.textContent).filter((text) => text !== ''),
);
check(
	'month labels for each month group',
	axisLabels.join(',') === 'Jun,Jul,Aug',
	axisLabels.join(','),
);
check('axis has one cell per month group', (await page.$$('.axis .axis-cell')).length === 3);
const rows = await page.$$('.sessions .session');
check('schedule rows = 11', rows.length === 11, `got ${rows.length}`);
check('past rows marked', (await page.$$('.sessions .session.past')).length === 7);
check('next row emphasized', (await page.$$('.sessions .session.next')).length === 1);

// --- Dark mode ---
await page.emulateMedia({ colorScheme: 'dark' });
const bg = await page.$eval('.page', (el) => getComputedStyle(el).backgroundColor);
check('dark surface applied', bg === 'rgb(26, 26, 25)', bg);
await page.emulateMedia({ colorScheme: 'light' });

// --- Language toggle ---
await page.click('button.lang[data-lang="ru"]');
check('ru labels render', ((await page.textContent('.page')) ?? '').includes('Прогресс'));
const ruNext = (await page.textContent('.next-when')) ?? '';
check('ru long date', /23 июля/.test(ruNext), ruNext.trim());
check('html lang follows', (await page.getAttribute('html', 'lang')) === 'ru');
await page.reload();
check('ru persists after reload', ((await page.textContent('.page')) ?? '').includes('Расписание'));
await page.click('button.lang[data-lang="en"]');

// --- Edit round-trip ---
await page.click('#edit');
check('edit prefills 11 rows', (await page.$$('#rows .row')).length === 11);
check('edit prefills title', (await page.inputValue('input[name="title"]')) === 'Tuesday Group');

// --- Build mode from scratch ---
await page.goto(`${BASE}/`);
check('no hash -> build mode', (await page.$$('#build')).length === 1);
check('preview hint shown', ((await page.textContent('#preview')) ?? '').includes('Fill in'));
await page.fill('input[name="title"]', 'Test Group');
await page.fill('input[name="targetHours"]', '10');
await page.fill('input[name="date"]', '2026-01-05');
await page.fill('input[name="start"]', '10:00');
await page.fill('input[name="end"]', '13:00');
check('live preview renders', (await page.$$('#preview .page')).length === 1);
check('preview shows title', (await page.textContent('#preview .masthead h1')) === 'Test Group');

await page.fill('input[name="end"]', '09:00');
check('invalid row flagged', (await page.$$('#rows .row.invalid')).length === 1);
await page.fill('input[name="end"]', '13:00');
check('invalid flag clears', (await page.$$('#rows .row.invalid')).length === 0);

await page.click('#add-row');
check('add row works', (await page.$$('#rows .row')).length === 2);
await page.click('#rows .row:nth-child(2) .remove');
check('remove row works', (await page.$$('#rows .row')).length === 1);
await page.click('#rows .row .remove');
check('last row protected', (await page.$$('#rows .row')).length === 1);

await page.click('#copy-link');
const flashed = await page
	.waitForFunction(() => document.querySelector('#copy-link')?.textContent === 'Copied!', null, {
		timeout: 2000,
	})
	.then(() => true)
	.catch(() => false);
check('copied flash', flashed);
const copied = await page.evaluate(() => navigator.clipboard.readText());
check('clipboard has compact v2 url', /#d=2~/.test(copied), copied.slice(0, 60) + '…');
check('compact link is short', copied.length < 200, `${copied.length} chars`);

await page.click('#add-row');
await page.click('#copy-link');
const copiedWithBlank = await page.evaluate(() => navigator.clipboard.readText());
check('blank row excluded from copied link', copiedWithBlank === copied);
await page.fill('#rows .row:nth-child(2) input[name="date"]', '2026-02-01');
await page.click('#copy-link');
check('partial row flagged invalid on copy', (await page.$$('#rows .row.invalid')).length === 1);
check(
	'partial row blocks copy',
	(await page.evaluate(() => navigator.clipboard.readText())) === copied,
);
await page.click('#rows .row:nth-child(2) .remove');

await page.goto(copied);
check('copied link round-trips', (await page.textContent('.masthead h1')) === 'Test Group');

// --- Bad hash ---
await page.goto(`${BASE}/#d=%%%garbage%%%`);
check('bad hash -> build + note', (await page.$$('.note')).length === 2);
check(
	'bad-link note text',
	((await page.textContent('.note')) ?? '').includes('could not be read'),
);

// --- Rhythm edge cases ---
const futureOnly = encodeGroup({
	title: 'F',
	targetHours: 10,
	sessions: [
		{ date: '2026-08-05', start: '10:00', end: '13:00' },
		{ date: '2026-09-25', start: '10:00', end: '13:00' },
	],
});
await page.goto(`${BASE}/#d=${futureOnly}`);
check('all-future: only upcoming segments', (await page.$$('.strip .seg.done')).length === 0);
const geo = await page.$eval('.strip', (strip) => {
	const slots = [...strip.querySelectorAll('.slot')];
	const sr = strip.getBoundingClientRect();
	const first = slots[0].getBoundingClientRect();
	const last = slots[slots.length - 1].getBoundingClientRect();
	return { leftGap: Math.abs(sr.left - first.left), rightGap: Math.abs(sr.right - last.right) };
});
check(
	'week slots span full axis width',
	geo.leftGap < 2 && geo.rightGap < 2,
	`leftGap=${geo.leftGap.toFixed(1)} rightGap=${geo.rightGap.toFixed(1)}`,
);
const upColor = await page.$eval(
	'.strip .seg.upcoming',
	(b) => getComputedStyle(b).backgroundColor,
);
check('upcoming mark contrast raised', upColor === 'rgb(85, 152, 231)', upColor);

const pastOnly = encodeGroup({
	title: 'P',
	targetHours: 10,
	sessions: [
		{ date: '2026-05-05', start: '10:00', end: '13:00' },
		{ date: '2026-06-25', start: '10:00', end: '13:00' },
	],
});
await page.goto(`${BASE}/#d=${pastOnly}`);
check('all-past: only done segments', (await page.$$('.strip .seg.upcoming')).length === 0);

// two August sessions in different weeks — ONE Aug label spanning both bars
const twoAug = encodeGroup({
	title: 'A',
	targetHours: 10,
	sessions: [
		{ date: '2026-08-09', start: '12:00', end: '13:00' },
		{ date: '2026-08-23', start: '12:00', end: '18:00' },
	],
});
await page.goto(`${BASE}/#d=${twoAug}`);
const augAxis = await page.$$eval('.axis .axis-cell', (cells) => cells.map((c) => c.textContent));
check(
	'one month label for two august weeks',
	augAxis.length === 1 && augAxis[0] === 'Aug',
	augAxis.join(','),
);
check(
	'month label spans all its bars',
	await page.evaluate(() => {
		const cell = document.querySelector('.axis .axis-cell')?.getBoundingClientRect();
		const barRects = [...document.querySelectorAll('.strip .bar')]
			.filter((bar) => bar.style.height !== '0')
			.map((bar) => bar.getBoundingClientRect());
		if (!cell || barRects.length === 0) return false;
		return barRects.every((rect) => rect.left >= cell.left - 2 && rect.right <= cell.right + 2);
	}),
);

// a week straddling "now" (frozen Tue 21 Jul): Mon session done, Thu session upcoming
const mixedWeek = encodeGroup({
	title: 'M',
	targetHours: 10,
	sessions: [
		{ date: '2026-07-20', start: '10:00', end: '11:00' },
		{ date: '2026-07-23', start: '12:00', end: '15:00' },
	],
});
await page.goto(`${BASE}/#d=${mixedWeek}`);
check(
	'mixed week stacks upcoming over done',
	await page.$eval(
		'.strip .bar',
		(bar) =>
			bar.querySelectorAll('.seg').length === 2 &&
			bar.firstElementChild !== null &&
			bar.firstElementChild.className.includes('upcoming') &&
			bar.lastElementChild !== null &&
			bar.lastElementChild.className.includes('done'),
	),
);

// --- Desktop two-pane layout ---
await page.setViewportSize({ width: 1280, height: 900 });
await page.goto(url);
const panes = await page.evaluate(() => {
	const prog = document.querySelector('.sec-progress')?.getBoundingClientRect();
	const sched = document.querySelector('.sec-schedule')?.getBoundingClientRect();
	if (!prog || !sched) return null;
	return { sideBySide: sched.left >= prog.right - 1, alignedTop: sched.top < prog.bottom };
});
check(
	'desktop: schedule beside glance pane',
	panes !== null && panes.sideBySide && panes.alignedTop,
);
await page.goto(`${BASE}/`);
const buildPanes = await page.evaluate(() => {
	const form = document.querySelector('#build')?.getBoundingClientRect();
	const preview = document.querySelector('.preview-pane')?.getBoundingClientRect();
	if (!form || !preview) return null;
	return preview.left >= form.right - 1;
});
check('desktop: preview beside form', buildPanes === true);
await page.setViewportSize({ width: 400, height: 900 });
await page.goto(url);
const stacked = await page.evaluate(() => {
	const prog = document.querySelector('.sec-progress')?.getBoundingClientRect();
	const sched = document.querySelector('.sec-schedule')?.getBoundingClientRect();
	if (!prog || !sched) return null;
	return sched.top >= prog.bottom;
});
check('mobile: sections stacked', stacked === true);

// --- XSS probe: hostile title must render inert ---
const hostile = encodeGroup({
	title: '<img src=x onerror=window.__xss=1>',
	targetHours: 5,
	sessions: [{ date: '2026-01-05', start: '10:00', end: '11:00' }],
});
await page.goto(`${BASE}/#d=${hostile}`);
await page.waitForTimeout(300);
check(
	'XSS: no execution',
	(await page.evaluate(() => /** @type {{ __xss?: number }} */ (window).__xss)) === undefined,
);
check(
	'XSS: title rendered as text',
	((await page.textContent('.masthead h1')) ?? '').includes('<img'),
);

check('zero page/console errors across all flows', errors.length === 0, errors.join(' | '));
await browser.close();
server.close();
console.log(results.join('\n'));
process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
