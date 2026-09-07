import { useMemo, useState } from 'react'
import BodyMap from '../vendor/components/BodyMap.jsx'
import { MUSCLE_NAME, MUSCLES } from '../vendor/lib/muscles.js'
import { STRENGTH_FLOOR } from '../vendor/lib/recovery.js'
import { strengthExerciseRowsForMuscle } from '../vendor/lib/strength-exercises.js'

/**
 * Retained strength — the other half of the fatigue picture.
 *
 * Fatigue asks what is too fresh to train; this asks what has gone stale. A muscle holds full
 * strength for two weeks after its last work set, then decays on a 28-day half-life toward a
 * floor. Low here means detraining, not tiredness, and the two are opposite instructions.
 */
export default function Strength({ S, now, strength }) {
  const [selected, setSelected] = useState(null)

  const rows = useMemo(
    () => MUSCLES.map(slug => ({ slug, value: strength[slug] ?? STRENGTH_FLOOR })).sort((a, b) => a.value - b.value),
    [strength],
  )

  // The body map shades "how detrained", so invert: a fully retained muscle should read cold.
  const load = useMemo(
    () => Object.fromEntries(rows.map(r => [r.slug, 1 - r.value])),
    [rows],
  )

  const exercises = useMemo(
    () => (selected ? strengthExerciseRowsForMuscle(S, now, selected) : []),
    [S, now, selected],
  )

  const detrained = rows.filter(r => r.value < 1)

  return (
    <>
      <section className="card">
        <div className="verdict">
          <div className="v-col"><span className="v-n">{rows.length - detrained.length}</span><span className="v-l ready">at full</span></div>
          <div className="v-col"><span className="v-n">{detrained.length}</span><span className="v-l fatigued">fading</span></div>
        </div>

        <BodyMap
          load={load}
          onMuscle={slug => setSelected(s => (s === slug ? null : slug))}
          selected={selected}
        />

        <div className="scale">
          <span>Retained</span>
          <div className="hm-c l0" /><div className="hm-c l1" /><div className="hm-c l2" />
          <div className="hm-c l3" /><div className="hm-c l4" />
          <span>Detrained</span>
        </div>
      </section>

      {selected && (
        <section className="card">
          <h2 className="c-h">{MUSCLE_NAME[selected]} — what holds it</h2>
          {exercises.length ? (
            <ul className="rows">
              {exercises.map(e => (
                <li key={e.id} className="row">
                  <span className="r-name">{e.name}</span>
                  <span className="r-eta">{e.e1rm ? `${Math.round(e.e1rm)} kg` : '—'}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="foot">No estimated 1RM yet — that needs a completed weighted set.</p>
          )}
        </section>
      )}

      <section className="card">
        <h2 className="c-h">Retention</h2>
        <ul className="rows">
          {rows.map(r => (
            <li
              key={r.slug}
              className={'row' + (selected === r.slug ? ' on' : '')}
              onClick={() => setSelected(s => (s === r.slug ? null : r.slug))}
            >
              <span className="r-name">{MUSCLE_NAME[r.slug]}</span>
              <span className="bar"><i className="fill str" style={{ width: `${Math.round(r.value * 100)}%` }} /></span>
              <span className="r-eta">{Math.round(r.value * 100)}%</span>
            </li>
          ))}
        </ul>
        <p className="foot">
          Full for 14 days after a work set, then a 28-day half-life down to a {Math.round(STRENGTH_FLOOR * 100)}% floor.
          A muscle you have never trained sits at the floor.
        </p>
      </section>
    </>
  )
}
