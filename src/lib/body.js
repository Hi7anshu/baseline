// Body composition from a tape measure.
//
// Every number here is an estimate from circumferences, and they are not equally trustworthy.
// Waist-to-height needs no formula and no assumptions, so it leads. The Navy body-fat equation
// is good to roughly ±3-4 points on the absolute value but tracks change well, which makes the
// direction useful and the number on its own worth hedging. Anything derived from body fat
// inherits that error, so lean mass and FFMI carry it too.

/** Waist-to-height ratio. Under 0.5 is the usual "keep it here" guideline. */
export const waistToHeight = (waistCm, heightCm) =>
  waistCm > 0 && heightCm > 0 ? waistCm / heightCm : null

export const bmi = (weightKg, heightCm) =>
  weightKg > 0 && heightCm > 0 ? weightKg / (heightCm / 100) ** 2 : null

/**
 * US Navy body-fat estimate, as a percentage.
 *
 * Men need waist and neck; women additionally need hips, because the equation is fitted
 * separately per sex and there is no sex-neutral form of it. Returns null rather than guessing
 * when a required measurement is missing.
 *
 * @param {{sex: string, waist: number, neck: number, hips: number, heightCm: number}} m Centimetres.
 * @returns {number|null} Body fat percentage, or null when the inputs cannot support one.
 */
export function navyBodyFat({ sex, waist, neck, hips, heightCm }) {
  const h = Number(heightCm)
  const w = Number(waist)
  const n = Number(neck)
  if (!(h > 0) || !(w > 0) || !(n > 0)) return null

  if (sex === 'female') {
    const hip = Number(hips)
    if (!(hip > 0)) return null
    if (w + hip - n <= 0) return null
    const pct = 495 / (1.29579 - 0.35004 * Math.log10(w + hip - n) + 0.221 * Math.log10(h)) - 450
    return clamp(pct)
  }

  if (w - n <= 0) return null
  const pct = 495 / (1.0324 - 0.19077 * Math.log10(w - n) + 0.15456 * Math.log10(h)) - 450
  return clamp(pct)
}

// The equation is a curve fit, so extreme or mistyped inputs can put it outside anything
// physically meaningful. Refusing those is more honest than printing 2% or 80%.
const clamp = pct => (Number.isFinite(pct) && pct > 2 && pct < 70 ? pct : null)

/** Fat-free mass in kg, and the fat-free mass index that normalises it for height. */
export function leanMass(weightKg, bodyFatPct, heightCm) {
  if (!(weightKg > 0) || bodyFatPct == null) return { fatFreeKg: null, fatKg: null, ffmi: null }
  const fatFreeKg = weightKg * (1 - bodyFatPct / 100)
  const ffmi = heightCm > 0 ? fatFreeKg / (heightCm / 100) ** 2 : null
  return { fatFreeKg, fatKg: weightKg - fatFreeKg, ffmi }
}

/**
 * The fields a measurement entry can carry, in the order the form shows them.
 *
 * Each carries the landmark it is taken from, because a tape measure is only as good as the
 * repeatability of where you put it: a centimetre of real change is smaller than the error from
 * measuring your arm two inches further up than last time. The wording names a bony landmark
 * wherever one exists, since those do not move as you gain or lose.
 */
