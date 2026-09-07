// Local persistence. Everything here is a cache: Hevy is the source of truth, so anything
// in IndexedDB can be thrown away and rebuilt from an import or a sync. That is deliberate —
// it means no server has to hold this data, and losing the phone loses nothing.
import { get, set } from 'idb-keyval'

const KEY = 'opengym-hevy-state'
const KEY_SETTINGS = 'opengym-hevy-settings'

/** The state shape the vendored openGym libs expect. */
export const emptyState = () => ({
  workouts: [],      // [{ id, d, start, end, name, entries: [{ id, sets: [...] }] }]
  customEx: [],      // exercises Hevy logged that the catalogue could not match
  bodyweight: [],    // [{ d, w }]
  exWeights: {},     // seeded by mergeImport; unused here but keeps the contract intact
  unit: 'kg',
})

export const defaultSettings = () => ({
  apiKey: '',        // Hevy Pro developer key; empty means the CSV path
  lastSync: null,    // ISO timestamp of the last successful API sync
  syncCursor: null,  // page cursor for /v1/workouts/events
  bodyweightKg: null // fallback for bodyweight-exercise fatigue when Hevy has no measurement
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
    app: 'opengym-hevy',
    state: S,
    settings: { ...settings, apiKey: settings.apiKey ? '(redacted)' : '' },
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `fatigue-backup-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
