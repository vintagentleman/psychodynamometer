import { expect, link, test, tuesdayGroup } from './fixtures.ts';

// A ring only helps if it is painted. An ancestor with a non-visible overflow
// clips whatever falls outside its box, so a control needs outline-width +
// outline-offset of clearance on every side — or a negative offset, which draws
// the ring inside the control where nothing can clip it.
const NEEDED = 4;

const unpaintableRings = async (page: import('@playwright/test').Page) =>
	page.evaluate((needed) => {
		const failures: string[] = [];
		for (const el of document.querySelectorAll<HTMLElement>('button, a[href], input, select')) {
			el.focus();
			const style = getComputedStyle(el);
			const name = `${el.tagName.toLowerCase()}.${el.className || (el as HTMLInputElement).name}`;
			if (style.outlineStyle === 'none') {
				failures.push(`${name}: no outline`);
				continue;
			}
			const offset = Number.parseFloat(style.outlineOffset);
			if (offset < 0) continue;
			let clipper = el.parentElement;
			while (clipper !== null && getComputedStyle(clipper).overflow === 'visible') {
				clipper = clipper.parentElement;
			}
			if (clipper === null) continue;
			const box = el.getBoundingClientRect();
			const clip = clipper.getBoundingClientRect();
			const room = Math.min(
				box.left - clip.left,
				box.top - clip.top,
				clip.right - box.right,
				clip.bottom - box.bottom,
			);
			if (room < needed) failures.push(`${name}: ${room}px clearance inside .${clipper.className}`);
		}
		return failures;
	}, NEEDED);

test.describe('focus indicators', () => {
	test('every control in build mode has a ring that can paint', async ({ page }) => {
		await page.goto('/');
		await page.keyboard.press('Tab'); // establish keyboard modality for :focus-visible
		expect(await unpaintableRings(page)).toEqual([]);
	});

	test('every control in view mode has a ring that can paint', async ({ page }) => {
		await page.goto(link(tuesdayGroup));
		await page.keyboard.press('Tab');
		expect(await unpaintableRings(page)).toEqual([]);
	});
});
