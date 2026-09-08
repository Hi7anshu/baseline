// Sleep, logged the way a bad sleeper actually experiences it.
//
// Most sleep trackers record one number — hours — which is the number that says least when the
// problem is insomnia. What separates a bad night from a short one is *continuity*: how long it
// took to get to sleep, how many times you surfaced, how long you were awake in the middle. Those
// three are what clinical sleep work is built on (they are the fields of a standard sleep diary),
// they are the ones a wrist tracker guesses at, and they are the ones a person genuinely knows.
//
// So the entry is a sleep diary: to bed, awake, minutes to fall asleep, number of wakings, minutes
// awake during the night, and how it felt. Everything else here is derived from those.

/** A night. `d` is the date you woke up on, which is how every sleep diary indexes them. */
export const emptyNight = () => ({
  d: null,
  bed: '',        // HH:MM, clock time you tried to sleep
  wake: '',       // HH:MM, clock time you got up
  latency: null,  // minutes to fall asleep
  wakings: null,  // times you woke in the night
  waso: null,     // minutes awake after first falling asleep
  quality: null,  // 1–5, how rested you feel
  note: '',
  tags: [],       // caffeine, late meal, screen, alcohol, stress, nap
})

/** Things worth being able to tick, because each has a plausible line to a bad night. */
export const TAGS = [
  { id: 'caffeine', label: 'Caffeine late' },
  { id: 'screen', label: 'Screens late' },
  { id: 'meal', label: 'Late meal' },
  { id: 'alcohol', label: 'Alcohol' },
  { id: 'stress', label: 'Stressed' },
  { id: 'nap', label: 'Napped' },
  { id: 'training', label: 'Trained late' },
]

export const QUALITY = ['Terrible', 'Poor', 'Okay', 'Good', 'Excellent']

const HHMM = /^(\d{1,2}):(\d{2})$/

