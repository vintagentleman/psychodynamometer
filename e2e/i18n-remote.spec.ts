import { expect, link, test, tuesdayGroup } from './fixtures.ts';

test.describe('language toggle', () => {
	test('switches to Russian, sets html lang, and persists across reload', async ({ page }) => {
		await page.goto(link(tuesdayGroup));
		await page.click('button.lang[data-lang="ru"]');
		await expect(page.locator('.page')).toContainText('Прогресс');
		await expect(page.locator('.next-when')).toContainText('23 июля');
		await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
		await page.reload();
		await expect(page.locator('.page')).toContainText('Расписание');
	});
});

test.describe('remote viewer', () => {
	test.use({ timezoneId: 'America/New_York' });

	test('shows group wall-clock time and localises the viewer line', async ({ page }) => {
		await page.goto(
			link({
				title: 'Moscow Group',
				targetHours: 10,
				timeZone: 'Europe/Moscow',
				sessions: [{ date: '2026-07-23', start: '18:00', end: '21:00' }],
			}),
		);
		const groupWhen = page.locator('.next-when');
		await expect(groupWhen).toContainText('23 July');
		await expect(groupWhen).toContainText('18:00');
		await expect(page.locator('.subline')).toContainText('GMT+3');
		await expect(page.locator('.next-local')).toBeVisible();
		// 18:00 Moscow (UTC+3) = 15:00 UTC = 11:00 New York (EDT, UTC-4)
		await expect(page.locator('.next-local')).toContainText('11:00');
	});
});
