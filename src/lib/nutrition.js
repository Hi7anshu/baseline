// Daily intake, typed in rather than tracked.
//
// The workflow this is built for: describe the day's food to Claude on your phone, get macros
// back, paste them here. That means the parser has to cope with prose written for a human, not
// a fixed field order — so every macro is looked for in both the orders people actually write
// ("protein: 150g" and "150g protein") and the totals line is preferred over per-meal numbers.

/** One day's intake. Any field may be null — a partial day is still worth recording. */
export const emptyDay = () => ({ kcal: null, protein: null, carbs: null, fat: null })

const num = v => {
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : null
}

/**
 * Pull macros out of free text.
 *
 * Returns nulls rather than zeros for anything absent, so "I only know the protein" stays
 * distinguishable from "I ate no protein" — the difference matters when averaging a week.
 *
 * @param {string} text Anything from "2100 kcal 150p 200c 70f" to a paragraph of Claude's.
 * @returns {{kcal, protein, carbs, fat}} Parsed macros, nulls where nothing was found.
 */
export function parseMacros(text) {
  let s = String(text || '').toLowerCase()
  // "2,150 kcal" is one number, not two. Strip separators before anything else reads it.
  s = s.replace(/(\d),(?=\d{3}\b)/g, '$1')

  // A summary line is more reliable than the meal-by-meal numbers above it, so when the text
  // has one, parse only that.
  const totals = s.match(/(?:total|totals|daily total|for the day)\s*[:\-—]?\s*([\s\S]{0,200})/)
  const scope = totals ? totals[1] : s

  const find = (...patterns) => {
    for (const re of patterns) {
      const m = scope.match(re) || s.match(re)
      if (m) return num(m[1])
    }
    return null
  }

  const N = '(\\d+(?:\\.\\d+)?)'
  const re = (...parts) => new RegExp(parts.join(''), 'i')

  return {
    kcal: find(
      re('\\b(?:calories|kcal|cals?|energy)\\s*[:=~]?\\s*', N),
      re(N, '\\s*(?:kcal|calories|cals)\\b'),
    ),
    protein: find(
      re('\\bprotein\\s*[:=~]?\\s*', N),
      re(N, '\\s*g?\\s*(?:of\\s+)?protein\\b'),
      re('\\b', N, '\\s*p\\b'),
    ),
    carbs: find(
      re('\\b(?:carbs|carbohydrates?)\\s*[:=~]?\\s*', N),
      re(N, '\\s*g?\\s*(?:of\\s+)?(?:carbs|carbohydrates?)\\b'),
      re('\\b', N, '\\s*c\\b'),
    ),
    fat: find(
      re('\\b(?:fat|fats)\\s*[:=~]?\\s*', N),
      re(N, '\\s*g?\\s*(?:of\\s+)?fats?\\b'),
      re('\\b', N, '\\s*f\\b'),
    ),
  }
}

/** Calories implied by the macros, for sanity-checking a pasted total. */
export const kcalFromMacros = ({ protein, carbs, fat }) =>
  protein == null && carbs == null && fat == null
    ? null
    : (protein || 0) * 4 + (carbs || 0) * 4 + (fat || 0) * 9

/**
 * Mifflin-St Jeor resting burn, scaled for activity.
 *
 * Shown as a reference line, never as a target the app sets for you: the activity multiplier is
 * a self-reported guess and the equation has real spread between individuals. It is here so a
 * week of intake has something to be "under" or "over", not to prescribe.
 */
export function estimateTdee(profile, weightKg) {
  const h = Number(profile?.heightCm)
  const w = Number(weightKg)
  const age = ageFrom(profile?.dob)
  if (!(h > 0) || !(w > 0) || !(age > 0)) return null
  const base = 10 * w + 6.25 * h - 5 * age + (profile?.sex === 'female' ? -161 : 5)
  const factor = Number(profile?.activity) || 1.55   // moderate: trains most days
  return base * factor
}

