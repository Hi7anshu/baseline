// Intake next to training load — the timeline, and what can honestly be said about it.
//
// Food does affect recovery: protein supplies the substrate for repair and a long energy
// deficit slows it. What does not exist is a validated function from "yesterday's calories" to
// "this muscle is 12% less recovered", and openGym's fatigue model has no input for one. So
// nothing here is fed back into the fatigue or retention scores. It sits alongside them
// instead, on a shared timeline, and says plainly when the conditions for recovery were thin.
//
// The line this holds: describe the inputs, never restate the output. "You trained hard and ate
// 700 kcal under maintenance for a week" is a fact. "Your chest is therefore 15% less recovered"
// is an invention, and an invented number gets acted on exactly like a real one.
import { isWarmupRow } from '../vendor/lib/workout-model.js'
import { loadOfWorkouts } from '../vendor/lib/muscles.js'
import { groupValues, SUM } from './groups.js'
import { targets, PROTEIN_LOW } from './nutrition.js'

/** Working sets in a session: what was actually completed, warm-ups excluded. */
export const hardSets = w =>
  (w?.entries || []).reduce(
    (n, e) => n + (e.sets || []).filter(s => s.done && !isWarmupRow(s)).length,
    0,
  )

const at = iso => new Date(iso + 'T12:00:00').getTime()

const isoOf = ms => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * One row per calendar day in the window, whether or not anything happened on it.
 *
 * Gaps are the point. A chart drawn only from logged days would space a fortnight of silence
 * the same as a fortnight of tracking, and the honest reading of intake is mostly about how
 * often it is missing.
 *
 * @param {object} S Application state.
 * @param {number} days Window length in days, ending today.
 * @returns {Array<{d, t, kcal, protein, sets, logged, trained}>} Oldest first.
 */
export function fuelTimeline(S, days = 14) {
  const food = new Map((S.nutrition || []).map(n => [n.d, n]))

  const sets = new Map()
  for (const w of S.workouts || []) {
    sets.set(w.d, (sets.get(w.d) || 0) + hardSets(w))
  }

  const today = at(isoOf(Date.now()))
  const out = []
  for (let i = days - 1; i >= 0; i--) {
    const t = today - i * 86400000
    const d = isoOf(t)
    const n = food.get(d)
    out.push({
      d,
      t,
      kcal: n?.kcal ?? null,
      protein: n?.protein ?? null,
      sets: sets.get(d) || 0,
      logged: !!n,
      trained: (sets.get(d) || 0) > 0,
    })
  }
  return out
}

// Below this many logged days an average is one or two meals wearing a trend's clothes.
export const MIN_DAYS_FOR_A_READ = 4

/**
 * What the pairing supports saying, and nothing beyond it.
 *
 * Every reading carries the count it stands on, because "1.4 g/kg across three days" and the
 * same figure across a month are different claims and only one of them is worth acting on.
 *
 * @returns {{coverage, readings: Array<{state, text}>}} `state` is ok | low | high | flat.
 */
