import type { Page } from '@playwright/test';

import { expect, fullGroup, link, test, tuesdayGroup } from './fixtures.ts';

const url = link(tuesdayGroup);

const fillValidBuild = async (page: Page) => {
	await page.goto('/');
	await page.fill('input[name="title"]', 'Test Group');
	await page.fill('input[name="targetHours"]', '10');
	await page.fill('input[name="date"]', '2026-01-05');
	await page.fill('input[name="start"]', '10:00');
	await page.fill('input[name="end"]', '13:00');
};

test.describe('build mode (no hash)', () => {
	test('empty state is an editable build screen', async ({ page }) => {
		await page.goto('/');
		await expect(page.locator('.page.editing')).toHaveCount(1);
		await expect(page.locator('h1.app-title')).toHaveCount(1);
		await expect(page.locator('.subline input[name="targetHours"]')).toHaveCount(1);
		await expect(page.locator('.subline')).toContainText('hours');
		await expect(page.locator('#rows .row')).toHaveCount(1);
		await expect(page.locator('.hero-value')).toHaveText('0%');
	});

	test('live glance updates while editing and leaves the url untouched', async ({ page }) => {
		await fillValidBuild(page);
		await expect(page.locator('.hero-value')).not.toHaveText('0%');
		await expect(page.locator('.strip .bar')).not.toHaveCount(0);
		expect(page.url()).not.toContain('#d=');
	});

	test('the live glance flags unscheduled hours while editing', async ({ page }) => {
		await fillValidBuild(page);
		await expect(page.locator('.hero')).toContainText('7 h unscheduled');
	});

	test('invalid rows are flagged with aria-invalid and clear when fixed', async ({ page }) => {
		await fillValidBuild(page);
		await page.fill('input[name="end"]', '10:00'); // zero-length; 09:00 would now be overnight
		expect(page.url()).not.toContain('#d=');
		await expect(page.locator('#rows .row.invalid')).toHaveCount(1);
		await expect(page.locator('#rows .row input[aria-invalid="true"]')).toHaveCount(3);
		await page.fill('input[name="end"]', '13:00');
		await expect(page.locator('#rows .row.invalid')).toHaveCount(0);
		await expect(page.locator('#rows .row input[aria-invalid="true"]')).toHaveCount(0);
	});

	test('rows can be added, removed, and the last is protected', async ({ page }) => {
		await page.goto('/');
		await page.click('#add-row');
		await expect(page.locator('#rows .row')).toHaveCount(2);
		await page.click('#rows .row:nth-child(2) .remove');
		await expect(page.locator('#rows .row')).toHaveCount(1);
		await page.click('#rows .row .remove');
		await expect(page.locator('#rows .row')).toHaveCount(1);
	});
});

