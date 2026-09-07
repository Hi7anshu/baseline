// Splitting the shoulder into its three heads.
//
// openGym draws and models one `deltoids` muscle, so the body map and the fatigue engine
// cannot tell a lateral raise from a rear-delt fly. For *volume* that distinction is the whole
// question — "am I actually training rear delts, or just pressing?" is the most common hole in
// a push/pull split — and it can be answered honestly, because the exercise name says which
// head it is even when the dataset does not.
//
// This is inference from names, not data openGym ships. It applies to set counts only; fatigue
// and retention still report one shoulder, because splitting those would mean inventing a decay
// curve per head out of numbers nobody measured.
import { musclesOf } from '../vendor/lib/muscles.js'
import { exOr } from '../vendor/lib/exercises.js'
import { isWarmupRow } from '../vendor/lib/workout-model.js'

export const HEADS = [
  { id: 'front', name: 'Front delts' },
  { id: 'side', name: 'Side delts' },
  { id: 'rear', name: 'Rear delts' },
]

// Order matters and rear must come first: "bent over lateral raise" contains "lateral raise"
// but is a rear-delt movement, and matching side first would file it under the wrong head.
const PATTERNS = [
  ['rear', /rear delt|reverse fly|reverse pec|face pull|bent over lateral|bent over raise|rear lateral|prone .*(raise|fly)|lying .*rear|reverse machine fly|rear delt row|deltoid rear/],
  ['side', /lateral raise|side lateral|side raise|upright row|lateral machine/],
  ['front', /front raise|overhead press|shoulder press|military press|arnold|push press|bench press|chest press|incline press|dip\b|landmine press|z press|pike push/],
]

/**
 * Which head an exercise trains, or null when the name does not say.
 *
 * @param {string} name Exercise name, as the catalogue spells it.
 * @returns {'front'|'side'|'rear'|null}
 */
export function headOf(name) {
  const n = String(name || '').toLowerCase()
  for (const [head, re] of PATTERNS) if (re.test(n)) return head
  return null
}

/**
 * Effective sets per delt head over a set of workouts.
 *
 * Each entry contributes its completed work sets weighted by how much of the exercise the
 * shoulder actually is — the same weighting the muscle map uses — so a bench press adds a
 * fraction of a set to front delts rather than a whole one. Movements whose head cannot be read
 * from the name are split evenly across all three rather than being dropped or guessed at, and
 * are counted separately so the UI can say how much of the total that was.
 *
 * @param {Array<object>} workouts Workouts in openGym state shape.
 * @param {(set: object) => boolean} [pick] Optional set filter, e.g. hard sets only.
 * @returns {{front, side, rear, unclassified, total}} Effective sets per head.
 */
export function deltVolume(workouts, pick) {
  const out = { front: 0, side: 0, rear: 0, unclassified: 0, total: 0 }

  for (const w of workouts || []) {
    for (const entry of w.entries || []) {
      const ex = exOr(entry.id)
      const share = musclesOf(ex).deltoids || 0
      if (!(share > 0)) continue

      const sets = (entry.sets || []).filter(s => s?.done && !isWarmupRow(s) && (!pick || pick(s))).length
      if (!sets) continue

      const amount = sets * share
      out.total += amount

      const head = headOf(ex.n)
      if (head) {
        out[head] += amount
      } else {
        out.unclassified += amount
        for (const h of HEADS) out[h.id] += amount / HEADS.length
      }
    }
  }
  return out
}
