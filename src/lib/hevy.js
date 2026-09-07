// Hevy -> openGym. Two ways in, one shape out.
//
// The CSV export and the Pro API carry the same training, so both funnel through
// `normalizeWorkouts` and land in the state shape `vendor/lib/recovery.js` reads. The API is
// callable straight from the browser — Hevy answers with `Access-Control-Allow-Origin: *` and
// allows the `api-key` header — so nothing here needs a server or a proxy.
import { resolveName } from './match.js'
import { EXIDX } from '../vendor/lib/exercises.js'

const BASE = 'https://api.hevyapp.com/v1'

/* ------------------------------------------------------------------ muscles -- */

// Hevy names muscle groups in snake_case; openGym's ALIAS table in muscles.js speaks the
// spaced form ("lower back", "upper back"). Underscores to spaces covers nearly all of it —
// these are the ones where the two vocabularies genuinely disagree.
const MUSCLE_FIX = {
  cardio: null,
  other: null,
  full_body: null,       // no single muscle to credit; the body-part fallback is closer
  abdominals: 'abs',
  spine: 'lower back',
}

const hevyMuscle = name => {
  const raw = String(name || '').toLowerCase().trim()
  if (!raw) return null
  if (Object.prototype.hasOwnProperty.call(MUSCLE_FIX, raw)) return MUSCLE_FIX[raw]
  return raw.replace(/_/g, ' ')
}

// Hevy equipment -> the dataset's `eq` vocabulary. Only 'body weight' carries behaviour:
// recovery.js uses it to add body mass to the load of an unweighted set.
const EQUIPMENT = {
  none: 'body weight', bodyweight: 'body weight', body_weight: 'body weight',
  barbell: 'barbell', dumbbell: 'dumbbell', kettlebell: 'kettlebell',
  machine: 'leverage machine', cable: 'cable', plate: 'weighted', resistance_band: 'band',
  suspension: 'body weight', other: '',
}

// A rough body part, used only when an exercise has no usable muscle groups at all.
const BODYPART = {
  abs: 'waist', obliques: 'waist', chest: 'chest', 'upper back': 'back', lats: 'back',
  'lower back': 'back', traps: 'back', shoulders: 'shoulders', biceps: 'upper arms',
  triceps: 'upper arms', forearms: 'lower arms', quadriceps: 'upper legs',
  hamstrings: 'upper legs', glutes: 'upper legs', adductors: 'upper legs',
  abductors: 'upper legs', calves: 'lower legs', neck: 'neck',
}

/**
 * Build a custom exercise from a Hevy template so an unmatched lift still shades the body map.
 *
 * The CSV path has only a name to go on and gives up on anything the catalogue misses. The API
 * hands over Hevy's own `primary_muscle_group` / `secondary_muscle_groups`, so attribution stays
 * correct for custom lifts the 1,324-entry catalogue was never going to contain.
 */
function customFromTemplate(template) {
  const primary = hevyMuscle(template?.primary_muscle_group)
  const secondary = (template?.secondary_muscle_groups || []).map(hevyMuscle).filter(Boolean)
  return {
    id: 'hevy-' + template.id,
    n: template.title || 'Unknown exercise',
    bp: BODYPART[primary] || '',
    eq: EQUIPMENT[String(template?.equipment || '').toLowerCase()] ?? '',
    tg: primary || '',
    sm: secondary,
    st: [],
  }
}

/* --------------------------------------------------------------- normalise -- */

const isoDate = ms => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const num = v => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null)

function normalizeSet(raw, cardio) {
  const reps = num(raw?.reps)
  const seconds = num(raw?.duration_seconds)
  const weight = num(raw?.weight_kg)
  const warmup = String(raw?.type || '').toLowerCase() === 'warmup'
  const rpe = num(raw?.rpe)
  const metres = num(raw?.distance_meters)

  // Cardio and timed holds carry no reps; recovery.js scores them off duration instead.
  if (cardio || (seconds !== null && reps === null)) {
    const mins = (seconds || 0) / 60
    const km = (metres || 0) / 1000
    return {
      min: Math.round(mins * 100) / 100,
      sec: seconds ?? 0,
      speed: mins > 0 && km > 0 ? Math.round((km / (mins / 60)) * 10) / 10 : 0,
      done: true,
      ...(rpe !== null ? { rpe } : {}),
      ...(warmup ? { phase: 'warmup' } : {}),
    }
  }
  return {
    w: weight ?? 0,
    r: reps ?? 0,
    u: 'kg',                       // the API is always kg; the UI converts for display
    done: true,                    // Hevy only stores sets that were actually completed
    ...(rpe !== null ? { rpe } : {}),
    ...(seconds !== null ? { sec: seconds } : {}),
    ...(warmup ? { phase: 'warmup' } : {}),
  }
}

