import { expect, link, test, tuesdayGroup } from './fixtures.ts';

const url = link(tuesdayGroup);

test.describe('view mode', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto(url);
	});

	test('masthead shows the group title', async ({ page }) => {
		await expect(page.locator('.masthead h2')).toHaveText('Tuesday Group');
	});

	test('app title is the sole h1', async ({ page }) => {
		await expect(page.locator('h1')).toHaveCount(1);
		await expect(page.locator('h1.app-title')).toHaveText('Psychodynamometer');
	});

	test('github link targets the repo', async ({ page }) => {
		await expect(page.locator('.gh-link')).toHaveAttribute(
			'href',
			/vintagentleman\/psychodynamometer/,
		);
	});

	test('app tagline is present', async ({ page }) => {
		await expect(page.locator('.app-tagline')).toContainText('link-shareable');
	});

	test('masthead states contracted hours', async ({ page }) => {
		await expect(page.locator('.subline')).toContainText('of 41.5 hours');
	});

	test('hero shows percent and remaining hours', async ({ page }) => {
		await expect(page.locator('.hero')).toContainText('%');
		await expect(page.locator('.hero')).toContainText('h left');
	});

	test('hero flags unscheduled hours', async ({ page }) => {
		await expect(page.locator('.hero')).toContainText('1 h unscheduled');
	});

	test('meter exposes labelled progressbar semantics', async ({ page }) => {
		const heroPct = ((await page.locator('.hero-value').textContent()) ?? '').replace('%', '');
		const meter = page.locator('.meter');
		await expect(meter).toHaveAttribute('role', 'progressbar');
		await expect(meter).toHaveAttribute('aria-valuemin', '0');
		await expect(meter).toHaveAttribute('aria-valuemax', '100');
		await expect(meter).toHaveAttribute('aria-valuenow', heroPct);
		await expect(meter).toHaveAttribute('aria-label', /.+/);
	});

	test('meter shows done, striped upcoming, and now tick', async ({ page }) => {
		const geom = await page.$eval('.meter', (el) => {
			const done = el.querySelector('.meter-done') as HTMLElement | null;
			const up = el.querySelector('.meter-upcoming') as HTMLElement | null;
			const now = el.querySelector('.meter-now') as HTMLElement | null;
			return {
				doneSet: done !== null && done.style.width !== '' && done.style.width !== '0%',
				upSet: up !== null && up.style.width !== '' && up.style.width !== '0%',
				striped:
					up !== null && getComputedStyle(up).backgroundImage.includes('repeating-linear-gradient'),
				nowSet: now !== null && now.style.left !== '',
			};
		});
		expect(geom).toEqual({ doneSet: true, upSet: true, striped: true, nowSet: true });
	});

	test('next session shows a spelled long date', async ({ page }) => {
		await expect(page.locator('.next-when')).toContainText('23 July');
	});

	test('viewer in the group zone sees no local line', async ({ page }) => {
		await expect(page.locator('.next-local')).toBeHidden();
	});

	test('no numeric DD.MM appears anywhere', async ({ page }) => {
		expect((await page.locator('.page').textContent()) ?? '').not.toMatch(/\d{2}\.\d{2}/);
	});

	test('rhythm renders 10 weekly buckets', async ({ page }) => {
		await expect(page.locator('.strip .bar')).toHaveCount(10);
	});

	test('an empty week shows as a gap', async ({ page }) => {
		const zero = await page.$$eval(
			'.strip .bar',
			(els) => els.filter((el) => el.style.height === '0px' || el.style.height === '0').length,
		);
		expect(zero).toBe(1);
	});

	test('no today divider exists', async ({ page }) => {
		await expect(page.locator('.today-divider')).toHaveCount(0);
	});

	test('current week with only future sessions renders upcoming', async ({ page }) => {
		const bar = page.locator('.strip .slot:nth-child(8) .bar');
		await expect(bar.locator('.seg.done')).toHaveCount(0);
		await expect(bar.locator('.seg.upcoming')).toHaveCount(1);
	});

	test('done and upcoming segments split across weeks', async ({ page }) => {
		await expect(page.locator('.strip .bar .seg.done')).toHaveCount(6);
		await expect(page.locator('.strip .bar .seg.upcoming')).toHaveCount(3);
	});

	test('axis has one label per month group', async ({ page }) => {
		const labels = await page.$$eval('.axis .axis-cell', (cells) =>
			cells.map((c) => c.textContent).filter((t) => t !== ''),
		);
		expect(labels).toEqual(['Jun', 'Jul', 'Aug']);
		await expect(page.locator('.axis .axis-cell')).toHaveCount(3);
	});

	test('bar tooltip names the week range', async ({ page }) => {
		await expect(page.locator('.strip .slot').first()).toHaveAttribute(
			'title',
			'1 – 7 Jun · 3.5 h',
		);
	});

	test('rhythm marks exactly one current week', async ({ page }) => {
		await expect(page.locator('.strip .slot.now')).toHaveCount(1);
	});

	test('rhythm shows a per-week caption', async ({ page }) => {
		await expect(page.locator('.rhythm-caption')).not.toBeEmpty();
	});

	test('schedule lists all sessions with past and next marked', async ({ page }) => {
		await expect(page.locator('.sessions .session')).toHaveCount(11);
		await expect(page.locator('.sessions .session.past')).toHaveCount(7);
		await expect(page.locator('.sessions .session.next')).toHaveCount(1);
	});

	test('schedule rows carry a running cumulative percentage', async ({ page }) => {
		const rows = page.locator('.sessions .session');
		await expect(rows.first().locator('.hours')).toContainText('8%');
		await expect(rows.last().locator('.hours')).toContainText('98%');
	});

	test('view offers a copy-link action', async ({ page }) => {
		await expect(page.locator('#copy-link')).toHaveCount(1);
	});
});

