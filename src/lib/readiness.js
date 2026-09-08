// One number for "how ready am I today", and a full accounting of where it came from.
//
// Whoop computes recovery from heart-rate variability, resting heart rate and measured sleep
// stages. Baseline has none of those: no strap, no sensor, nothing measured while you were
// unconscious. Printing a percentage that looks like Whoop's while being made of self-report and
// a decay curve would be a lie of presentation, and the number is the part people remember.
//
// So this is built the other way round. The score is an explicitly weighted average of four
// things you either logged or that follow from your training, every component is shown with its
// own value and weight, missing components drop out and the remaining weights are renormalised,
// and the UI never shows the ring without the breakdown underneath. If it disagrees with how you
// feel, the breakdown says which input to argue with.
import { nightScore } from './sleep.js'
import { mindScore } from './journal.js'
import { groupValues, MAX } from './groups.js'
import { targets, PROTEIN_LOW } from './nutrition.js'
import { dayState } from './fuel.js'

// Weights. Sleep leads because it is the input with the largest and best-evidenced effect on
// next-day function, and because it is the one he is here to fix. Muscle load is second: it is
// the only component that is modelled rather than reported. Fuel and mind are smaller — not less
// important, but coarser as measurements, and a smaller weight is the honest expression of that.
const WEIGHTS = { sleep: 0.4, muscles: 0.3, fuel: 0.15, mind: 0.15 }

const isoOf = ms => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const recent = (rows, days = 1) => {
  if (!rows?.length) return null
  const cutoff = isoOf(Date.now() - days * 86400000)
  const sorted = [...rows].sort((a, b) => (a.d < b.d ? 1 : -1))
  return sorted[0] && sorted[0].d >= cutoff ? sorted[0] : null
}

/**
 * @param {object} S Application state.
 * @param {Record<string, number>} fatigue Per-muscle fatigue, as the app already computes it.
 * @returns {{score: number|null, parts: Array, missing: Array, weightUsed: number}}
 */
