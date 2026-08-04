import { readFileSync } from 'node:fs';

import { expect, link, test, tuesdayGroup } from './fixtures.ts';

test.describe('calendar export', () => {
	test('downloads an .ics with every session', async ({ page }) => {
		await page.goto(link(tuesdayGroup));
		const downloadPromise = page.waitForEvent('download');
		await page.locator('#download-ics').click();
		const download = await downloadPromise;
		expect(download.suggestedFilename()).toBe('Tuesday-Group.ics');
		const ics = readFileSync(await download.path(), 'utf8');
		await expect(page.locator('.session')).toHaveCount(11);
		expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(11);
		expect(ics).toContain('DTSTART:20260602T190000Z');
	});

	test('offers no export when the group has no sessions', async ({ page }) => {
		await page.goto(link({ title: 'Empty', targetHours: 10, timeZone: 'UTC', sessions: [] }));
		await expect(page.locator('#copy-link')).toBeVisible();
		await expect(page.locator('#download-ics')).toHaveCount(0);
	});

	test('share button is absent where navigator.share is missing', async ({ page }) => {
		await page.goto(link(tuesdayGroup));
		await expect(page.locator('#download-ics')).toBeVisible();
		await expect(page.locator('#share-link')).toHaveCount(0);
	});
});
