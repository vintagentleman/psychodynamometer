// Ceilings the codec's wire format imposes. Not in codec.ts: it imports from
// sessions.ts, so importing back would cycle.

// The session count is a single byte.
export const MAX_SESSIONS = 255;

// The target is 16 bits of half-hours, capped at the whole hour below.
export const MAX_TARGET_HOURS = 32767;
