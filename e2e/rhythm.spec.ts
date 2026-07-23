import { expect, link, test } from './fixtures.ts';

test.describe('rhythm edge cases', () => {
	test('all-future group: only upcoming, full-width, striped, legend matches bars', async ({
		page,
	}) => {
		await page.goto(
			link({
				title: 'F',
				targetHours: 10,
				timeZone: 'UTC',
				sessions: [
					{ date: '2026-08-05', start: '10:00', end: '13:00' },
					{ date: '2026-09-25', start: '10:00', end: '13:00' },
				],
			}),
		);
		await expect(page.locator('.strip .seg.done')).toHaveCount(0);
		const geo = await page.$eval('.strip', (strip) => {
			const slots = [...strip.querySelectorAll('.slot')];
			const sr = strip.getBoundingClientRect();
			const first = slots[0].getBoundingClientRect();
			const last = slots[slots.length - 1].getBoundingClientRect();
			return { leftGap: Math.abs(sr.left - first.left), rightGap: Math.abs(sr.right - last.right) };
		});
		expect(geo.leftGap).toBeLessThan(2);
		expect(geo.rightGap).toBeLessThan(2);
		const upImage = await page.$eval(
			'.strip .seg.upcoming',
			(b) => getComputedStyle(b).backgroundImage,
		);
		expect(upImage).toContain('repeating-linear-gradient');
		const paint = await page.evaluate(() => {
			const styleOf = (sel: string) => {
				const el = document.querySelector(sel);
				if (!el) return null;
				const s = getComputedStyle(el);
				return `${s.backgroundColor}|${s.backgroundImage}`;
			};
			return {
				swatchMatchesBar: styleOf('.legend .swatch.upcoming') === styleOf('.strip .seg.upcoming'),
				doneSwatchPresent: styleOf('.legend .swatch.done') !== null,
			};
		});
		expect(paint).toEqual({ swatchMatchesBar: true, doneSwatchPresent: true });
	});

	test('all-past group renders only done segments', async ({ page }) => {
		await page.goto(
			link({
				title: 'P',
				targetHours: 10,
				timeZone: 'UTC',
				sessions: [
					{ date: '2026-05-05', start: '10:00', end: '13:00' },
					{ date: '2026-06-25', start: '10:00', end: '13:00' },
				],
			}),
		);
		await expect(page.locator('.strip .seg.upcoming')).toHaveCount(0);
	});

	test('two weeks in one month share a single spanning month label', async ({ page }) => {
		await page.goto(
			link({
				title: 'A',
				targetHours: 10,
				timeZone: 'UTC',
				sessions: [
					{ date: '2026-08-09', start: '12:00', end: '13:00' },
					{ date: '2026-08-23', start: '12:00', end: '18:00' },
				],
			}),
		);
		const labels = await page.$$eval('.axis .axis-cell', (cells) =>
			cells.map((c) => c.textContent),
		);
		expect(labels).toEqual(['Aug']);
		const spans = await page.evaluate(() => {
			const cell = document.querySelector('.axis .axis-cell')?.getBoundingClientRect();
			const barRects = [...document.querySelectorAll('.strip .bar')]
				.filter((bar) => (bar as HTMLElement).style.height !== '0')
				.map((bar) => bar.getBoundingClientRect());
			if (!cell || barRects.length === 0) return false;
			return barRects.every((rect) => rect.left >= cell.left - 2 && rect.right <= cell.right + 2);
		});
		expect(spans).toBe(true);
	});

	test('a week straddling now stacks upcoming over done', async ({ page }) => {
		await page.goto(
			link({
				title: 'M',
				targetHours: 10,
				timeZone: 'UTC',
				sessions: [
					{ date: '2026-07-20', start: '10:00', end: '11:00' },
					{ date: '2026-07-23', start: '12:00', end: '15:00' },
				],
			}),
		);
		const stack = await page.$eval('.strip .bar', (bar) => ({
			segs: bar.querySelectorAll('.seg').length,
			firstUpcoming: bar.firstElementChild?.className.includes('upcoming') ?? false,
			lastDone: bar.lastElementChild?.className.includes('done') ?? false,
		}));
		expect(stack).toEqual({ segs: 2, firstUpcoming: true, lastDone: true });
	});
});
