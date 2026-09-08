// A month of you, compressed into something you can paste into a conversation.
//
// The obvious version of this feature is an API key in the app that posts your data to Claude and
// prints the reply. It is not built that way, for two reasons that are not going away:
//
//   1. A Claude Pro or Max subscription does not include API access. The API is billed separately
//      through the Anthropic console, as pay-as-you-go credits, and a subscription cannot be used
//      to authenticate one.
//   2. Baseline is a static page on a public repo. Any key it held would ship to every visitor —
//      a key in client-side code is a published key, whatever it is stored in. There is no server
//      here to keep one on, and adding one would break the constraint the whole app is built to.
//
// So this goes the other way: it writes the summary, you paste it where you are already signed in.
// No key, no server, no data leaving the device except by your own copy and paste.
import { summarise as summariseSleep, fmtDuration, derive as deriveNight, TARGET_MIN } from './sleep.js'
import { summarise as summariseCheckins } from './journal.js'
import { summarise as summariseFuel, targets } from './nutrition.js'
import { conditionsByGroup } from './fuel.js'
import { hardSets } from './fuel.js'
import { groupValues, SUM, MAX } from './groups.js'
import { loadOfWorkouts } from '../vendor/lib/muscles.js'
import { derive as deriveBody, weightNear } from './body.js'
import { readiness } from './readiness.js'
import { dataAge } from './freshness.js'

/**
 * @param {object} S Application state.
 * @param {Record<string, number>} fatigue Current per-muscle fatigue.
 * @param {number} days Window.
 * @returns {string} Markdown.
 */
