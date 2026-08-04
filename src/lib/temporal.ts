import type { Temporal as TemporalTypes } from 'temporal-polyfill';

declare global {
	// Absent until the engine ships Temporal natively.
	var Temporal: typeof TemporalTypes | undefined;
}

export type PlainDate = TemporalTypes.PlainDate;
export type PlainTime = TemporalTypes.PlainTime;
export type ZonedDateTime = TemporalTypes.ZonedDateTime;

// The import must stay dynamic — static would bundle the polyfill for everyone.
export const Temporal: typeof TemporalTypes =
	globalThis.Temporal ?? (await import('temporal-polyfill')).Temporal;