export function fuelRead(S, days = 14) {
  const rows = fuelTimeline(S, days)
  const loggedRows = rows.filter(r => r.logged)
  const trainingDays = rows.filter(r => r.trained).length
  const totalSets = rows.reduce((a, r) => a + r.sets, 0)

  const weightKg = S.bodyweight?.length ? S.bodyweight[S.bodyweight.length - 1].w : null
  const goals = targets(S.profile, weightKg)

  const mean = key => {
    const vals = loggedRows.map(r => r[key]).filter(v => v != null)
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
  }
  const kcal = mean('kcal')
  const protein = mean('protein')
  const perKg = protein != null && weightKg ? protein / weightKg : null

  const coverage = {
    logged: loggedRows.length,
    days,
    trainingDays,
    totalSets,
    enough: loggedRows.length >= MIN_DAYS_FOR_A_READ,
  }

  const readings = []

  if (!loggedRows.length) {
    readings.push({
      state: 'flat',
      text: `Nothing logged under Fuel in the last ${days} days, so there is nothing to set the training against.`,
    })
    return { coverage, readings, rows }
  }

  if (!coverage.enough) {
    readings.push({
      state: 'flat',
      text: `${loggedRows.length} day${loggedRows.length === 1 ? '' : 's'} logged out of ${days}. `
        + `Averages start meaning something at about ${MIN_DAYS_FOR_A_READ}; below that this is a diary, not a trend.`,
    })
  }

  if (perKg != null) {
    const low = perKg < PROTEIN_LOW
    readings.push({
      state: low ? 'low' : 'ok',
      text: low
        ? `Protein averaged ${perKg.toFixed(2)} g/kg, under the ${PROTEIN_LOW} g/kg usually taken as the floor for repair. `
          + `Roughly ${Math.round(weightKg * PROTEIN_LOW)} g/day would reach it.`
        : `Protein averaged ${perKg.toFixed(2)} g/kg, at or above the ${PROTEIN_LOW} g/kg floor — the input recovery actually needs is there.`,
    })
  } else if (weightKg == null) {
    readings.push({ state: 'flat', text: 'Log a body weight under Body and protein can be read per kilogram, which is the form that means something.' })
  }

  if (goals && kcal != null) {
    const gap = kcal - goals.tdee
    const deep = gap < -goals.tdee * 0.15
    readings.push({
      state: deep ? 'low' : Math.abs(gap) < goals.tdee * 0.08 ? 'ok' : 'flat',
      text: deep
        ? `Intake averaged ${Math.round(kcal)} kcal against an estimated ${goals.tdee} burn — about ${Math.round(-gap)} under. `
          + `A deficit that size across ${trainingDays} training day${trainingDays === 1 ? '' : 's'} is the condition under which recovery and strength usually go backwards first.`
        : `Intake averaged ${Math.round(kcal)} kcal against an estimated ${goals.tdee} burn — ${describeGap(gap, goals.tdee)}.`,
    })
  } else if (!goals) {
    readings.push({ state: 'flat', text: 'Finish height, date of birth, sex and activity under Body → Profile and intake gets a burn estimate to be measured against.' })
  }

  if (trainingDays > 0) {
    const fedTraining = rows.filter(r => r.trained && r.logged).length
    if (fedTraining < trainingDays) {
      readings.push({
        state: 'flat',
        text: `${trainingDays - fedTraining} of ${trainingDays} training day${trainingDays === 1 ? '' : 's'} ${trainingDays - fedTraining === 1 ? 'has' : 'have'} no intake logged, so the chart above has holes in it.`,
      })
    }
  }

  return { coverage, readings, rows }
}

function describeGap(diff, burn) {
  if (Math.abs(diff) / burn < 0.08) return 'roughly maintenance'
  return diff < 0 ? `about ${Math.round(-diff)} under` : `about ${Math.round(diff)} over`
}

/* ------------------------------------------------- conditions per session -- */

// How far under estimated burn counts as a day that was not fed for the work done. Small
// deficits are how a cut is supposed to look; this is the line past which the shortfall is
// large enough to be worth naming next to a hard session.
const DEEP_DEFICIT = 0.15

/**
 * One day's fuel state: fed, thin, or unknown.
 *
 * Protein leads because it is the one with a mechanism you can state plainly — repair runs on
 * amino acids, and under the floor the substrate is rationed. Energy is second: a deep deficit
 * slows the same process even when protein is adequate. Anything not logged is `unknown` and is
 * never quietly counted as fine, which is the failure mode that would make this panel lie by
 * omission on every day he forgets.
 *
 * @returns {{state: 'fed'|'thin'|'unknown', why: 'protein'|'energy'|null}}
 */
export function dayState(day, weightKg, goals) {
  if (!day || (day.protein == null && day.kcal == null)) return { state: 'unknown', why: null }

  const floor = weightKg ? weightKg * PROTEIN_LOW : null
  if (floor && day.protein != null && day.protein < floor) {
    return { state: 'thin', why: 'protein' }
  }
  if (goals && day.kcal != null && day.kcal < goals.tdee * (1 - DEEP_DEFICIT)) {
    return { state: 'thin', why: 'energy' }
  }
  // With neither a weight nor a profile there is nothing to judge against, and an entry on its
  // own is not evidence that it was enough.
  if (!floor && !goals) return { state: 'unknown', why: null }
  return { state: 'fed', why: null }
}

/**
 * The bridge from a plate to a muscle: which groups did their work on days that were fed.
 *
 * This is the closest honest answer to "what is my protein intake doing to my shoulders". It
 * adjusts no fatigue figure. What it does is attach each group's recent sets to the state of
 * the days those sets were performed on, so "legs took 34 of their 41 sets on days under the
 * protein floor" is a checkable fact about training and eating, rather than a recovery
 * percentage that could never be checked at all.
 *
 * @param {object} S Application state.
 * @param {number} days Window.
 * @returns {{groups: Array, summary: object}}
 */
