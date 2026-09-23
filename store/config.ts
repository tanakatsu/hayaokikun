import type { TimeOfDay } from './types';

// Daily window during which a punch-in counts, and the valid range for a
// per-weekday target time. Edit these two values to change it app-wide.
export const MIN_TARGET_TIME: TimeOfDay = '05:00:00';
export const MAX_TARGET_TIME: TimeOfDay = '08:00:00';

// Target time assigned to a weekday until the parent sets one explicitly.
export const DEFAULT_TARGET_TIME: TimeOfDay = '06:30:00';

// PIN that unlocks the parent-only settings screen until one is set.
export const DEFAULT_PARENT_PIN = '0000';