export function readiness(S, fatigue) {
  const parts = []
  const missing = []

  /* ---------------------------------------------------------------- sleep -- */
  const night = recent(S.sleep, 1)
  const sleep = night ? nightScore(night) : null
  if (sleep != null) {
    parts.push({
      id: 'sleep',
      label: 'Sleep',
      value: sleep,
      weight: WEIGHTS.sleep,
      detail: night.d === isoOf(Date.now()) ? 'last night' : `night of ${night.d}`,
      tab: 'sleep',
    })
  } else {
    missing.push({ id: 'sleep', label: 'Sleep', how: 'log last night under Sleep', tab: 'sleep' })
  }

  /* -------------------------------------------------------------- muscles -- */
  // Mean across groups, not the worst one: readiness is a whole-body question, and one cooked
  // muscle does not make you unfit to train — it makes you unfit to train that muscle, which is
  // what the map on the same screen is for.
  const groups = groupValues(fatigue || {}, MAX)
  const loaded = groups.filter(g => g.value > 0)
  if (loaded.length) {
    const mean = loaded.reduce((a, g) => a + g.value, 0) / loaded.length
    parts.push({
      id: 'muscles',
      label: 'Muscles',
      value: Math.round((1 - mean) * 100),
      weight: WEIGHTS.muscles,
      detail: `${loaded.length} groups loaded`,
      tab: 'recovery',
    })
  } else {
    missing.push({ id: 'muscles', label: 'Muscles', how: 'import training under Data', tab: 'data' })
  }

  /* ----------------------------------------------------------------- fuel -- */
  const weightKg = S.bodyweight?.length ? S.bodyweight[S.bodyweight.length - 1].w : null
  const goals = targets(S.profile, weightKg)
  const lastThree = (S.nutrition || [])
    .filter(n => n.d >= isoOf(Date.now() - 2 * 86400000))
    .sort((a, b) => (a.d < b.d ? 1 : -1))

  if (lastThree.length) {
    // Each day scores on two halves: protein against the floor, energy against estimated burn.
    // Averaged over up to three days, because one meal does not decide whether repair had what
    // it needed and a single day would make this component jump around for no reason.
    const scores = lastThree.map(day => {
      const floor = weightKg ? weightKg * PROTEIN_LOW : null
      const protein = floor && day.protein != null ? clamp01(day.protein / floor) : null
      const energy = goals && day.kcal != null ? clamp01(day.kcal / (goals.tdee * 0.9)) : null
      const vals = [protein, energy].filter(v => v != null)
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
    }).filter(v => v != null)

    if (scores.length) {
      const worst = lastThree.find(d => dayState(d, weightKg, goals).state === 'thin')
      parts.push({
        id: 'fuel',
        label: 'Fuel',
        value: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100),
        weight: WEIGHTS.fuel,
        detail: `${scores.length} day${scores.length === 1 ? '' : 's'} logged${worst ? ', one under the floor' : ''}`,
        tab: 'fuel',
      })
    } else {
      missing.push({ id: 'fuel', label: 'Fuel', how: 'add height, age and a body weight so intake has something to be measured against', tab: 'body' })
    }
  } else {
    missing.push({ id: 'fuel', label: 'Fuel', how: 'log what you ate under Fuel', tab: 'fuel' })
  }

  /* ----------------------------------------------------------------- mind -- */
  const checkin = recent(S.checkins, 1)
  const mind = checkin ? mindScore(checkin) : null
  if (mind != null) {
    parts.push({
      id: 'mind',
      label: 'Mind',
      value: mind,
      weight: WEIGHTS.mind,
      detail: checkin.d === isoOf(Date.now()) ? 'today' : checkin.d,
      tab: 'sleep',
    })
  } else {
    missing.push({ id: 'mind', label: 'Mind', how: 'check in under Sleep', tab: 'sleep' })
  }

  if (!parts.length) return { score: null, parts: [], missing, weightUsed: 0 }

  // Renormalise over what is present, so a missing component lowers confidence rather than the
  // score. Silently treating "not logged" as zero would punish forgetting, which is the fastest
  // way to teach someone to stop logging.
  const weightUsed = parts.reduce((a, p) => a + p.weight, 0)
  const score = Math.round(parts.reduce((a, p) => a + p.value * p.weight, 0) / weightUsed)

  return {
    score,
    parts: parts.map(p => ({ ...p, share: p.weight / weightUsed })),
    missing,
    weightUsed,
  }
}

const clamp01 = v => Math.max(0, Math.min(1, v))

/** The band a score sits in — the same three the rest of the app uses. */
export const bandOf = score =>
  score == null ? 'flat' : score >= 67 ? 'ready' : score >= 34 ? 'recovering' : 'fatigued'

export const BAND_LABEL = { ready: 'Ready', recovering: 'Moderate', fatigued: 'Low', flat: 'Unknown' }

/**
 * One sentence on what the score is telling you to do, built from the weakest component rather
 * than from the number — "take it easy" is useless advice compared with "you slept five hours".
 */
export function verdict(result) {
  const { score, parts, missing } = result
  if (score == null) return 'Nothing logged yet — the ring fills in as you add sleep, food and training.'

  const weakest = [...parts].sort((a, b) => a.value - b.value)[0]
  const band = bandOf(score)
  const lead = band === 'ready'
    ? 'Good to push today.'
    : band === 'recovering'
      ? 'Train, but this is not the day for a personal best.'
      : 'Everything says back off.'

  const because = weakest && weakest.value < 60
    ? ` The weak part is ${weakest.label.toLowerCase()}, at ${weakest.value}.`
    : ''
  const caveat = missing.length
    ? ` Standing on ${parts.length} of 4 inputs — ${missing.map(m => m.label.toLowerCase()).join(' and ')} not logged.`
    : ''

  return lead + because + caveat
}
