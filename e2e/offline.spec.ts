import { readFileSync } from 'node:fs';

import type { Page } from '@playwright/test';

import { expect, link, test, tuesdayGroup } from './fixtures.ts';

// Registration races the test: wait until the worker controls the page.
const controlled = (page: Page) =>
	page.evaluate(async () => {
		await navigator.serviceWorker.ready;
		if (navigator.serviceWorker.controller === null) {
			await new Promise((resolve) => {
				navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true });
			});
		}
	});

test.describe('offline', () => {
	test('renders a previously visited link offline', async ({ page, context }) => {
		await page.goto(link(tuesdayGroup));
		await controlled(page);
		await context.setOffline(true);
		await page.reload();
		await expect(page.locator('.session')).toHaveCount(11);
		const cacheNames = await page.evaluate(() => caches.keys());
		expect(cacheNames).toHaveLength(1);
		expect(cacheNames[0]).toMatch(/^psychodynamometer-[0-9a-f]{8}$/);
	});

	test('exports the calendar offline', async ({ page, context }) => {
		await page.goto(link(tuesdayGroup));
		await controlled(page);
		await context.setOffline(true);
		await page.reload();
		const downloadPromise = page.waitForEvent('download');
		await page.locator('#download-ics').click();
		const download = await downloadPromise;
		const ics = readFileSync(await download.path(), 'utf8');
		expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(11);
	});
});
