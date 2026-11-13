// Reconnect delay of the phone page: 1 s at first, doubling up to 10 s.
export const MIN_DELAY = 1000;
export const MAX_DELAY = 10000;

/** The delay before the next attempt, given the previous one (0 or less for the first attempt). */
export function nextDelay(previous) {
  return previous < MIN_DELAY ? MIN_DELAY : Math.min(previous * 2, MAX_DELAY);
}
