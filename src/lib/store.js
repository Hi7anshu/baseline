// Local persistence. Everything here is a cache: Hevy is the source of truth, so anything
// in IndexedDB can be thrown away and rebuilt from an import or a sync. That is deliberate —
// it means no server has to hold this data, and losing the phone loses nothing.
import { get, set } from 'idb-keyval'

// Keys are unchanged across the rename: they address a store on this device, and renaming them
// would silently orphan everything already logged.
const KEY = 'opengym-hevy-state'
const KEY_SETTINGS = 'opengym-hevy-settings'

/** The state shape the vendored openGym libs expect. */
export const emptyState = () => ({
  workouts: [],      // [{ id, d, start, end, name, entries: [{ id, sets: [...] }] }]
  customEx: [],      // exercises Hevy logged that the catalogue could not match
  bodyweight: [],    // [{ d, w }]
  exWeights: {},     // seeded by mergeImport; unused here but keeps the contract intact
  overrides: {},     // exercise name -> your own identification, applied to every import
  measurements: [],  // [{ d, weight, neck, waist, hips, chest, arm, thigh, calf }]
  nutrition: [],     // [{ d, kcal, protein, carbs, fat }]
  profile: {},       // { heightCm, sex, dob, activity } — only ever used for local maths
  unit: 'kg',
})

export const defaultSettings = () => ({
  apiKey: '',        // Hevy Pro developer key; empty means the CSV path
  lastSync: null,    // ISO timestamp of the last successful API sync
  syncCursor: null,  // page cursor for /v1/workouts/events
  bodyweightKg: null,// fallback for bodyweight-exercise fatigue when Hevy has no measurement
  theme: 'system',   // 'system' | 'light' | 'dark'
  lastImport: null   // ISO timestamp of the last successful file import
})

export async function loadState() {
  const saved = await get(KEY)
  return saved ? { ...emptyState(), ...saved } : emptyState()
}

export async function saveState(S) {
  await set(KEY, S)
}

export async function loadSettings() {
  const saved = await get(KEY_SETTINGS)
  return saved ? { ...defaultSettings(), ...saved } : defaultSettings()
}

export async function saveSettings(s) {
  await set(KEY_SETTINGS, s)
}

/** One-tap backup. The app never holds anything Hevy does not, but a file is reassuring. */
export function exportJSON(S, settings) {
  const payload = {
    exportedAt: new Date().toISOString(),
    app: 'baseline',
    state: S,
    settings: { ...settings, apiKey: settings.apiKey ? '(redacted)' : '' },
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `baseline-backup-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Restore from a backup file.
 *
 * A restore replaces rather than merges. Merging two histories of the same measurements would
 * need a rule for which copy wins on a clashing date, and quietly picking one is how a backup
 * turns into silent data loss; replacing is the thing the file name promises.
 *
 * The API key is never in the file — export redacts it — so the key already on this device is
 * kept rather than being wiped by a restore.
 *
 * @param {string} text Raw contents of a `baseline-backup-*.json`.
 * @param {object} settings Current settings, whose `apiKey` survives the restore.
 * @returns {{state: object, settings: object, counts: object}}
 * @throws {Error} With a message fit to show the user when the file is not a backup.
 */
export function parseBackup(text, settings) {
  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('That is not a JSON file.')
  }

  const state = data?.state
  if (!state || !Array.isArray(state.workouts)) {
    throw new Error('That file is not a Baseline backup — no workout list inside it.')
  }
  if (data.app && data.app !== 'baseline') {
    throw new Error(`That backup was written by ${data.app}, not Baseline.`)
  }

  const restored = { ...emptyState(), ...state }
  const incoming = data.settings || {}
  return {
    state: restored,
    // A redacted key is a placeholder, not a key. Anything real in the file would still be
    // wrong to prefer over the one already on the device.
    settings: {
      ...settings,
      ...incoming,
      apiKey: settings?.apiKey || '',
    },
    counts: {
      workouts: restored.workouts.length,
      measurements: restored.measurements?.length || 0,
      nutrition: restored.nutrition?.length || 0,
      bodyweight: restored.bodyweight?.length || 0,
      exportedAt: data.exportedAt || null,
    },
  }
}