export const FIELDS = [
  {
    key: 'weight', label: 'Weight', unit: 'kg', step: 0.1,
    how: 'Same scale, same spot on the floor, first thing after the toilet and before eating or drinking.',
  },
  {
    key: 'neck', label: 'Neck', unit: 'cm', step: 0.5, hint: 'needed for body fat',
    how: 'Just below the larynx, tape sloping very slightly downward at the front. Shoulders down, do not flare the neck out.',
  },
  {
    key: 'waist', label: 'Waist', unit: 'cm', step: 0.5, hint: 'needed for body fat',
    how: 'Horizontal, level with the navel — that is the site the Navy body-fat equation is fitted to, not the narrowest point. Relaxed, at the end of a normal breath out.',
  },
  {
    key: 'hips', label: 'Hips', unit: 'cm', step: 0.5,
    how: 'Widest point of the buttocks, feet together, tape level all the way round.',
  },
  {
    key: 'chest', label: 'Chest', unit: 'cm', step: 0.5,
    how: 'Across the nipple line, arms hanging, at the end of a normal breath out. Not a full inhale — that measures your lungs.',
  },
  {
    key: 'arm', label: 'Arm', unit: 'cm', step: 0.5,
    how: 'Midway between the point of the shoulder and the elbow. Pick relaxed-hanging or flexed and never change: the gap between them is bigger than a year of growth.',
  },
  {
    key: 'thigh', label: 'Thigh', unit: 'cm', step: 0.5,
    how: 'Midway between the hip crease and the top of the kneecap, standing, weight even on both legs. Same leg every time.',
  },
  {
    key: 'calf', label: 'Calf', unit: 'cm', step: 0.5,
    how: 'Widest point, standing with weight on both feet. Same leg every time.',
  },
]

/**
 * The rules that decide whether a tape measure tells you anything.
 *
 * Accuracy barely matters here and repeatability is everything: an arm measured consistently 3 mm
 * too high still shows growth correctly, while one measured in a different place each month shows
 * noise you will read as progress or panic. Everything below exists to hold the conditions still.
 */
export const MEASURING_RULES = [
  {
    head: 'Morning, before anything',
    body: 'After the toilet, before food, drink or training. A meal, a litre of water or a hard session can move a waist reading by a centimetre without a gram of tissue changing.',
  },
  {
    head: 'Relaxed, at the end of a normal exhale',
    body: 'Do not brace, suck in, or hold a breath. Whatever you do the first time is what you have to do every time.',
  },
  {
    head: 'Snug, not tight',
    body: 'The tape should sit flat against skin without denting it. Use a flexible non-stretch tape; a stretched cloth tape reads smaller every month as it ages.',
  },
  {
    head: 'Measure twice, keep the median of three',
    body: 'If two readings differ by more than half a centimetre, take a third and use the middle one. Two readings that agree are worth more than one you were careful about.',
  },
  {
    head: 'Every two to four weeks, not daily',
    body: 'Day-to-day swing from hydration, sodium, glycogen and gut content is larger than real change. Weekly at most for the tape; the scale can be daily because the trend absorbs the noise.',
  },
  {
    head: 'Same side, same landmarks, same person',
    body: 'Always the right limb (or always the left). If someone else measures you, the number changes; note it if that happens.',
  },
]

/**
 * Everything derivable from one measurement, given the profile.
 *
 * Weight can come from the entry itself or from the weight series, so a tape-measure session
 * that skipped the scale still produces numbers from the nearest weigh-in.
 */
export function derive(entry, profile, weightKg) {
  const heightCm = Number(profile?.heightCm) || 0
  const weight = Number(entry?.weight) || Number(weightKg) || 0
  const fat = navyBodyFat({
    sex: profile?.sex,
    waist: entry?.waist,
    neck: entry?.neck,
    hips: entry?.hips,
    heightCm,
  })
  return {
    weight: weight || null,
    bmi: bmi(weight, heightCm),
    whtr: waistToHeight(Number(entry?.waist) || 0, heightCm),
    bodyFat: fat,
    ...leanMass(weight, fat, heightCm),
  }
}

/** The weight recorded closest to a date, for entries that skipped the scale. */
export function weightNear(bodyweight, iso) {
  if (!bodyweight?.length) return null
  const target = new Date(iso + 'T12:00:00').getTime()
  let best = null
  let bestGap = Infinity
  for (const b of bodyweight) {
    const gap = Math.abs(new Date(b.d + 'T12:00:00').getTime() - target)
    if (gap < bestGap) { bestGap = gap; best = b }
  }
  // A weigh-in a month either side says nothing about today's composition.
  return bestGap <= 14 * 86400000 ? best.w : null
}