test.describe('copy link', () => {
	test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

	test('copies a compact base64url link and flashes', async ({ page }) => {
		await fillValidBuild(page);
		await page.click('#copy-link');
		await expect(page.locator('#copy-link')).toHaveText('Copied!');
		const copied = await page.evaluate(() => navigator.clipboard.readText());
		expect(copied).toMatch(/#d=[A-Za-z0-9_-]+$/);
		expect(copied.length).toBeLessThan(200);
	});

	test('a blank trailing row is excluded from the copied link', async ({ page }) => {
		await fillValidBuild(page);
		await page.click('#copy-link');
		const copied = await page.evaluate(() => navigator.clipboard.readText());
		await page.click('#add-row');
		await page.click('#copy-link');
		expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(copied);
	});

	test('a partially-filled row blocks copy and explains why', async ({ page }) => {
		await fillValidBuild(page);
		await page.click('#copy-link');
		const copied = await page.evaluate(() => navigator.clipboard.readText());
		await page.click('#add-row');
		await page.fill('#rows .row:nth-child(2) input[name="date"]', '2026-02-01');
		await page.click('#copy-link');
		await expect(page.locator('#rows .row.invalid')).toHaveCount(1);
		expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(copied);
		await expect(page.locator('.note-copyerror')).toBeVisible();
		await expect(page.locator('.note-copyerror')).toContainText('Fix the highlighted');
		await page.click('#rows .row:nth-child(2) .remove');
		await expect(page.locator('.note-copyerror')).toBeHidden();
	});

	test('a target above the ceiling blocks copy and explains why', async ({ page }) => {
		await fillValidBuild(page);
		await page.click('#copy-link');
		const copied = await page.evaluate(() => navigator.clipboard.readText());
		await page.fill('input[name="targetHours"]', '40000');
		await page.click('#copy-link');
		await expect(page.locator('.note-copyerror')).toContainText('up to 32,767 hours');
		await expect(page.locator('input[name="targetHours"]')).toHaveAttribute('aria-invalid', 'true');
		expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(copied);
		await page.fill('input[name="targetHours"]', '10');
		await expect(page.locator('.note-copyerror')).toBeHidden();
		await expect(page.locator('input[name="targetHours"]')).not.toHaveAttribute(
			'aria-invalid',
			'true',
		);
	});

	test('a negative target reads as no target rather than blocking', async ({ page }) => {
		await fillValidBuild(page);
		await page.fill('input[name="targetHours"]', '-5');
		// clamped to 0, which is a valid "no target" group: 3 planned hours are all over
		await expect(page.locator('.hero-value')).toHaveText('0%');
		await expect(page.locator('.hero')).toContainText('3 h overscheduled');
		await page.click('#copy-link');
		await expect(page.locator('#copy-link')).toHaveText('Copied!');
	});

	test('done with a target above the ceiling stays in edit and leaves the url alone', async ({
		page,
	}) => {
		await fillValidBuild(page);
		const before = page.url();
		await page.fill('input[name="targetHours"]', '40000');
		await page.click('#done');
		await expect(page.locator('.page.editing')).toHaveCount(1);
		expect(page.url()).toBe(before);
		await expect(page.locator('.note-copyerror')).toContainText('up to 32,767 hours');
	});

	test('done exits edit, writes the url, and round-trips from view', async ({ page }) => {
		await fillValidBuild(page);
		await page.click('#done');
		await expect(page.locator('.page.editing')).toHaveCount(0);
		expect(page.url()).toMatch(/#d=[A-Za-z0-9_-]+$/);
		await expect(page.locator('.masthead h2')).toHaveText('Test Group');
		await page.click('#copy-link');
		const fromView = await page.evaluate(() => navigator.clipboard.readText());
		expect(fromView).toMatch(/#d=[A-Za-z0-9_-]+$/);
		await page.goto(fromView);
		await expect(page.locator('.masthead h2')).toHaveText('Test Group');
	});

	test('done writes the url for an untitled group — the title is optional', async ({ page }) => {
		await page.goto('/');
		await page.fill('input[name="targetHours"]', '10');
		await page.fill('input[name="date"]', '2026-01-05');
		await page.fill('input[name="start"]', '10:00');
		await page.fill('input[name="end"]', '13:00');
		await page.click('#done');
		await expect(page.locator('.page.editing')).toHaveCount(0);
		expect(page.url()).toMatch(/#d=[A-Za-z0-9_-]+$/);
		await expect(page.locator('.masthead h2')).toBeEmpty();
		await page.goto(page.url());
		await expect(page.locator('.page.editing')).toHaveCount(0);
		await expect(page.locator('.hero-value')).not.toHaveText('0%');
	});

	test('a zero-target group is shareable and reads as overscheduled', async ({ page }) => {
		await page.goto('/');
		await page.fill('input[name="date"]', '2026-01-05');
		await page.fill('input[name="start"]', '10:00');
		await page.fill('input[name="end"]', '13:00');
		// Target left blank (coerces to 0); the glance flags the whole plan as over.
		await expect(page.locator('.hero')).toContainText('3 h overscheduled');
		await page.click('#done');
		await expect(page.locator('.page.editing')).toHaveCount(0);
		expect(page.url()).toMatch(/#d=[A-Za-z0-9_-]+$/);
		await page.goto(page.url());
		await expect(page.locator('.page.editing')).toHaveCount(0);
		await expect(page.locator('.hero-value')).toHaveText('0%');
		await expect(page.locator('.hero')).toContainText('3 h overscheduled');
	});
});

test.describe('editing a loaded group', () => {
	test('prefills the existing sessions and title', async ({ page }) => {
		await page.goto(url);
		await page.click('#edit');
		await expect(page.locator('#rows .row')).toHaveCount(11);
		await expect(page.locator('input[name="title"]')).toHaveValue('Tuesday Group');
		await expect(page.locator('#done')).toHaveCount(1);
	});

	test('leaves the url untouched until Done, then rewrites and persists it', async ({ page }) => {
		await page.goto(url);
		const loaded = page.url();
		await page.click('#edit');
		await page.fill('input[name="title"]', 'Renamed Group');
		expect(page.url()).toBe(loaded);
		await page.click('#done');
		expect(page.url()).not.toBe(loaded);
		expect(page.url()).toMatch(/#d=[A-Za-z0-9_-]+$/);
		await expect(page.locator('.masthead h2')).toHaveText('Renamed Group');
		await page.goto(page.url());
		await expect(page.locator('.masthead h2')).toHaveText('Renamed Group');
	});

	test('sorts session rows chronologically on Done', async ({ page }) => {
		await page.goto('/');
		await page.fill('input[name="targetHours"]', '10');
		await page.fill('#rows .row:nth-child(1) input[name="date"]', '2026-02-10');
		await page.fill('#rows .row:nth-child(1) input[name="start"]', '10:00');
		await page.fill('#rows .row:nth-child(1) input[name="end"]', '12:00');
		await page.click('#add-row');
		await page.fill('#rows .row:nth-child(2) input[name="date"]', '2026-01-05');
		await page.fill('#rows .row:nth-child(2) input[name="start"]', '10:00');
		await page.fill('#rows .row:nth-child(2) input[name="end"]', '13:00');
		await page.click('#done');
		await expect(page.locator('.page.editing')).toHaveCount(0);
		await page.click('#edit');
		await expect(page.locator('#rows .row:nth-child(1) input[name="date"]')).toHaveValue(
			'2026-01-05',
		);
		await expect(page.locator('#rows .row:nth-child(2) input[name="date"]')).toHaveValue(
			'2026-02-10',
		);
	});
});

test.describe('session cap', () => {
	test('refuses a 256th row and explains why', async ({ page }) => {
		await page.goto(link(fullGroup));
		await page.click('#edit');
		await expect(page.locator('#rows .row')).toHaveCount(255);
		await page.click('#add-row');
		await expect(page.locator('#rows .row')).toHaveCount(255);
		await expect(page.locator('.note-copyerror')).toContainText('up to 255 sessions');
	});
});

test.describe('bad hash', () => {
	test('shows the build screen with an explanatory note', async ({ page }) => {
		await page.goto('/#d=%%%garbage%%%');
		await expect(page.locator('.page.editing')).toHaveCount(1);
		await expect(page.locator('.note-badlink')).toBeVisible();
		await expect(page.locator('.note-badlink')).toContainText('could not be read');
	});
});
