import type { Temporal as TemporalTypes } from 'temporal-polyfill';

declare global {
	// Models the pre-Baseline reality: absent until the engine ships Temporal.
	var Temporal: typeof TemporalTypes | undefined;
}

export type PlainDate = TemporalTypes.PlainDate;
export type PlainTime = TemporalTypes.PlainTime;
export type ZonedDateTime = TemporalTypes.ZonedDateTime;

// Native when the engine has it; only otherwise is the polyfill chunk fetched.
export const Temporal: typeof TemporalTypes =
	globalThis.Temporal ?? (await import('temporal-polyfill')).Temporal;