test.describe('colour scheme', () => {
	test('system dark recolours the surface', async ({ page }) => {
		await page.goto(url);
		const lightBg = await page.$eval('.page', (el) => getComputedStyle(el).backgroundColor);
		await page.emulateMedia({ colorScheme: 'dark' });
		const darkBg = await page.$eval('.page', (el) => getComputedStyle(el).backgroundColor);
		expect(darkBg).not.toBe('');
		expect(darkBg).not.toBe(lightBg);
	});
});

test.describe('responsive layout', () => {
	test.describe('desktop', () => {
		test.use({ viewport: { width: 1280, height: 900 } });

		test('schedule sits beside the glance pane in view mode', async ({ page }) => {
			await page.goto(url);
			const panes = await page.evaluate(() => {
				const prog = document.querySelector('.sec-progress')?.getBoundingClientRect();
				const sched = document.querySelector('.sec-schedule')?.getBoundingClientRect();
				if (!prog || !sched) return null;
				return { sideBySide: sched.left >= prog.right - 1, alignedTop: sched.top < prog.bottom };
			});
			expect(panes).toEqual({ sideBySide: true, alignedTop: true });
		});

		test('schedule editor sits beside the glance in build mode', async ({ page }) => {
			await page.goto('/');
			const sideBySide = await page.evaluate(() => {
				const prog = document.querySelector('.sec-progress')?.getBoundingClientRect();
				const sched = document.querySelector('.sec-schedule')?.getBoundingClientRect();
				if (!prog || !sched) return false;
				return sched.left >= prog.right - 1;
			});
			expect(sideBySide).toBe(true);
		});
	});

	test('sections stack on mobile', async ({ page }) => {
		await page.goto(url);
		const stacked = await page.evaluate(() => {
			const prog = document.querySelector('.sec-progress')?.getBoundingClientRect();
			const sched = document.querySelector('.sec-schedule')?.getBoundingClientRect();
			if (!prog || !sched) return false;
			return sched.top >= prog.bottom;
		});
		expect(stacked).toBe(true);
	});

	// .page clips its overflow, so a row wider than the page loses its end time
	// and remove button silently — no scrollbar, and fill() still reaches them.
	test('every session-row control stays inside the page on mobile', async ({ page }) => {
		await page.goto('/');
		const escaping = await page.evaluate(() => {
			const bounds = document.querySelector('.page')!.getBoundingClientRect();
			return [...document.querySelectorAll('#rows .row > *')]
				.filter((el) => {
					const box = el.getBoundingClientRect();
					return box.right > bounds.right + 0.5 || box.left < bounds.left - 0.5;
				})
				.map(
					(el) => `${el.tagName.toLowerCase()}.${(el as HTMLInputElement).name || el.className}`,
				);
		});
		expect(escaping).toEqual([]);
	});
});