/**
 * Turn Hevy API workouts into the openGym state shape.
 *
 * Exercises resolve catalogue-first: a name the curated matcher recognises brings the dataset's
 * richer secondary muscles with it, which is what keeps these fatigue numbers comparable to
 * openGym's own. Only when that fails does the Hevy template become a custom exercise.
 *
 * @param {Array<object>} raw Workouts as returned by GET /v1/workouts.
 * @param {Map<string, object>} templates Exercise templates by id, for the fallback path.
 * @returns {{ workouts: Array<object>, customEx: Array<object> }} openGym-shaped history.
 */
export function normalizeWorkouts(raw, templates = new Map(), overrides) {
  const customEx = new Map()
  const workouts = []

  for (const w of raw || []) {
    const start = Date.parse(w?.start_time)
    if (!Number.isFinite(start)) continue
    const end = Date.parse(w?.end_time)
    const entries = []

    for (const ex of w.exercises || []) {
      const template = templates.get(ex.exercise_template_id)
      let id = resolveName(ex.title || template?.title || '', overrides)

      if (!id) {
        // No catalogue match. Invent one from Hevy's own muscle data, or from the title alone
        // when the templates were never fetched (a set still counts, via the body-part fallback).
        const custom = customFromTemplate(template || { id: ex.exercise_template_id, title: ex.title })
        if (!customEx.has(custom.id)) customEx.set(custom.id, custom)
        id = custom.id
      }

      const cardio = EXIDX[id]?.bp === 'cardio' || customEx.get(id)?.bp === 'cardio'
      const sets = (ex.sets || []).map(s => normalizeSet(s, cardio))
      if (!sets.length) continue

      // Hevy lists an exercise twice when it is revisited later in the session; openGym expects
      // one entry per exercise, so fold the repeats together rather than double-counting them.
      const existing = entries.find(e => e.id === id)
      if (existing) existing.sets.push(...sets)
      else entries.push({ id, sets })
    }

    if (!entries.length) continue
    for (const e of entries) {
      const top = Math.max(0, ...e.sets.filter(s => s.phase !== 'warmup').map(s => s.w || 0))
      e.topW = top || null
    }

    workouts.push({
      id: 'hv-' + w.id,
      hevyId: w.id,
      updatedAt: w.updated_at || null,
      d: isoDate(start),
      start,
      end: Number.isFinite(end) && end > start ? end : start,
      routineId: null,
      name: w.title || 'Workout',
      entries,
      prs: [],
      vol: entries.reduce((a, e) => a + e.sets.reduce((b, s) => b + (s.w || 0) * (s.r || 0), 0), 0),
    })
  }

  workouts.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0))
  return { workouts, customEx: [...customEx.values()] }
}

/* --------------------------------------------------------------------- API -- */

export class HevyError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'HevyError'
    this.status = status
  }
}

async function call(path, apiKey, params = {}) {
  const url = new URL(BASE + path)
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) url.searchParams.set(k, v)

  const res = await fetch(url, { headers: { 'api-key': apiKey, accept: 'application/json' } })
  if (res.status === 401) throw new HevyError('Invalid API key. Check hevy.com/settings?developer.', 401)
  if (res.status === 403) throw new HevyError('The developer API needs an active Hevy Pro subscription.', 403)
  if (res.status === 429) throw new HevyError('Hevy rate-limited the sync. Try again in a minute.', 429)
  if (!res.ok) throw new HevyError(`Hevy returned ${res.status}.`, res.status)
  return res.json()
}

/**
 * Walk every page of a paginated endpoint.
 *
 * `page_count` comes back on the first response, so this stops on the real end rather than
 * guessing. `onProgress` exists because a first sync of a long history is many small requests
 * and a silent spinner reads as a hang.
 */
