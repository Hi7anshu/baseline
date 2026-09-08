import { useMemo, useState } from 'react'
import BodyMap from '../vendor/components/BodyMap.jsx'
import MuscleList from '../components/MuscleList.jsx'
import { MUSCLE_NAME, musclesOf } from '../vendor/lib/muscles.js'
import { exOr } from '../vendor/lib/exercises.js'
import { STRENGTH_FLOOR } from '../vendor/lib/recovery.js'
import { groupValues, MAX, MIN } from '../lib/groups.js'
import { recoveryRows, fmtEta, STATE_LABEL, FATIGUE_THRESHOLDS } from '../lib/eta.js'
import { fatigueStateOf } from '../vendor/lib/recovery-view.js'
import { fuelRead, conditionsByGroup, consequence } from '../lib/fuel.js'
import { deltVolume, HEADS } from '../lib/delts.js'
import { targets, PROTEIN_LOW } from '../lib/nutrition.js'
import FuelChart from '../components/FuelChart.jsx'

const LENSES = [
  { id: 'fatigue', label: 'Fatigue' },
  { id: 'retention', label: 'Retention' },
  { id: 'fuel', label: 'Fuel' },
]

/**
 * Three questions about the same body.
 *
 * Fatigue asks what is too fresh to train; retention asks what has gone stale from *not* being
 * trained. They are opposite instructions — a muscle can be neither, or, after a layoff on one
 * side of the body, both — so they share a screen rather than sitting two tabs apart.
 *
 * Fuel is the third: not a state of the body but the conditions it was asked to recover under.
 * It is deliberately a separate lens rather than a factor inside the other two, because it does
 * not move either number — see `lib/fuel.js` for why that refusal is the honest position.
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
      {lens === 'fatigue' && <Fatigue S={S} now={now} fatigue={fatigue} selected={selected} setSelected={setSelected} onFuel={() => setLens('fuel')} />}
      {lens === 'retention' && <Retention strength={strength} selected={selected} setSelected={setSelected} />}
      {lens === 'fuel' && <FuelLens S={S} />}
    </>
  )
}

/* ---------------------------------------------------------------- fatigue -- */

