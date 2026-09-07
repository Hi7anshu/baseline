import { useMemo, useState } from 'react'
import BodyMap from '../vendor/components/BodyMap.jsx'
import MuscleList from '../components/MuscleList.jsx'
import { MUSCLE_NAME, musclesOf } from '../vendor/lib/muscles.js'
import { exOr } from '../vendor/lib/exercises.js'
import { STRENGTH_FLOOR } from '../vendor/lib/recovery.js'
import { groupValues, MAX, MIN } from '../lib/groups.js'
import { recoveryRows, fmtEta, STATE_LABEL, FATIGUE_THRESHOLDS } from '../lib/eta.js'
import { fatigueStateOf } from '../vendor/lib/recovery-view.js'

const LENSES = [
  { id: 'fatigue', label: 'Fatigue' },
  { id: 'retention', label: 'Retention' },
]

/**
 * Two questions about the same body, on the same map.
 *
 * Fatigue asks what is too fresh to train; retention asks what has gone stale from *not* being
 * trained. They are opposite instructions — a muscle can be neither, or, after a layoff on one
 * side of the body, both — so they share a screen rather than sitting two tabs apart.
 */
export default function Recovery({ S, now, fatigue, strength }) {
  const [lens, setLens] = useState('fatigue')
  const [selected, setSelected] = useState(null)

  return (
    <>
      <div className="seg">
        {LENSES.map(l => (
          <button key={l.id} className={'seg-b' + (lens === l.id ? ' on' : '')} onClick={() => setLens(l.id)}>
            {l.label}
          </button>
        ))}
      </div>
      {lens === 'fatigue'
        ? <Fatigue S={S} now={now} fatigue={fatigue} selected={selected} setSelected={setSelected} />
        : <Retention strength={strength} selected={selected} setSelected={setSelected} />}
    </>
  )
}

/* ---------------------------------------------------------------- fatigue -- */

function Fatigue({ S, now, fatigue, selected, setSelected }) {
  const rows = useMemo(() => recoveryRows(fatigue), [fatigue])
  const byState = useMemo(() => {
    const counts = { ready: 0, recovering: 0, fatigued: 0 }
    rows.forEach(r => { counts[r.state]++ })
    return counts
  }, [rows])

  // Worst muscle wins: a back with one cooked muscle is not a back you train heavy today.
  const groups = useMemo(() => groupValues(fatigue, MAX).sort((a, b) => b.value - a.value), [fatigue])
  const detail = selected ? rows.find(r => r.slug === selected) : null

  const lastHit = useMemo(() => {
    if (!selected) return null
    for (let i = S.workouts.length - 1; i >= 0; i--) {
      const w = S.workouts[i]
      const names = (w.entries || [])
        .map(e => exOr(e.id))
        .filter(ex => (musclesOf(ex)[selected] || 0) > 0)
        .map(ex => ex.n)
      if (names.length) return { w, names }
    }
    return null
  }, [selected, S.workouts])

  return (
    <>
      <section className="card">
        <div className="verdict">
          <div className="v-col"><span className="v-n">{byState.ready}</span><span className="v-l ready">ready</span></div>
          <div className="v-col"><span className="v-n">{byState.recovering}</span><span className="v-l recovering">recovering</span></div>
          <div className="v-col"><span className="v-n">{byState.fatigued}</span><span className="v-l fatigued">fatigued</span></div>
        </div>

        <BodyMap
          className="heat-fatigue"
          load={fatigue}
          thresholds={FATIGUE_THRESHOLDS}
          onMuscle={slug => setSelected(s => (s === slug ? null : slug))}
          selected={selected}
        />

        <div className="scale">
          <span>Fresh</span>
          <div className="sw f0" /><div className="sw f1" /><div className="sw f2" />
          <div className="sw f3" /><div className="sw f4" />
          <span>Fatigued</span>
        </div>
      </section>

      {detail && (
        <section className="card detail">
          <div className="d-head">
            <h2>{MUSCLE_NAME[detail.slug]}</h2>
            <span className={'pill ' + detail.state}>{STATE_LABEL[detail.state]}</span>
          </div>
          <div className="d-grid">
            <div><span className="k">Fatigue</span><span className="v">{Math.round(detail.value * 100)}%</span></div>
            <div><span className="k">Eases in</span><span className="v">{fmtEta(detail.easesIn)}</span></div>
            <div><span className="k">Fully ready</span><span className="v">{fmtEta(detail.readyIn)}</span></div>
          </div>
          {lastHit && (
            <p className="d-last">
              Last loaded {relDay(lastHit.w.d, now)} — {lastHit.names.slice(0, 3).join(', ')}
              {lastHit.names.length > 3 ? ` +${lastHit.names.length - 3} more` : ''}
            </p>
          )}
        </section>
      )}

      <section className="card">
        <h2 className="c-h">By muscle group</h2>
        <MuscleList
          groups={groups}
          max={1}
          format={v => (v > 0 ? `${Math.round(v * 100)}%` : '—')}
          stateOf={v => fatigueStateOf(v)}
          onSelect={slug => setSelected(s => (s === slug ? null : slug))}
          selected={selected}
        />
        <p className="foot">
          A group shows its most fatigued muscle, since that is what limits the session. Tap to
          open it. Fatigue decays on a 36-hour half-life and is scored against your own recent
          training, so a hard week raises the bar rather than pinning everything red.
        </p>
      </section>
    </>
  )
}

