// How the day felt, in four numbers.
//
// Everything else in Baseline is either imported or measured with a tape. This is the only thing
// that records the experience, which is also the thing the question "is any of this working" is
// really about — nobody trains to move a fatigue percentage.
//
// Four scales, no more. A check-in that takes thirty seconds gets filled in on the bad days too,
// and the bad days are the ones carrying the information.

export const SCALES = [
  { key: 'mood', label: 'Mood', low: 'Low', high: 'Great', better: 'high' },
  { key: 'energy', label: 'Energy', low: 'Drained', high: 'Fresh', better: 'high' },
  { key: 'stress', label: 'Stress', low: 'Calm', high: 'Wired', better: 'low' },
  { key: 'soreness', label: 'Soreness', low: 'None', high: 'Sore', better: 'low' },
]

export const emptyCheckin = () => ({ d: null, mood: null, energy: null, stress: null, soreness: null, note: '' })

/** A 0–100 "how you are" score: mood and energy up, stress down. Soreness is left out — it is a
 *  training signal rather than a state of mind, and it belongs next to fatigue, not here. */
export function mindScore(c) {
  if (!c) return null
  const parts = []
  if (c.mood != null) parts.push((c.mood - 1) / 4)
  if (c.energy != null) parts.push((c.energy - 1) / 4)
  if (c.stress != null) parts.push(1 - (c.stress - 1) / 4)
  if (!parts.length) return null
  return Math.round((parts.reduce((a, b) => a + b, 0) / parts.length) * 100)
}

export function summarise(checkins, days = 14) {
  const cutoff = Date.now() - days * 86400000
  const rows = (checkins || [])
    .filter(c => new Date(c.d + 'T12:00:00').getTime() > cutoff)
    .sort((a, b) => (a.d < b.d ? -1 : 1))

  const mean = key => {
    const vals = rows.map(r => r[key]).filter(v => v != null)
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
  }

  return {
    logged: rows.length,
    days,
    rows,
    mood: mean('mood'),
    energy: mean('energy'),
    stress: mean('stress'),
    soreness: mean('soreness'),
  }
}

// Below this there is no pattern to speak of, only anecdotes wearing a chart's clothes.
export const MIN_PAIRS = 8

/**
 * Does one logged thing move with another.
 *
 * Pearson's r over paired days, with the count it stands on. Deliberately thin: no p-values, no
 * "significant", and nothing is claimed to cause anything. Two weeks of self-report from one
 * person cannot support more than "these moved together, look at it yourself" — and the app says
 * exactly that. The pairing that matters most here is last night's sleep against today's mood,
 * which is why sleep is offset by a day where the caller asks for it.
 *
 * @returns {{r: number, n: number, strength: string}|null}
 */
export function correlate(pairs) {
  const rows = pairs.filter(p => p.x != null && p.y != null)
  if (rows.length < MIN_PAIRS) return null

  const n = rows.length
  const mx = rows.reduce((a, p) => a + p.x, 0) / n
  const my = rows.reduce((a, p) => a + p.y, 0) / n
  let num = 0
  let dx = 0
  let dy = 0
  for (const p of rows) {
    num += (p.x - mx) * (p.y - my)
    dx += (p.x - mx) ** 2
    dy += (p.y - my) ** 2
  }
  if (dx === 0 || dy === 0) return null

  const r = num / Math.sqrt(dx * dy)
  return { r, n, strength: strengthOf(r) }
}

const strengthOf = r => {
  const a = Math.abs(r)
  if (a < 0.2) return 'nothing'
  if (a < 0.4) return 'a weak'
  if (a < 0.6) return 'a moderate'
  return 'a strong'
}
