import { useCallback, useEffect, useMemo, useState } from 'react'
import { fatigueOf, strengthOf } from './vendor/lib/recovery.js'
import { registerCustom } from './vendor/lib/exercises.js'
import { loadState, saveState, loadSettings, saveSettings, emptyState } from './lib/store.js'
import Recovery from './views/Recovery.jsx'
import Volume from './views/Volume.jsx'
import Strength from './views/Strength.jsx'
import Effort from './views/Effort.jsx'
import Data from './views/Data.jsx'

const TABS = [
  { id: 'recovery', label: 'Recovery', icon: '◱' },
  { id: 'volume', label: 'Volume', icon: '▤' },
  { id: 'strength', label: 'Strength', icon: '△' },
  { id: 'effort', label: 'Effort', icon: '◔' },
  { id: 'data', label: 'Data', icon: '⇄' },
]

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
      setS(state)
      setSettings(s)
      setReady(true)
    })
  }, [])

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

  // Custom exercises live outside the shipped catalogue, and every muscle lookup goes through
  // the catalogue's id index — so without this an exercise Hevy described but openGym could not
  // name resolves to nothing and silently contributes no fatigue at all. Registering returns a
  // key the derived passes depend on, which is what forces them to recompute after an import.
  const customKey = useMemo(() => {
    const list = S.customEx || []
    registerCustom(list)
    return list.map(c => c.id).join(',')
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

  const empty = !S.workouts.length
  const shared = { S, settings, now, opts, fatigue, strength, commitState, commitSettings }

  return (
    <div className="app">
      <header className="top">
        <h1>{TABS.find(t => t.id === tab).label}</h1>
        {!empty && <span className="top-sub">{S.workouts.length} workouts</span>}
      </header>

      <main className="body">
        {empty && tab !== 'data' ? (
          <Onboard onGo={() => setTab('data')} />
        ) : (
          <>
            {tab === 'recovery' && <Recovery {...shared} />}
            {tab === 'volume' && <Volume {...shared} />}
            {tab === 'strength' && <Strength {...shared} />}
            {tab === 'effort' && <Effort {...shared} />}
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
        This app reads your Hevy log and works out per-muscle fatigue, recovery and detraining.
        It never writes back — keep logging in Hevy exactly as you do now.
      </p>
      <button className="btn primary" onClick={onGo}>Connect Hevy</button>
    </div>
  )
}
