// When does a muscle come back?
//
// openGym shades what is fatigued right now; the question that actually changes today's session
// is *when* it clears. Fatigue decays on a fixed half-life, so the answer is arithmetic rather
// than a guess — invert the saturation curve and solve for the crossing.
import { FATIGUE_HALF_LIFE_MS, FATIGUE_STATES } from '../vendor/lib/recovery.js'
import { fatigueStateOf } from '../vendor/lib/recovery-view.js'

// recovery.js reports fatigue as `1 - exp(-v)` over accumulated stimulus v. Recovering that v is
// what makes the decay linear in log space and the crossing solvable in closed form.
const stimulusOf = fatigue => -Math.log(1 - Math.min(0.999999, Math.max(0, fatigue)))

/** The band boundaries the app labels against, matching recovery-view.js. */
export const READY_AT = 0.25
export const RECOVERING_AT = 0.5

/**
 * Milliseconds until a fatigue value decays to `target`, or 0 if it is already there.
 *
 * Decay is `0.5 ** (t / halfLife)` on the stimulus, so the time to fall from v to v_target is
 * `halfLife * log2(v / v_target)` — exact, not a fitted estimate.
 *
 * @param {number} fatigue Current fatigue value in [0,1) from fatigueOf().
 * @param {number} target Fatigue value to decay to; defaults to the ready threshold.
 * @returns {number} Milliseconds until the crossing, 0 when already below target.
 */
export function msUntil(fatigue, target = READY_AT) {
  const v = stimulusOf(fatigue)
  const vTarget = stimulusOf(target)
  if (!(v > vTarget)) return 0
  return FATIGUE_HALF_LIFE_MS * Math.log2(v / vTarget)
}

/** Short human duration: "4h", "1d 6h", "now". */
export function fmtEta(ms) {
  if (!(ms > 0)) return 'now'
  const hours = ms / 3600000
  if (hours < 1) return `${Math.max(1, Math.round(ms / 60000))}m`
  if (hours < 24) return `${Math.round(hours)}h`
  // Round the hours first, then split. Splitting first lets a remainder round up to 24 and
  // print "5d 24h".
  const total = Math.round(hours)
  const days = Math.floor(total / 24)
  const rem = total - days * 24
  return rem ? `${days}d ${rem}h` : `${days}d`
}

/**
 * One row per muscle: current fatigue, its band, and when it clears.
 *
 * A fatigued muscle reports both crossings — dropping out of "fatigued" is the one that decides
 * whether it can take work tomorrow, while fully ready is the one that decides a heavy session.
 *
 * @param {Record<string, number>} fatigue Per-muscle values from fatigueOf().
 * @returns {Array<{slug: string, value: number, state: string, readyIn: number, easesIn: number}>}
 */
export function recoveryRows(fatigue) {
  return Object.entries(fatigue || {}).map(([slug, value]) => ({
    slug,
    value,
    state: fatigueStateOf(value),
    readyIn: msUntil(value, READY_AT),
    easesIn: msUntil(value, RECOVERING_AT),
  }))
}

export const STATE_LABEL = {
  [FATIGUE_STATES.READY]: 'Ready',
  [FATIGUE_STATES.RECOVERING]: 'Recovering',
  [FATIGUE_STATES.FATIGUED]: 'Fatigued',
}

// The body map takes an absolute scale here rather than its default relative shading: a fatigue
// map that renormalised to the worst muscle would paint a fully recovered body bright red.
export const FATIGUE_THRESHOLDS = [
  { at: 0, level: 0 },
  { at: 0.12, level: 1 },
  { at: READY_AT, level: 2 },
  { at: RECOVERING_AT, level: 3, exclusive: true },
  { at: 0.75, level: 4, exclusive: true },
]
