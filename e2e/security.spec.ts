import { expect, link, test } from './fixtures.ts';

test('a hostile title renders inert as text', async ({ page }) => {
	await page.goto(
		link({
			title: '<img src=x onerror=window.__xss=1>',
			targetHours: 5,
			timeZone: 'UTC',
			sessions: [{ date: '2026-01-05', start: '10:00', end: '11:00' }],
		}),
	);
	await expect(page.locator('.masthead h2')).toContainText('<img');
	expect(await page.evaluate(() => (window as { __xss?: number }).__xss)).toBeUndefined();
});
