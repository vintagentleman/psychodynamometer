import { expect, test as base } from '@playwright/test';

import { encodeGroup } from '../src/lib.ts';

// The absolute-date fixtures are authored against this frozen "today".
export const FROZEN = new Date(Date.UTC(2026, 6, 21, 12, 0));

export const test = base.extend<{ forbidConsoleErrors: void }>({
	page: async ({ page }, use) => {
		await page.clock.install({ time: FROZEN });
		await use(page);
	},
	forbidConsoleErrors: [
		async ({ page }, use) => {
			const errors: string[] = [];
			page.on('pageerror', (e) => errors.push(String(e)));
			page.on('console', (m) => {
				if (m.type() === 'error') errors.push(m.text());
			});
			await use();
			expect(errors, 'no page or console errors').toEqual([]);
		},
		{ auto: true },
	],
});

export { expect };

export type GroupInput = Parameters<typeof encodeGroup>[0];

export const link = (data: GroupInput) => `/#d=${encodeGroup(data)}`;

// Exactly at the wire format's one-byte session ceiling (see src/lib/limits.ts):
// 255 one-hour sessions spread over distinct days of 2026.
export const fullGroup: GroupInput = {
	title: 'Full',
	targetHours: 255,
	timeZone: 'UTC',
	sessions: Array.from({ length: 255 }, (_, i) => ({
		date: `2026-${String(Math.floor(i / 28) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
		start: '10:00',
		end: '11:00',
	})),
};

export const tuesdayGroup: GroupInput = {
	title: 'Tuesday Group',
	targetHours: 41.5,
	timeZone: 'UTC',
	sessions: [
		{ date: '2026-06-02', start: '19:00', end: '22:30' },
		{ date: '2026-06-09', start: '20:00', end: '23:00' },
		{ date: '2026-06-18', start: '19:00', end: '23:00' },
		{ date: '2026-06-25', start: '19:00', end: '22:30' },
		{ date: '2026-06-30', start: '19:00', end: '22:30' },
		{ date: '2026-07-16', start: '19:00', end: '21:00' },
		{ date: '2026-07-18', start: '09:00', end: '12:00' },
		{ date: '2026-07-23', start: '18:00', end: '21:00' },
		{ date: '2026-07-28', start: '18:00', end: '21:00' },
		{ date: '2026-08-04', start: '18:00', end: '22:00' },
		{ date: '2026-08-09', start: '08:00', end: '16:00' },
	],
};