export function buildDigest(S, fatigue, days = 30) {
  const out = []
  const cutoff = Date.now() - days * 86400000
  const inWindow = (S.workouts || []).filter(w => (w.start || new Date(w.d + 'T12:00:00').getTime()) > cutoff)

  out.push(`# Baseline export — last ${days} days`)
  out.push(`Generated ${new Date().toISOString().slice(0, 10)}. All figures are self-logged or derived from a Hevy export; none are from a wearable.`)

  /* ------------------------------------------------------------ readiness */
  const r = readiness(S, fatigue)
  if (r.score != null) {
    out.push('', '## Readiness today', `**${r.score}/100** from ${r.parts.length} of 4 inputs.`)
    for (const p of r.parts) out.push(`- ${p.label}: ${p.value}/100 (weight ${Math.round(p.share * 100)}%, ${p.detail})`)
    if (r.missing.length) out.push(`- Not logged: ${r.missing.map(m => m.label).join(', ')}`)
  }

  /* ---------------------------------------------------------------- sleep */
  const sleep = summariseSleep(S.sleep, days)
  if (sleep.logged) {
    out.push('', '## Sleep', `${sleep.logged} nights logged of ${days}.`)
    out.push(`- Asleep: ${fmtDuration(sleep.asleep)} average (target ${fmtDuration(TARGET_MIN)})`)
    out.push(`- Efficiency: ${Math.round(sleep.efficiency * 100)}% (time asleep / time in bed)`)
    if (sleep.latency != null) out.push(`- Time to fall asleep: ${Math.round(sleep.latency)} min average`)
    if (sleep.waso != null) out.push(`- Awake during the night: ${Math.round(sleep.waso)} min average across ${sleep.wakings?.toFixed(1) ?? '—'} wakings`)
    if (sleep.bedSpread != null) out.push(`- Schedule spread: bedtime ±${Math.round(sleep.bedSpread)} min, wake ±${Math.round(sleep.wakeSpread)} min`)
    out.push(`- Nights meeting the disturbed-sleep thresholds: ${sleep.disturbed} of ${sleep.logged}`)

    const recent = sleep.rows.slice(-10)
    if (recent.length) {
      out.push('', '| Night | Asleep | Eff | Onset | Wakings | Quality | Tags |', '|---|---|---|---|---|---|---|')
      for (const n of recent) {
        out.push(`| ${n.d} | ${fmtDuration(n.asleep)} | ${n.efficiency == null ? '—' : Math.round(n.efficiency * 100) + '%'} `
          + `| ${n.latency ?? '—'} | ${n.wakings ?? '—'} | ${n.quality ?? '—'}/5 | ${(n.tags || []).join(' ') || '—'} |`)
      }
    }
  }

  /* ----------------------------------------------------------- how it felt */
  const mind = summariseCheckins(S.checkins, days)
  if (mind.logged) {
    out.push('', '## Mood, energy, stress', `${mind.logged} check-ins of ${days}, each 1–5.`)
    out.push(`- Mood ${fmt1(mind.mood)}, energy ${fmt1(mind.energy)}, stress ${fmt1(mind.stress)}, soreness ${fmt1(mind.soreness)}`)
    const notes = mind.rows.filter(c => c.note).slice(-6)
    if (notes.length) {
      out.push('', 'Recent notes:')
      for (const c of notes) out.push(`- ${c.d}: ${c.note}`)
    }
  }

  /* ------------------------------------------------------------- training */
  if (inWindow.length) {
    const sets = inWindow.reduce((a, w) => a + hardSets(w), 0)
    const byGroup = groupValues(loadOfWorkouts(inWindow), SUM)
      .filter(g => g.value > 0)
      .sort((a, b) => b.value - a.value)
    const age = dataAge(S)

    out.push('', '## Training', `${inWindow.length} sessions, ${sets} working sets. Newest workout ${age.newest} (${age.days} days ago).`)
    out.push(`- Effective sets by group: ${byGroup.map(g => `${g.name} ${Math.round(g.value)}`).join(', ')}`)

    const fat = groupValues(fatigue || {}, MAX).sort((a, b) => b.value - a.value)
    if (fat.length) out.push(`- Current fatigue (36h half-life model, 0–100): ${fat.map(g => `${g.name} ${Math.round(g.value * 100)}`).join(', ')}`)
  }

  /* ----------------------------------------------------------------- fuel */
  const weightKg = S.bodyweight?.length ? S.bodyweight[S.bodyweight.length - 1].w : null
  const fuel = summariseFuel(S.nutrition, days)
  if (fuel.logged) {
    const goals = targets(S.profile, weightKg)
    out.push('', '## Food', `${fuel.logged} days logged of ${days}.`)
    out.push(`- Averages: ${fuel.kcal ? Math.round(fuel.kcal) + ' kcal' : '—'}, protein ${fmt0(fuel.protein)} g`
      + `${weightKg && fuel.protein ? ` (${(fuel.protein / weightKg).toFixed(2)} g/kg)` : ''}, carbs ${fmt0(fuel.carbs)} g, fat ${fmt0(fuel.fat)} g`)
    if (goals) out.push(`- Estimated maintenance ${goals.tdee} kcal (Mifflin-St Jeor × activity), protein target ${goals.proteinLow}–${goals.proteinHigh} g`)

    const cond = conditionsByGroup(S, days)
    if (cond.summary.trainingDays) {
      out.push(`- Training days: ${cond.summary.fed} adequately fed, ${cond.summary.thin} under the protein floor or well under burn, ${cond.summary.unknown} not logged`)
    }
  }

  /* ----------------------------------------------------------------- body */
  const measurements = [...(S.measurements || [])].sort((a, b) => (a.d < b.d ? 1 : -1))
  if (measurements.length || S.bodyweight?.length) {
    out.push('', '## Body')
    if (S.bodyweight?.length) {
      const bw = S.bodyweight
      const first = bw[0]
      const last = bw[bw.length - 1]
      out.push(`- Weight ${last.w} kg on ${last.d} (${bw.length} weigh-ins since ${first.d}, net ${signed(last.w - first.w)} kg)`)
    }
    const latest = measurements[0]
    if (latest) {
      const d = deriveBody(latest, S.profile, weightNear(S.bodyweight, latest.d))
      out.push(`- ${latest.d}: waist ${latest.waist ?? '—'} cm, body fat ${d.bodyFat ? d.bodyFat.toFixed(1) + '% (Navy estimate)' : '—'}, lean mass ${d.fatFreeKg ? d.fatFreeKg.toFixed(1) + ' kg' : '—'}, FFMI ${d.ffmi ? d.ffmi.toFixed(1) : '—'}`)
    }
    if (S.profile?.heightCm) {
      out.push(`- Profile: ${S.profile.heightCm} cm, ${S.profile.sex ?? 'sex not set'}, DOB ${S.profile.dob ?? 'not set'}`)
    }
  }

  out.push('', '---', '',
    'Context for whoever reads this: fatigue and detraining come from openGym\'s model (36-hour '
    + 'fatigue half-life, strength held 14 days then a 28-day half-life), body fat is the US Navy '
    + 'circumference estimate, calories are Mifflin-St Jeor. Sleep and mood are self-reported. '
    + 'Nothing here is measured by a wearable, and the readiness score is a weighted average of '
    + 'the inputs listed above rather than a physiological measurement.')

  return out.join('\n')
}

/** The question to put in front of the data, so the reply is useful rather than a summary of it. */
export const DIGEST_PROMPT = `Here is a month of my training, sleep, food and mood data, exported from an app I use.

I'm mainly trying to understand my sleep — I have trouble getting to sleep and I wake in the night — and whether it's connected to how I train and eat.

Please:
1. Tell me what the data actually supports, and be clear where it does not support a conclusion.
2. Point out anything that looks like a pattern worth testing, and say how I'd test it.
3. Say what single change would most likely help, and what to measure to know if it did.
4. Flag anything that looks worth taking to a doctor rather than solving myself.

Don't be reassuring for the sake of it — if the data is too thin to say anything, say that.

`

const fmt1 = v => (v == null ? '—' : v.toFixed(1))
const fmt0 = v => (v == null ? '—' : Math.round(v))
const signed = v => `${v > 0 ? '+' : ''}${v.toFixed(1)}`