/* -------------------------------------------------------------- retention -- */

// Weakest link wins — but only among muscles that have ever been trained. A muscle sitting
// exactly on the floor was never worked directly (serratus, adductors, tibialis and friends
// rarely are), and letting those represent a group pins Chest, Core and Legs at 50% forever,
// which would say nothing about detraining. When a whole group is untrained it reports the
// floor honestly rather than hiding.
const weakestTrained = vals => {
  const trained = vals.filter(v => v > STRENGTH_FLOOR)
  return trained.length ? Math.min(...trained) : MIN(vals)
}

function Retention({ strength, selected, setSelected }) {
  const groups = useMemo(
    () => groupValues(strength, weakestTrained).sort((a, b) => a.value - b.value),
    [strength],
  )

  // The map shades "how detrained", so retention is inverted before it goes in — otherwise a
  // fully retained body would light up as if something were wrong.
  const load = useMemo(
    () => Object.fromEntries(Object.entries(strength).map(([k, v]) => [k, 1 - v])),
    [strength],
  )

  const fading = Object.values(strength).filter(v => v < 1).length
  const full = Object.values(strength).length - fading

  return (
    <>
      <section className="card">
        <div className="verdict">
          <div className="v-col"><span className="v-n">{full}</span><span className="v-l ready">at full</span></div>
          <div className="v-col"><span className="v-n">{fading}</span><span className="v-l fatigued">fading</span></div>
        </div>

        <BodyMap
          className="heat-fatigue"
          load={load}
          onMuscle={slug => setSelected(s => (s === slug ? null : slug))}
          selected={selected}
        />

        <div className="scale">
          <span>Retained</span>
          <div className="sw f0" /><div className="sw f1" /><div className="sw f2" />
          <div className="sw f3" /><div className="sw f4" />
          <span>Detrained</span>
        </div>
      </section>

      <section className="card">
        <h2 className="c-h">By muscle group</h2>
        <MuscleList
          groups={groups}
          max={1}
          format={v => `${Math.round(v * 100)}%`}
          stateOf={v => (v >= 1 ? 'ready' : v > 0.75 ? 'recovering' : 'fatigued')}
          onSelect={slug => setSelected(s => (s === slug ? null : slug))}
          selected={selected}
        />
        <p className="foot">
          Strength holds at full for 14 days after a work set, then decays on a 28-day half-life
          toward a {Math.round(STRENGTH_FLOOR * 100)}% floor. Low here means detraining, not
          tiredness — the opposite instruction to the fatigue map. A group reports its weakest
          muscle that you actually train; ones sitting on the floor because they have never been
          worked directly are shown inside but do not speak for the group.
        </p>
      </section>
    </>
  )
}

function relDay(iso, now) {
  const days = Math.floor((now - new Date(iso + 'T12:00:00').getTime()) / 86400000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  return `${days} days ago`
}