/** Minutes past midnight, or null. */
export function minutesOf(hhmm) {
  const m = HHMM.exec(String(hhmm || '').trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (!(h >= 0 && h < 24) || !(min >= 0 && min < 60)) return null
  return h * 60 + min
}

export const fmtDuration = mins => {
  if (mins == null || !Number.isFinite(mins)) return '—'
  const h = Math.floor(Math.abs(mins) / 60)
  const m = Math.round(Math.abs(mins) % 60)
  return `${mins < 0 ? '-' : ''}${h}h ${String(m).padStart(2, '0')}m`
}

/**
 * Everything derivable from one night.
 *
 * Time in bed crosses midnight in almost every case, so bedtimes at or after 18:00 are read as
 * belonging to the previous evening — the alternative is asking someone to enter a date for the
 * hour they lay down, which nobody does twice.
 *
 * Efficiency is time asleep over time in bed, the standard sleep-diary ratio. It is the single
 * most useful number for insomnia because it separates "I did not get enough sleep" from "I was
 * in bed for nine hours and slept for five", which have opposite fixes.
 */
export function derive(night) {
  const bed = minutesOf(night?.bed)
  const wake = minutesOf(night?.wake)
  if (bed == null || wake == null) return { inBed: null, asleep: null, efficiency: null }

  let inBed = wake - bed
  if (inBed <= 0) inBed += 24 * 60

  const latency = num(night.latency)
  const waso = num(night.waso)
  const asleep = Math.max(0, inBed - (latency || 0) - (waso || 0))

  return {
    inBed,
    asleep,
    efficiency: inBed > 0 ? asleep / inBed : null,
    latency,
    waso,
    wakings: num(night.wakings),
    bedMin: bed,
    wakeMin: wake,
  }
}

const num = v => {
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : null
}

// The usual adult target. Held as a constant rather than a setting because a per-person "need"
// entered by hand is a wish, and the whole point of the number is to be something to fall short of.
export const TARGET_MIN = 7.5 * 60

// Lines drawn where sleep medicine draws them, so a flag means something outside this app:
// efficiency under 85%, onset over 30 minutes, or over 30 minutes awake in the night are the
// conventional thresholds for disturbed sleep.
export const POOR_EFFICIENCY = 0.85
export const LONG_LATENCY = 30
export const HIGH_WASO = 30

/**
 * Window summary: the averages, plus how consistent the schedule was.
 *
 * Regularity gets equal billing with duration because for insomnia it is the lever that moves —
 * a bed and wake time that wander by two hours produce exactly the symptoms being complained
 * about here, and unlike "sleep more", it is directly actionable.
 */
export function summarise(nights, days = 14) {
  const cutoff = Date.now() - days * 86400000
  const rows = (nights || [])
    .filter(n => new Date(n.d + 'T12:00:00').getTime() > cutoff)
    .map(n => ({ ...n, ...derive(n) }))
    .filter(n => n.asleep != null)
    .sort((a, b) => (a.d < b.d ? -1 : 1))

  if (!rows.length) return { logged: 0, days, rows: [] }

  const mean = key => {
    const vals = rows.map(r => r[key]).filter(v => v != null)
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
  }

  // Bedtimes straddle midnight, so they are shifted onto a continuous line before being averaged
  // — otherwise 23:40 and 00:20 average to lunchtime.
  const bedShifted = rows.map(r => (r.bedMin >= 12 * 60 ? r.bedMin : r.bedMin + 24 * 60))

  return {
    logged: rows.length,
    days,
    rows,
    asleep: mean('asleep'),
    inBed: mean('inBed'),
    efficiency: mean('efficiency'),
    latency: mean('latency'),
    waso: mean('waso'),
    wakings: mean('wakings'),
    quality: mean('quality'),
    bedSpread: spread(bedShifted),
    wakeSpread: spread(rows.map(r => r.wakeMin)),
    debt: rows.reduce((a, r) => a + (r.asleep - TARGET_MIN), 0),
    short: rows.filter(r => r.asleep < TARGET_MIN - 30).length,
    disturbed: rows.filter(r => isDisturbed(r)).length,
  }
}

export const isDisturbed = r =>
  (r.efficiency != null && r.efficiency < POOR_EFFICIENCY) ||
  (r.latency != null && r.latency > LONG_LATENCY) ||
  (r.waso != null && r.waso > HIGH_WASO)

/** Standard deviation in minutes — how much the clock time moved around. */
function spread(values) {
  const vals = values.filter(v => v != null)
  if (vals.length < 2) return null
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length
  return Math.sqrt(vals.reduce((a, v) => a + (v - mean) ** 2, 0) / vals.length)
}

/**
 * Score one night, 0–100, for the readiness composite.
 *
 * Duration and continuity, weighted three to two. A short unbroken night and a long broken one
 * are both bad, in different ways, and either alone would let the other hide.
 */
export function nightScore(night) {
  const d = derive(night)
  if (d.asleep == null) return null

  const duration = clamp01(d.asleep / TARGET_MIN)
  const efficiency = d.efficiency == null ? null : clamp01((d.efficiency - 0.6) / (0.95 - 0.6))
  const parts = [{ v: duration, w: 3 }]
  if (efficiency != null) parts.push({ v: efficiency, w: 2 })

  const total = parts.reduce((a, p) => a + p.w, 0)
  return Math.round((parts.reduce((a, p) => a + p.v * p.w, 0) / total) * 100)
}

const clamp01 = v => Math.max(0, Math.min(1, v))

/** Plain-language flags for a window, most actionable first. */
export function readings(sum) {
  if (!sum.logged) return []
  const out = []

  if (sum.efficiency != null && sum.efficiency < POOR_EFFICIENCY) {
    out.push({
      state: 'low',
      text: `Sleep efficiency ${Math.round(sum.efficiency * 100)}% — under the ${Math.round(POOR_EFFICIENCY * 100)}% `
        + 'that counts as settled. You are spending time in bed awake, which is the pattern that '
        + 'feeds itself: the bed stops being a cue for sleep. The standard first move is to shorten '
        + 'time in bed to roughly the time actually slept, not to go to bed earlier.',
    })
  }

  if (sum.latency != null && sum.latency > LONG_LATENCY) {
    out.push({
      state: 'low',
      text: `Taking ${Math.round(sum.latency)} minutes on average to fall asleep, against ${LONG_LATENCY} as the usual line.`,
    })
  }

  if (sum.waso != null && sum.waso > HIGH_WASO) {
    out.push({
      state: 'low',
      text: `${Math.round(sum.waso)} minutes awake in the night on average, across ${sum.wakings != null ? sum.wakings.toFixed(1) : '—'} wakings. `
        + `Over ${HIGH_WASO} is the conventional threshold for disturbed sleep.`,
    })
  }

  if (sum.bedSpread != null && sum.bedSpread > 60) {
    out.push({
      state: 'low',
      text: `Your bedtime moves by about ${Math.round(sum.bedSpread)} minutes night to night. `
        + 'Regularity is the one input here you control directly, and an irregular schedule produces '
        + 'exactly this pattern of long onsets and night wakings.',
    })
  } else if (sum.wakeSpread != null && sum.wakeSpread > 60) {
    out.push({
      state: 'low',
      text: `Your wake time moves by about ${Math.round(sum.wakeSpread)} minutes night to night. `
        + 'A fixed wake time — the same one after a bad night — is what anchors the rhythm.',
    })
  }

  const hours = sum.asleep != null ? sum.asleep / 60 : null
  if (hours != null) {
    out.push({
      state: hours >= 7 ? 'ok' : 'low',
      text: `Averaging ${fmtDuration(sum.asleep)} asleep across ${sum.logged} night${sum.logged === 1 ? '' : 's'}`
        + `${sum.debt < -60 ? `, ${fmtDuration(-sum.debt)} short of ${fmtDuration(TARGET_MIN)} a night over the window` : ''}.`,
    })
  }

  return out
}
