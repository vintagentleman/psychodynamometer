import { expect, link, test } from './fixtures.ts';

test.describe('next-session local line', () => {
	test.use({ timezoneId: 'America/New_York' });

	test('shows a local start–end range with the viewer offset, not "your time"', async ({
		page,
	}) => {
		await page.goto(
			link({
				title: 'Moscow Group',
				targetHours: 10,
				timeZone: 'Europe/Moscow',
				sessions: [{ date: '2026-07-23', start: '18:00', end: '21:00' }],
			}),
		);
		const local = page.locator('.next-local');
		await expect(local).toBeVisible();
		// 18:00–21:00 Moscow (UTC+3) = 11:00–14:00 New York (EDT, UTC-4)
		await expect(local).toContainText('11:00–14:00');
		await expect(local).toContainText('GMT-4');
		await expect(local).not.toContainText('your time');
	});

	test('prepends the local date when it differs from the group day', async ({ page }) => {
		await page.goto(
			link({
				title: 'Moscow Group',
				targetHours: 10,
				timeZone: 'Europe/Moscow',
				sessions: [{ date: '2026-07-24', start: '01:00', end: '02:00' }],
			}),
		);
		// 01:00–02:00 Moscow Jul 24 = 18:00–19:00 New York Jul 23 (a different day)
		const local = page.locator('.next-local');
		await expect(local).toBeVisible();
		await expect(local).toContainText('23 July');
		await expect(local).toContainText('18:00–19:00');
		await expect(local).toContainText('GMT-4');
	});
});

test.describe('schedule local sub-line', () => {
	test.use({ timezoneId: 'America/New_York' });

	test('shows a local range on both past and upcoming rows at equal height', async ({ page }) => {
		await page.goto(
			link({
				title: 'Moscow Group',
				targetHours: 10,
				timeZone: 'Europe/Moscow',
				sessions: [
					{ date: '2026-07-16', start: '18:00', end: '21:00' }, // past
					{ date: '2026-07-23', start: '18:00', end: '21:00' }, // upcoming (next)
				],
			}),
		);
		const rows = page.locator('.sessions .session');
		await expect(rows).toHaveCount(2);
		const past = rows.nth(0);
		await expect(past).toHaveClass(/past/);
		await expect(past.locator('.local-time')).toContainText('11:00–14:00');
		await expect(past.locator('.local-time')).toContainText('GMT-4');
		const upcoming = rows.nth(1);
		await expect(upcoming.locator('.local-time')).toContainText('11:00–14:00');
		await expect(upcoming.locator('.local-time')).toContainText('GMT-4');
		// both carry a sub-line → uniform row height (bold vs regular weight
		// leaves at most sub-pixel font-metric noise, not a ragged extra line)
		const h0 = (await past.boundingBox())?.height ?? 0;
		const h1 = (await upcoming.boundingBox())?.height ?? 0;
		expect(Math.abs(h0 - h1)).toBeLessThanOrEqual(2);
	});
});

test.describe('schedule sub-line hidden when the zone matches', () => {
	test('no local sub-line for a viewer in the group zone', async ({ page }) => {
		await page.goto(
			link({
				title: 'UTC Group',
				targetHours: 10,
				timeZone: 'UTC',
				sessions: [{ date: '2026-07-23', start: '18:00', end: '21:00' }],
			}),
		);
		const filled = await page.$$eval(
			'.sessions .local-time',
			(els) => els.filter((el) => (el.textContent ?? '') !== '').length,
		);
		expect(filled).toBe(0);
	});
});

test.describe('overnight sessions', () => {
	test('marks the group-zone range with +1 in both the next line and the schedule', async ({
		page,
	}) => {
		await page.goto(
			link({
				title: 'Night Group',
				targetHours: 10,
				timeZone: 'UTC',
				sessions: [{ date: '2026-07-23', start: '22:00', end: '01:00' }],
			}),
		);
		await expect(page.locator('.next-when')).toContainText('Thursday 23 July · 22:00–01:00 +1');
		await expect(page.locator('.sessions .session .time')).toHaveText('22:00–01:00 +1');
		// three hours, not twenty-one
		await expect(page.locator('.sessions .session .hours')).toContainText('3 h');
		// viewer is UTC (playwright.config.ts), so no local sub-line is needed
		await expect(page.locator('.next-local')).toBeHidden();
	});
});

test.describe('overnight in the viewer zone only', () => {
	test.use({ timezoneId: 'Europe/Moscow' });

	test('marks +1 on the local line when only the local end crosses midnight', async ({ page }) => {
		await page.goto(
			link({
				title: 'UTC Group',
				targetHours: 10,
				timeZone: 'UTC',
				sessions: [{ date: '2026-07-23', start: '20:00', end: '23:00' }],
			}),
		);
		// 20:00–23:00 UTC is 23:00–02:00 in Moscow: the group day never rolls, the viewer's does
		await expect(page.locator('.next-when')).toContainText('20:00–23:00');
		await expect(page.locator('.next-when')).not.toContainText('+1');
		const local = page.locator('.next-local');
		await expect(local).toContainText('23:00–02:00 +1');
		await expect(local).toContainText('GMT+3');
	});
});

test.describe('zone picker', () => {
	test.use({ timezoneId: 'Europe/Moscow' });

	test('labels options with GMT offsets and preselects the detected zone', async ({ page }) => {
		await page.goto('/'); // fresh build → edit mode
		const select = page.locator('#zone-select');
		await expect(select).toHaveCount(1);
		const firstLabels = await select
			.locator('option')
			.evaluateAll((opts) => opts.slice(0, 5).map((o) => o.textContent ?? ''));
		expect(firstLabels.every((l) => l.startsWith('(GMT'))).toBe(true);
		// value stays IANA; the detected zone (Europe/Moscow here) is selected
		await expect(select).toHaveValue('Europe/Moscow');
		expect(await select.locator('option:checked').textContent()).toBe('(GMT+03:00) Europe/Moscow');
	});
});