export function conditionsByGroup(S, days = 14) {
  const weightKg = S.bodyweight?.length ? S.bodyweight[S.bodyweight.length - 1].w : null
  const goals = targets(S.profile, weightKg)
  const food = new Map((S.nutrition || []).map(n => [n.d, n]))
  const cutoff = Date.now() - days * 86400000

  const totals = {}
  const dayStates = { fed: 0, thin: 0, unknown: 0 }
  const seenDays = new Set()
  const thinReasons = new Set()

  for (const w of S.workouts || []) {
    if ((w.start || new Date(w.d + 'T12:00:00').getTime()) <= cutoff) continue

    const { state, why } = dayState(food.get(w.d), weightKg, goals)
    if (!seenDays.has(w.d)) {
      seenDays.add(w.d)
      dayStates[state]++
      if (why) thinReasons.add(why)
    }

    for (const g of groupValues(loadOfWorkouts([w]), SUM)) {
      if (!(g.value > 0)) continue
      const row = totals[g.id] || (totals[g.id] = { id: g.id, name: g.name, fed: 0, thin: 0, unknown: 0 })
      row[state] += g.value
    }
  }

  const groups = Object.values(totals)
    .map(g => {
      const total = g.fed + g.thin + g.unknown
      return { ...g, total, verdict: verdictOf(g, total) }
    })
    .filter(g => g.total > 0.5)
    .sort((a, b) => b.total - a.total)

  return {
    groups,
    summary: {
      trainingDays: seenDays.size,
      ...dayStates,
      reasons: [...thinReasons],
      worst: groups.filter(g => g.verdict === 'thin'),
    },
  }
}

// A group is only called thin when most of its work happened on thin days. One under-fed day in
// a fortnight says nothing about a muscle, and flagging it would teach him to ignore the panel.
function verdictOf(g, total) {
  if (!(total > 0)) return 'unknown'
  if (g.thin / total >= 0.5) return 'thin'
  if (g.unknown / total > 0.5) return 'unknown'
  return 'fed'
}

/**
 * What being fed or not actually does — expressed as how to read the other two lenses.
 *
 * The honest consequence of thin fuel is not a smaller recovery percentage. It is that the
 * model's clock is optimistic, because a 36-hour half-life assumes repair is not being
 * rationed. That is a statement about confidence in a number, which this app can support; a
 * scaled fatigue figure is not.
 */
export function consequence(summary) {
  const { trainingDays, fed, thin, unknown, reasons } = summary
  if (!trainingDays) return null
  const d = trainingDays === 1 ? 'day' : 'days'

  if (thin === 0 && unknown === 0) {
    return {
      state: 'ok',
      head: 'Repair had what it needs',
      body: `All ${trainingDays} training ${d} cleared the protein floor and the burn estimate. `
        + 'Muscle protein synthesis runs on amino acids and is capped by how much you eat rather than by how hard '
        + 'you trained, so on these days the fatigue clock is as good as it gets: the recovery it predicts is the '
        + 'recovery to expect.',
    }
  }

  if (thin === 0) {
    return {
      state: 'flat',
      head: 'Partly unaccounted for',
      body: `${fed} of ${trainingDays} training ${d} cleared both floors; ${unknown} had no intake logged at all. `
        + 'Nothing here says those went badly — only that they cannot be read either way. Log them and this can say '
        + 'whether the sessions were fed.',
    }
  }

  const why = reasons.includes('protein') && reasons.includes('energy')
    ? 'protein under the floor on some and a deep energy deficit on others'
    : reasons.includes('protein')
      ? 'protein under the floor'
      : 'a deep energy deficit'

  return {
    state: 'low',
    head: 'Read the recovery times as optimistic',
    body: `${thin} of ${trainingDays} training ${d} had ${why}. Repair is substrate-limited: under roughly `
      + `${PROTEIN_LOW} g/kg of protein, muscle protein synthesis has less to work with than it can use, and a large `
      + 'energy deficit pushes the same process further down the queue. The fatigue model does not know this — its '
      + '36-hour half-life assumes repair is proceeding at full rate. For the groups below, treat "fully ready" as '
      + 'the earliest it could be true rather than the day it will be.'
      + (unknown > 0
        ? ` A further ${unknown} training ${unknown === 1 ? 'day has' : 'days have'} no intake logged and could be either.`
        : ''),
  }
}
