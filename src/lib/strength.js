// Am I getting stronger?
//
// Everything here sits on openGym's `onerm.js`, which estimates a one-rep max from a set's
// weight and reps and refuses to guess above 12 reps — above that the formulas disagree by
// double digits and the number says more about work capacity than strength. That refusal is
// load-bearing: it means high-rep isolation work simply has no curve here, which is honest
// rather than broken, and the UI says so.
import { e1rmSeries, best1RM, REP_CAP } from '../vendor/lib/onerm.js'
import { exOr } from '../vendor/lib/exercises.js'
import { isWarmupRow } from '../vendor/lib/workout-model.js'

// A PR set on a day you also happened to do one heavy single is still a PR; a 1% wobble
// between sessions is not a trend. This is the line between the two.
const MEANINGFUL_PCT = 0.02

// After this long without beating your best, "stalled" is a fair description rather than noise.
const STALE_MS = 42 * 24 * 60 * 60 * 1000

/**
 * The heaviest load actually moved, with the reps it was moved for.
 *
 * Shown next to the estimate because the estimate is the number people misread. A best set of
 * 30 kg × 10 produces a 40 kg e1RM under Epley, and 40 kg is then a weight you have never
 * touched — correct as an estimate, alarming as a readout. Printing the real set beside it
 * makes the difference visible instead of leaving it to the footnote.
 *
 * Unlike the estimate this has no rep cap: a 20-rep set is not an estimate of anything, but it
 * is still unambiguously a weight that was lifted.
 */
export function heaviestSet(S, exId, cutoff = 0) {
  let best = null
  for (const w of S.workouts || []) {
    if (w.start && w.start <= cutoff) continue
    const entry = (w.entries || []).find(e => e.id === exId)
    if (!entry) continue
    for (const set of entry.sets || []) {
      if (!set.done || isWarmupRow(set)) continue
      const kg = Number(set.w)
      const reps = Number(set.r)
      if (!(kg > 0) || !(reps >= 1)) continue
      if (!best || kg > best.w || (kg === best.w && reps > best.r)) {
        best = { w: kg, r: Math.round(reps), d: w.d }
      }
    }
  }
  return best
}

/**
 * Per-exercise strength progress over a window.
 *
 * Sorted by most recently trained, so the programme you are actually running sits at the top
 * rather than a lift you dropped months ago that happens to have the steepest line.
 *
 * @param {object} S Application state.
 * @param {number} days Window in days; 0 means all history.
 * @returns {Array<object>} One row per exercise that produced at least one estimate.
 */
export function strengthProgress(S, days = 90) {
  const cutoff = days ? Date.now() - days * 86400000 : 0
  const ids = new Set()
  for (const w of S.workouts || []) for (const e of w.entries || []) ids.add(e.id)

  const rows = []
  for (const id of ids) {
    const all = e1rmSeries(S, id)
    if (!all.length) continue

    const points = all.filter(p => p.t > cutoff)
    if (!points.length) continue

    const latest = points[points.length - 1]
    const first = points[0]
    const best = best1RM(S, id)
    const change = points.length > 1 ? latest.y - first.y : null
    const pct = change != null && first.y > 0 ? change / first.y : null

    // A record only counts as recent if the best session falls inside the window being viewed.
    const isPr = best && best.t > cutoff && Math.abs(best.y ?? best.est) >= 0
    const atBest = best && latest.y >= best.est - 0.05
    const stalled = best && !atBest
      && Date.now() - best.t > STALE_MS
      && (best.est - latest.y) / best.est > MEANINGFUL_PCT

    rows.push({
      id,
      name: exOr(id).n,
      heaviest: heaviestSet(S, id, cutoff),
      points,
      sessions: points.length,
      latest,
      best,
      change,
      pct,
      atBest,
      stalled,
      recentPr: !!(isPr && atBest && points.length > 1),
      lastAt: latest.t,
    })
  }

  return rows.sort((a, b) => b.lastAt - a.lastAt)
}

/** Exercises whose all-time best estimate landed inside the window. */
export const recentRecords = rows => rows.filter(r => r.recentPr)

/**
 * Movers worth naming: the biggest real gains and the clearest stalls.
 *
 * Filtered by `MEANINGFUL_PCT` so session-to-session noise never becomes a headline, and
 * restricted to exercises with at least three sessions, because two points is a line through
 * anything.
 */
export function movers(rows) {
  const eligible = rows.filter(r => r.sessions >= 3 && r.pct != null)
  const gained = eligible.filter(r => r.pct > MEANINGFUL_PCT).sort((a, b) => b.pct - a.pct)
  const lost = eligible.filter(r => r.pct < -MEANINGFUL_PCT).sort((a, b) => a.pct - b.pct)
  return { gained, lost }
}

export { REP_CAP }
