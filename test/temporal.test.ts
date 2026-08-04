import { expect, test } from 'vitest';

import { Temporal } from '../src/lib/temporal.ts';

test('Temporal is available and round-trips a plain date', () => {
	expect(Temporal.PlainDate.from('2026-06-18').toString()).toBe('2026-06-18');
});

test('a calendar-invalid date is rejected, not rolled over', () => {
	expect(() => Temporal.PlainDate.from('2026-02-30')).toThrow(RangeError);
});
