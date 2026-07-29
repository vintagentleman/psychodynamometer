// Ceilings the wire format in codec.ts imposes on a group. They live here rather
// than in codec.ts because codec.ts already imports from sessions.ts, and the
// reverse import would be a cycle.

// The session count is a single byte.
export const MAX_SESSIONS = 255;

// The target is 16 bits of half-hours, capped at the whole hour below.
export const MAX_TARGET_HOURS = 32767;
