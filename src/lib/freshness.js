// How old the training data is, and why that matters more than it sounds.
//
// Fatigue decays with wall-clock time. If the import stops, every muscle drifts toward "ready"
// and the app quietly becomes an argument for training everything — the most misleading state
// it can be in, and the one that looks most like good news. A gap in the data is indistinguishable
// from a week off, so this does not try to tell them apart: it says how old the newest workout
// is and lets the reading be made with that in hand.

// Long enough to clear a normal rest day or two without nagging, short enough that a forgotten
// export gets caught inside the same training week.
export const STALE_DAYS = 5

const at = iso => new Date(iso + 'T12:00:00').getTime()

/**
 * @returns {{newest: string|null, days: number|null, stale: boolean, empty: boolean}}
 */
export function dataAge(S, now = Date.now()) {
  const workouts = S?.workouts || []
  if (!workouts.length) return { newest: null, days: null, stale: false, empty: true }

  let newest = workouts[0].d
  for (const w of workouts) if (w.d > newest) newest = w.d

  const days = Math.max(0, Math.floor((now - at(newest)) / 86400000))
  return { newest, days, stale: days >= STALE_DAYS, empty: false }
}

/** "today" / "yesterday" / "9 days ago", for a date that is being reported rather than computed. */
export const agoLabel = days =>
  days == null ? 'never' : days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`
