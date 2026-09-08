import { useCallback, useEffect, useMemo, useState } from 'react'
import { fatigueOf, strengthOf } from './vendor/lib/recovery.js'
import { registerCustom } from './vendor/lib/exercises.js'
import { loadState, saveState, loadSettings, saveSettings, emptyState } from './lib/store.js'
import { reresolveCustoms } from './lib/match.js'
import { applyTheme, watchSystem } from './lib/theme.js'
import Recovery from './views/Recovery.jsx'
import Training from './views/Training.jsx'
import Body from './views/Body.jsx'
import Sleep from './views/Sleep.jsx'
import Fuel from './views/Fuel.jsx'
import Data from './views/Data.jsx'

const TABS = [
  { id: 'recovery', label: 'Recovery', icon: '◱' },
  { id: 'training', label: 'Training', icon: '▤' },
  { id: 'sleep', label: 'Sleep', icon: '☾' },
  { id: 'body', label: 'Body', icon: '⬡' },
  { id: 'fuel', label: 'Fuel', icon: '◈' },
  { id: 'data', label: 'Data', icon: '⇄' },
]

// Training is a read-only view of the imported log, so it has nothing to show until something is
// imported. Recovery now leads with a readiness score built mostly from things logged here, so it
// works from empty too — as do Sleep, Body and Fuel.
const NEEDS_TRAINING = new Set(['training'])

export default function App() {
  const [S, setS] = useState(emptyState)
  const [settings, setSettings] = useState(null)
  const [tab, setTab] = useState('recovery')
  const [ready, setReady] = useState(false)

  // `now` is read once per render pass rather than per call so every panel on screen agrees on
  // what time it is — fatigue, the ETA and the body map must not disagree by a few milliseconds.
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    Promise.all([loadState(), loadSettings()]).then(([state, s]) => {
      // Re-run identification on load. An exercise the matcher could not place last time may be
      // placeable now — improving the matcher then repairs existing history by itself, with no
      // re-import. Returns the same object when nothing changed, so this is free in the normal case.
      const repaired = reresolveCustoms(state)
      if (repaired !== state) saveState(repaired)
      setS(repaired)
      setSettings(s)
      setReady(true)
    })
  }, [])

  // Theme follows the saved preference, and — while that preference is "system" — keeps
  // following the phone as it flips at dusk rather than only at launch.
  useEffect(() => {
    if (!settings) return
    applyTheme(settings.theme)
    return watchSystem(() => applyTheme(settings.theme))
  }, [settings?.theme])

  // Fatigue moves while the app sits open on the gym floor. A minute is finer than the readout.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60000)
    const wake = () => setNow(Date.now())
    document.addEventListener('visibilitychange', wake)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', wake) }
  }, [])

  const commitState = useCallback(async next => {
    setS(next)
    await saveState(next)
  }, [])

  const commitSettings = useCallback(async next => {
    setSettings(next)
    await saveSettings(next)
  }, [])

  const customKey = useMemo(() => {
    const list = S.customEx || []
    registerCustom(list)
    // The key has to cover the muscle weights, not just the ids. Assigning muscles to an
    // unidentified exercise changes what it trains while its id stays the same, and keying on
    // ids alone left the derived fatigue on a stale cached value — visibly 0% for a muscle the
    // detail panel was simultaneously reporting as trained.
    return list.map(c => `${c.id}:${Object.entries(c.muscleWeights || {}).flat().join('-')}`).join(',')
  }, [S.customEx])

  // The two expensive passes. Both scan the whole history, so they are memoised on the inputs
  // that actually move them rather than recomputed per tab switch.
  const bodyweightKg = useMemo(
    () => S.bodyweight?.length ? S.bodyweight[S.bodyweight.length - 1].w : null,
    [S.bodyweight],
  )
  const opts = useMemo(() => ({ bodyweightKg, unit: 'kg' }), [bodyweightKg])
  const fatigue = useMemo(() => fatigueOf(S.workouts, now, opts), [S.workouts, now, opts, customKey])
  const strength = useMemo(() => strengthOf(S.workouts, now, opts), [S.workouts, now, opts, customKey])

  if (!ready) return <div className="boot">Loading…</div>

  const blocked = !S.workouts.length && NEEDS_TRAINING.has(tab)
  const shared = { S, settings, now, opts, fatigue, strength, commitState, commitSettings, goTo: setTab }

  return (
    <div className="app">
      <header className="top">
        <h1>{TABS.find(t => t.id === tab).label}</h1>
        {S.workouts.length > 0 && (
          <span className="top-sub">
            {S.workouts.length} workout{S.workouts.length === 1 ? '' : 's'}
          </span>
        )}
      </header>

      <main className="body">
        {blocked ? (
          <Onboard onGo={() => setTab('data')} />
        ) : (
          <>
            {tab === 'recovery' && <Recovery {...shared} />}
            {tab === 'training' && <Training {...shared} />}
            {tab === 'sleep' && <Sleep {...shared} />}
            {tab === 'body' && <Body {...shared} />}
            {tab === 'fuel' && <Fuel {...shared} />}
            {tab === 'data' && <Data {...shared} />}
          </>
        )}
      </main>

      <nav className="tabs">
        {TABS.map(t => (
          <button
            key={t.id}
            className={'tab' + (tab === t.id ? ' on' : '')}
            onClick={() => setTab(t.id)}
          >
            <span className="tab-i" aria-hidden="true">{t.icon}</span>
            <span className="tab-l">{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}

function Onboard({ onGo }) {
  return (
    <div className="card empty">
      <h2>No training loaded yet</h2>
      <p>
        Baseline reads your Hevy log and works out per-muscle fatigue, recovery and detraining.
        It never writes back — keep logging in Hevy exactly as you do now.
      </p>
      <button className="btn primary" onClick={onGo}>Connect Hevy</button>
    </div>
  )
}