export function ageFrom(dob) {
  if (!dob) return null
  const born = new Date(dob + 'T12:00:00')
  if (Number.isNaN(born.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - born.getFullYear()
  const m = now.getMonth() - born.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < born.getDate())) age--
  return age > 0 && age < 120 ? age : null
}

export const ACTIVITY = [
  { value: 1.2, label: 'Sedentary' },
  { value: 1.375, label: 'Light — 1–3 days' },
  { value: 1.55, label: 'Moderate — 3–5 days' },
  { value: 1.725, label: 'Hard — 6–7 days' },
]

/**
 * Averages over a window, counting only the days actually logged.
 *
 * Dividing by the window instead of by days-logged would drag every average toward zero and
 * make a well-fed week with two missing entries look like a deficit. The logged count is
 * returned alongside so the UI can say how much the average is standing on.
 */
export function summarise(days, windowDays) {
  const cutoff = Date.now() - windowDays * 86400000
  const inWindow = (days || []).filter(d => new Date(d.d + 'T12:00:00').getTime() > cutoff)

  const mean = key => {
    const vals = inWindow.map(d => d[key]).filter(v => v != null)
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
  }

  return {
    logged: inWindow.length,
    window: windowDays,
    kcal: mean('kcal'),
    protein: mean('protein'),
    carbs: mean('carbs'),
    fat: mean('fat'),
    days: inWindow.sort((a, b) => (a.d < b.d ? -1 : 1)),
  }
}

// Widely used range for lifters holding or building muscle. Used only to label a number, not
// to score you against it.
export const PROTEIN_LOW = 1.6
export const PROTEIN_HIGH = 2.2

export function proteinVerdict(gramsPerKg) {
  if (gramsPerKg == null) return null
  if (gramsPerKg < PROTEIN_LOW) return { state: 'low', text: `below ${PROTEIN_LOW} g/kg` }
  if (gramsPerKg > PROTEIN_HIGH) return { state: 'high', text: `above ${PROTEIN_HIGH} g/kg` }
  return { state: 'ok', text: `in the ${PROTEIN_LOW}–${PROTEIN_HIGH} g/kg range` }
}

/**
 * What the profile implies you should be eating.
 *
 * This is the missing feedback loop for the profile: entering height, age and activity should
 * visibly produce something, not just sit in a form. Protein is given as the range rather than
 * a single figure because the evidence supports a range; fat gets a floor rather than a target
 * because going far under it is the failure mode; carbs are simply what is left, which is the
 * honest description of how they are usually set.
 *
 * @param {object} profile Height, sex, dob, activity.
 * @param {number} weightKg Latest body weight.
 * @returns {object|null} Targets, or null when the profile cannot support them.
 */
export function targets(profile, weightKg) {
  const tdee = estimateTdee(profile, weightKg)
  const w = Number(weightKg)
  if (!tdee || !(w > 0)) return null

  const proteinLow = Math.round(w * PROTEIN_LOW)
  const proteinHigh = Math.round(w * PROTEIN_HIGH)
  const fatFloor = Math.round(w * 0.8)

  // Carbs take whatever calories the protein midpoint and the fat floor leave behind.
  const proteinMid = (proteinLow + proteinHigh) / 2
  const carbs = Math.max(0, Math.round((tdee - proteinMid * 4 - fatFloor * 9) / 4))

  return {
    tdee: Math.round(tdee),
    cut: Math.round(tdee * 0.8),        // ~20% deficit
    gain: Math.round(tdee * 1.1),       // ~10% surplus
    proteinLow,
    proteinHigh,
    fatFloor,
    carbs,
  }
}

/** The prompt to hand Claude so its reply parses cleanly on the first try. */
export const CLAUDE_PROMPT = `I'm logging my food intake for the day.

I'll describe what I ate, with rough quantities. Estimate the macros as accurately as you can, and ask me only if something is genuinely ambiguous enough to change the total significantly.

Reply with ONE line, in exactly this format and nothing else:

Total: <calories> kcal | Protein <grams>g | Carbs <grams>g | Fat <grams>g

No breakdown, no notes, no preamble — just that line, so I can paste it straight into my tracker.

Here's what I ate today:`
