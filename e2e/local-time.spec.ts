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
