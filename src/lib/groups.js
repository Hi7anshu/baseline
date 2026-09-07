// Eighteen muscles is the right resolution for a body map and the wrong resolution for a list.
// Scrolling past "upper back", "lower back" and "traps" as separate rows makes you do the
// grouping in your head every time; the question being asked is almost always "how is my back".
//
// So lists roll up to six groups and open on tap. The map stays per-muscle — that is where the
// detail earns its place, because you can see it all at once instead of reading it.
import { MUSCLES, MUSCLE_NAME } from '../vendor/lib/muscles.js'

export const GROUPS = [
  { id: 'chest', name: 'Chest', muscles: ['chest', 'serratus'] },
  { id: 'back', name: 'Back', muscles: ['upper-back', 'lower-back', 'trapezius'] },
  { id: 'shoulders', name: 'Shoulders', muscles: ['deltoids'] },
  { id: 'arms', name: 'Arms', muscles: ['biceps', 'triceps', 'forearm'] },
  { id: 'core', name: 'Core', muscles: ['abs', 'obliques'] },
  { id: 'legs', name: 'Legs', muscles: ['gluteal', 'quadriceps', 'hamstring', 'adductors', 'hip-flexors', 'calves', 'tibialis'] },
]

// Guard against a vendored dataset update adding a muscle the groups do not mention: an
// unlisted muscle would silently vanish from every list while still shading the map.
const GROUPED = new Set(GROUPS.flatMap(g => g.muscles))
export const UNGROUPED = MUSCLES.filter(m => !GROUPED.has(m))

/**
 * Roll per-muscle values up to groups.
 *
 * How to combine them is a per-view decision, not a detail — the three views mean genuinely
 * different things by "my back":
 *   fatigue   `max`  the sorest muscle is what gates the session
 *   retention `min`  the weakest link is what has detrained
 *   volume    `sum`  sets add up across the muscles worked
 *
 * @param {Record<string, number>} values Per-muscle values keyed by slug.
 * @param {(vals: number[]) => number} combine How to reduce a group's muscles to one number.
 * @returns {Array<{id, name, value, muscles: Array<{slug, name, value}>}>} Groups, richest first.
 */
export function groupValues(values, combine) {
  return GROUPS.map(g => {
    const muscles = g.muscles.map(slug => ({
      slug,
      name: MUSCLE_NAME[slug],
      value: Number(values?.[slug]) || 0,
    }))
    return {
      id: g.id,
      name: g.name,
      value: combine(muscles.map(m => m.value)),
      muscles: muscles.sort((a, b) => b.value - a.value),
    }
  })
}

export const MAX = vals => (vals.length ? Math.max(...vals) : 0)
export const MIN = vals => (vals.length ? Math.min(...vals) : 0)
export const SUM = vals => vals.reduce((a, b) => a + b, 0)
