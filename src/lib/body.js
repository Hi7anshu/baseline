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

/** The fields a measurement entry can carry, in the order the form shows them. */
export const FIELDS = [
  { key: 'weight', label: 'Weight', unit: 'kg', step: 0.1 },
  { key: 'neck', label: 'Neck', unit: 'cm', step: 0.5, hint: 'needed for body fat' },
  { key: 'waist', label: 'Waist', unit: 'cm', step: 0.5, hint: 'needed for body fat' },
  { key: 'hips', label: 'Hips', unit: 'cm', step: 0.5 },
  { key: 'chest', label: 'Chest', unit: 'cm', step: 0.5 },
  { key: 'arm', label: 'Arm', unit: 'cm', step: 0.5 },
  { key: 'thigh', label: 'Thigh', unit: 'cm', step: 0.5 },
  { key: 'calf', label: 'Calf', unit: 'cm', step: 0.5 },
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