function Fatigue({ S, now, fatigue, selected, setSelected, onFuel }) {
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

  // Shoulders is the one group openGym cannot break down, so its volume split stands in — see
  // the note rendered with it.
  const deltDays = 14
  const delts = useMemo(() => {
    const cutoff = Date.now() - deltDays * 86400000
    return deltVolume(S.workouts.filter(w => (w.start || new Date(w.d).getTime()) > cutoff))
  }, [S.workouts])

  // Fuel qualifies these numbers, so the qualification belongs on this screen rather than one
  // lens away where it would only be read by someone already looking for it.
  const fuel = useMemo(() => conditionsByGroup(S, deltDays), [S])
  const note = useMemo(() => consequence(fuel.summary), [fuel])

  return (
    <>
      {note && note.state !== 'ok' && (
        <button className={'banner ' + note.state} onClick={onFuel}>
          <span className="bn-h">{note.head}</span>
          <span className="bn-b">
            {fuel.summary.thin > 0
              ? `${fuel.summary.thin} of ${fuel.summary.trainingDays} training days in the last ${deltDays} were under-fuelled.`
              : `${fuel.summary.unknown} of ${fuel.summary.trainingDays} training days have no intake logged.`}
            {' '}Open Fuel ›
          </span>
        </button>
      )}

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
          extra={{ shoulders: <DeltSplit delts={delts} days={deltDays} /> }}
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

/* ------------------------------------------------------------ delt split -- */

/**
 * What the shoulder fatigue figure is made of.
 *
 * Training splits the delts into three heads and Recovery does not, which reads as an
 * inconsistency and is really a modelling limit: openGym draws and decays one `deltoids`, so
 * there is exactly one fatigue number for the whole shoulder and no honest way to divide it —
 * the three heads would need a measured decay curve each, and nobody has measured them.
 *
 * What can be shown is the same volume split Training uses, in the same place, so opening
 * Shoulders answers the question actually being asked — "which part of my shoulder is that
 * fatigue coming from?" — with set counts, which are observed, instead of with a percentage
 * that would have to be invented.
 */
function DeltSplit({ delts, days }) {
  const max = Math.max(delts.front, delts.side, delts.rear, 1)
  return (
    <div className="delt-split">
      {HEADS.map(head => (
        <div key={head.id} className="row sub-row static">
          <span className="r-name">{head.name}</span>
          <span className="bar">
            <i className="fill vol" style={{ width: `${Math.max(2, (delts[head.id] / max) * 100)}%` }} />
          </span>
          <span className="r-eta">{round1(delts[head.id])}</span>
        </div>
      ))}
      <p className="foot">
        Effective sets over {days} days, not fatigue. openGym models one deltoid and decays it as
        one, so the percentage above covers the whole shoulder; this is where that work went.
        Heads are read from exercise names
        {delts.unclassified > 0.05 && `, and ${round1(delts.unclassified)} sets whose name did not say were split evenly`}.
      </p>
    </div>
  )
}

const round1 = v => Math.round(v * 10) / 10

/* ------------------------------------------------------------------- fuel -- */

/**
 * What the body was given to recover with.
 *
 * The chart answers one question the other two lenses cannot: did the hard days get fed. It
 * reports and does not score — the fatigue percentages on the first lens are identical whether
 * this page shows a fed week or a starved one, and the note at the bottom says so out loud
 * rather than leaving the omission to be discovered.
 */
function FuelLens({ S }) {
  const [days, setDays] = useState(14)
  const [metric, setMetric] = useState('protein')

  const { coverage, readings, rows } = useMemo(() => fuelRead(S, days), [S, days])
  const cond = useMemo(() => conditionsByGroup(S, days), [S, days])
  const note = useMemo(() => consequence(cond.summary), [cond])

  const weightKg = S.bodyweight?.length ? S.bodyweight[S.bodyweight.length - 1].w : null
  const goals = useMemo(() => targets(S.profile, weightKg), [S.profile, weightKg])
  const goal = metric === 'kcal'
    ? goals?.tdee ?? null
    : weightKg ? Math.round(weightKg * PROTEIN_LOW) : null

  return (
    <>
      <section className="card">
        <div className="d-head">
          <h2 className="c-h">Intake against load</h2>
          <div className="seg tight">
            {[7, 14, 30].map(d => (
              <button key={d} className={'seg-b' + (days === d ? ' on' : '')} onClick={() => setDays(d)}>
                {d}d
              </button>
            ))}
          </div>
        </div>

        <div className="seg">
          {[['protein', 'Protein'], ['kcal', 'Calories']].map(([id, label]) => (
            <button key={id} className={'seg-b' + (metric === id ? ' on' : '')} onClick={() => setMetric(id)}>
              {label}
            </button>
          ))}
        </div>

        <FuelChart rows={rows} metric={metric} unit={metric === 'kcal' ? 'kcal' : 'g'} goal={goal} />

        <div className="verdict" style={{ marginTop: 14, marginBottom: 0 }}>
          <div className="v-col">
            <span className="v-n">{coverage.logged}<small>/{coverage.days}</small></span>
            <span className="v-l">days logged</span>
          </div>
          <div className="v-col">
            <span className="v-n">{coverage.trainingDays}</span>
            <span className="v-l">training days</span>
          </div>
          <div className="v-col">
            <span className="v-n">{coverage.totalSets}</span>
            <span className="v-l">working sets</span>
          </div>
        </div>

        <p className="foot">
          Bars are working sets per day, the line is what you logged under <strong>Fuel</strong>.
          The line breaks across days you did not log rather than joining over them — a segment
          drawn through a gap would be a meal that never happened.
        </p>
      </section>

      <section className="card">
        <h2 className="c-h">What this does to recovery</h2>
        {note ? (
          <>
            <div className={'callout ' + note.state}>
              <strong>{note.head}</strong>
              <p>{note.body}</p>
            </div>

            {cond.groups.length > 0 && (
              <>
                <h3 className="sub-h">The work those days carried</h3>
                <ul className="rows grouped cond">
                  {cond.groups.map(g => (
                    <li key={g.id} className="row static cond-row">
                      <span className="r-name">{g.name}</span>
                      <span className="bar split" title={`${round1(g.fed)} fed, ${round1(g.thin)} under-fuelled, ${round1(g.unknown)} unlogged`}>
                        <i className="fill fed" style={{ width: pct(g.fed, g.total) }} />
                        <i className="fill thin" style={{ width: pct(g.thin, g.total) }} />
                        <i className="fill unknown" style={{ width: pct(g.unknown, g.total) }} />
                      </span>
                      <span className={'r-eta ' + g.verdict}>{LABEL[g.verdict]}</span>
                    </li>
                  ))}
                </ul>
                <div className="fc-key">
                  <span><i className="k-fed" /> Fed</span>
                  <span><i className="k-thin" /> Under-fuelled</span>
                  <span><i className="k-unknown" /> Not logged</span>
                </div>
                <p className="foot">
                  Each bar is that group's effective sets over {days} days, split by the state of
                  the day they were done on. A group is called under-fuelled only when most of its
                  work landed on days under the protein floor or well under the burn estimate —
                  one thin day in a fortnight says nothing about a muscle.
                </p>
              </>
            )}
          </>
        ) : (
          <p className="p">Nothing trained in this window, so there is nothing for intake to have supported.</p>
        )}
      </section>

      <section className="card">
        <h2 className="c-h">Reading</h2>
        <ul className="reads">
          {readings.map((r, i) => <li key={i} className={r.state}>{r.text}</li>)}
        </ul>
      </section>

      <section className="card">
        <h2 className="c-h">Why there is no fuel-adjusted score</h2>
        <p className="foot">
          Nothing on this page changes a fatigue or retention percentage. Protein and energy
          really do gate repair, which is why the effect is stated as how much to trust the
          clock — there is no measured function from a day's calories to a percentage of muscle
          readiness, and openGym's model has no input for one: it reads sets, load and time.
          A number invented to fill that gap would be indistinguishable, later, from a measured
          one.
        </p>
      </section>
    </>
  )
}

const LABEL = { fed: 'fed', thin: 'thin', unknown: 'unlogged' }
const pct = (v, total) => `${total > 0 ? (v / total) * 100 : 0}%`

function relDay(iso, now) {
  const days = Math.floor((now - new Date(iso + 'T12:00:00').getTime()) / 86400000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  return `${days} days ago`
}