async function pageThrough(path, apiKey, key, { pageSize = 10, params = {}, onProgress } = {}) {
  const out = []
  let page = 1
  let pages = 1
  do {
    const data = await call(path, apiKey, { ...params, page, pageSize })
    const batch = data?.[key] || []
    out.push(...batch)
    pages = Number(data?.page_count) || 1
    onProgress?.(page, pages, out.length)
    page++
  } while (page <= pages)
  return out
}

/** Verify a key and return the account it belongs to. */
export const fetchUser = apiKey => call('/user/info', apiKey)

/** Every exercise template, for the custom-exercise fallback. */
export const fetchTemplates = (apiKey, onProgress) =>
  pageThrough('/exercise_templates', apiKey, 'exercise_templates', { pageSize: 100, onProgress })

/** Every workout, oldest page last. Hevy caps this endpoint at 10 per page. */
export const fetchWorkouts = (apiKey, onProgress) =>
  pageThrough('/workouts', apiKey, 'workouts', { pageSize: 10, onProgress })

/** Body measurements, used as the bodyweight signal for bodyweight-exercise load. */
export const fetchBodyweight = async (apiKey, onProgress) => {
  const rows = await pageThrough('/body_measurements', apiKey, 'body_measurements', { pageSize: 10, onProgress })
  return rows
    .map(r => ({ d: String(r?.date || '').slice(0, 10), w: num(r?.weight_kg) }))
    .filter(r => r.d && r.w)
    .sort((a, b) => (a.d < b.d ? -1 : 1))
}

/**
 * Changes since a timestamp: updated workouts and deleted ids.
 *
 * This is what makes repeat syncs cheap — after the first pull, only what actually moved comes
 * back, and a workout edited in Hevy days later still corrects itself here.
 */
export async function fetchEvents(apiKey, since, onProgress) {
  const events = await pageThrough('/workouts/events', apiKey, 'events', {
    pageSize: 10, params: { since }, onProgress,
  })
  const updated = []
  const deleted = []
  for (const e of events) {
    if (e?.type === 'deleted' && e.id) deleted.push(e.id)
    else if (e?.workout) updated.push(e.workout)
  }
  return { updated, deleted }
}

/**
 * Pull from Hevy and merge into state.
 *
 * A first run takes everything; later runs ask only for events since the last sync. Merging is
 * by Hevy id, so a re-sync corrects an edited workout instead of duplicating it.
 */
export async function sync(S, settings, { onProgress } = {}) {
  const { apiKey, lastSync } = settings
  if (!apiKey) throw new HevyError('No API key set.', 0)

  const say = msg => onProgress?.(msg)

  say('Loading exercise list…')
  const templates = new Map((await fetchTemplates(apiKey)).map(t => [t.id, t]))

  let rawWorkouts = []
  let deleted = []

  if (!lastSync || !S.workouts.length) {
    say('Fetching your full Hevy history…')
    rawWorkouts = await fetchWorkouts(apiKey, (p, pages, n) => say(`Fetching workouts — ${n} so far (page ${p} of ${pages})…`))
  } else {
    say('Checking for changes…')
    const events = await fetchEvents(apiKey, lastSync, (p, pages) => say(`Checking for changes — page ${p} of ${pages}…`))
    rawWorkouts = events.updated
    deleted = events.deleted
  }

  const { workouts, customEx } = normalizeWorkouts(rawWorkouts, templates, S.overrides)

  // Merge by Hevy id: an edited workout replaces its old copy rather than sitting beside it.
  const byId = new Map(S.workouts.map(w => [w.hevyId || w.id, w]))
  for (const id of deleted) byId.delete(id)
  for (const w of workouts) byId.set(w.hevyId, w)

  const merged = [...byId.values()].sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0))
  const customById = new Map((S.customEx || []).map(c => [c.id, c]))
  for (const c of customEx) customById.set(c.id, c)

  say('Loading body weight…')
  let bodyweight = S.bodyweight
  try {
    const bw = await fetchBodyweight(apiKey)
    if (bw.length) bodyweight = bw
  } catch {
    // Body measurements are a nicety — a failure here should not sink an otherwise good sync.
  }

  return {
    state: { ...S, workouts: merged, customEx: [...customById.values()], bodyweight, unit: S.unit || 'kg' },
    stats: { added: workouts.length, deleted: deleted.length, total: merged.length },
  }
}
