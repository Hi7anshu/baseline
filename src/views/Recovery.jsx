import { useMemo, useState } from 'react'
import BodyMap from '../vendor/components/BodyMap.jsx'
import MuscleList from '../components/MuscleList.jsx'
import { MUSCLE_NAME, musclesOf } from '../vendor/lib/muscles.js'
import { exOr } from '../vendor/lib/exercises.js'
import { STRENGTH_FLOOR } from '../vendor/lib/recovery.js'
import { groupValues, MAX, MIN } from '../lib/groups.js'
import { recoveryRows, fmtEta, STATE_LABEL, FATIGUE_THRESHOLDS } from '../lib/eta.js'
import { fatigueStateOf } from '../vendor/lib/recovery-view.js'
import { conditionsByGroup, consequence } from '../lib/fuel.js'
import { deltVolume, HEADS } from '../lib/delts.js'
import { dataAge, STALE_DAYS } from '../lib/freshness.js'
import { readiness, bandOf, BAND_LABEL, verdict } from '../lib/readiness.js'
import { derive as deriveNight, fmtDuration } from '../lib/sleep.js'
import Ring from '../components/Ring.jsx'

const LENSES = [
  { id: 'today', label: 'Today' },
  { id: 'muscles', label: 'Muscles' },
  { id: 'retention', label: 'Retention' },
]

/**
 * Three questions, at three altitudes.
 *
 * Today is the doorway question — one number, and immediately underneath it, what that number is
 * made of. Muscles is the body: what is too worked to train. Retention is the opposite worry,
 * what has gone stale from *not* being trained; a muscle can be neither, or after a layoff both,
 * which is why they sit on one screen rather than two tabs apart.
 *
 * Fuel used to be a fourth lens here and has moved to the Fuel tab. Sitting on Recovery it looked
 * like an input to the recovery numbers, which it is not and cannot honestly be; Today now carries
 * the one-line version and a way through to the detail.
 */
export default function Recovery({ S, now, fatigue, strength, goTo }) {
  const [lens, setLens] = useState('today')
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
      {lens === 'today' && (
        <Today
          S={S} now={now} fatigue={fatigue} strength={strength} goTo={goTo}
          onMuscles={() => setLens('muscles')}
          onPick={slug => { setSelected(slug); setLens('muscles') }}
        />
      )}
      {lens === 'muscles' && (
        <Fatigue S={S} now={now} fatigue={fatigue} selected={selected} setSelected={setSelected} />
      )}
      {lens === 'retention' && <Retention strength={strength} selected={selected} setSelected={setSelected} />}
    </>
  )
}

/* ------------------------------------------------------------------ today -- */

// Each input keeps one colour everywhere it appears — in the ring, in its row, on the Sleep and
// Fuel screens it links to. Four arbitrary hues would be decoration; these are the app's existing
// state colours reused, so the ring is not introducing a fifth vocabulary.
const SEG_COLOR = {
  sleep: 'var(--seg-sleep)',
  muscles: 'var(--seg-muscles)',
  fuel: 'var(--seg-fuel)',
  mind: 'var(--seg-mind)',
}

/**
 * One number, and everything it is made of, on the same screen.
 *
 * The score is a weighted average of what has been logged — see `lib/readiness.js` for why it is
 * built that way and what it deliberately is not. The rule this screen enforces is that the ring
 * is never shown alone: every component sits underneath it with its own value, its weight, and a
 * link to the screen it came from, so a number that disagrees with how you feel can be argued
 * with rather than believed.
 */
function Today({ S, now, fatigue, strength, goTo, onMuscles, onPick }) {
  const result = useMemo(() => readiness(S, fatigue), [S, fatigue])
  const band = bandOf(result.score)
  const age = useMemo(() => dataAge(S, now), [S.workouts, now])

  const fuel = useMemo(() => conditionsByGroup(S, 14), [S])
  const note = useMemo(() => consequence(fuel.summary), [fuel])

  const night = useMemo(() => {
    const rows = [...(S.sleep || [])].sort((a, b) => (a.d < b.d ? 1 : -1))
    return rows[0] ? { ...rows[0], ...deriveNight(rows[0]) } : null
  }, [S.sleep])

  const picks = useMemo(() => {
    const fat = groupValues(fatigue, MAX)
    const ret = groupValues(strength, weakestTrained)
    const rows = fat.map(g => ({
      ...g,
      state: fatigueStateOf(g.value),
      retention: ret.find(r => r.id === g.id)?.value ?? 1,
    }))
    const ready = rows.filter(r => r.state === 'ready').sort((a, b) => a.retention - b.retention)
    const rest = rows.filter(r => r.state !== 'ready').sort((a, b) => a.value - b.value)
    const top = [...ready, ...rest].slice(0, 3)
    const shown = new Set(top.map(p => p.id))
    return {
      top,
      anyReady: ready.length > 0,
      held: rows.filter(r => r.state === 'fatigued' && !shown.has(r.id)).sort((a, b) => b.value - a.value),
    }
  }, [fatigue, strength])

  return (
    <>
      {age.stale && (
        <button className="banner low" onClick={() => goTo?.('data')}>
          <span className="bn-h">Nothing imported for {age.days} days</span>
          <span className="bn-b">
            Newest workout {age.newest}. Fatigue decays with the clock whether or not anything is
            imported, so after {STALE_DAYS} days everything drifts toward ready on its own. Import ›
          </span>
        </button>
      )}

      <section className="card ring-card">
        <Ring
          value={result.score}
          label={BAND_LABEL[band]}
          sub={result.score == null ? 'nothing logged' : `${result.parts.length} of 4 inputs`}
          band={band}
          segments={result.parts.map(p => ({ id: p.id, share: p.share, value: p.value }))}
        />
        <p className="ring-verdict">{verdict(result)}</p>
      </section>

      <section className="card">
        <h2 className="c-h">What that is made of</h2>
        <ul className="drivers">
          {result.parts.map(p => (
            <li key={p.id}>
              <button className="driver" onClick={() => (p.tab === 'recovery' ? onMuscles() : goTo?.(p.tab))}>
                <span className="dr-dot" style={{ background: SEG_COLOR[p.id] }} />
                <span className="dr-n">{p.label}</span>
                <span className="dr-d">{p.detail}</span>
                <span className="dr-v">{p.value}</span>
                <span className="dr-w">{Math.round(p.share * 100)}%</span>
              </button>
            </li>
          ))}
        </ul>
        {result.missing.length > 0 && (
          <ul className="drivers missing">
            {result.missing.map(m => (
              <li key={m.id}>
                <button className="driver off" onClick={() => goTo?.(m.tab)}>
                  <span className="dr-dot" />
                  <span className="dr-n">{m.label}</span>
                  <span className="dr-d">{m.how} ›</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="foot">
          A weighted average of what you logged — sleep 40, muscles 30, fuel 15, mind 15, with
          anything missing dropped and the rest reweighted, so forgetting to log costs you
          confidence rather than points. It is not a physiological measurement: Whoop reads heart-rate
          variability off a strap, and nothing here touches your body. Weights are a judgement about
          which inputs matter most, and the components are shown so you can disagree with the total.
        </p>
      </section>

      {night && night.asleep != null && (
        <section className="card">
          <h2 className="c-h">Last night</h2>
          <div className="stat-grid">
            <div className="stat"><span className="stat-l">Asleep</span><span className="stat-v">{fmtDuration(night.asleep)}</span></div>
            <div className="stat"><span className="stat-l">Efficiency</span><span className="stat-v">{night.efficiency == null ? '—' : `${Math.round(night.efficiency * 100)}%`}</span></div>
            <div className="stat"><span className="stat-l">Wakings</span><span className="stat-v">{night.wakings ?? '—'}</span></div>
          </div>
          <p className="foot">
            Night of {night.d}{night.note ? ` — ${night.note}` : ''}.{' '}
            <button className="linkish" onClick={() => goTo?.('sleep')}>Open the diary ›</button>
          </p>
        </section>
      )}

      <section className="card">
        <h2 className="c-h">Train today</h2>
        <ul className="picks-today">
          {picks.top.map(g => (
            <li key={g.id}>
              <button className={'today-row ' + g.state} onClick={() => onPick(g.muscles[0].slug)}>
                <span className="t-n">{g.name}</span>
                <span className="t-v">{Math.round(g.value * 100)}<small>% fatigued</small></span>
                <span className={'t-r' + (g.retention < 0.9 ? ' fading' : '')}>
                  {Math.round(g.retention * 100)}<small>% held</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <p className="foot">
          {picks.anyReady
            ? 'Recovered groups first, most detrained among them at the top — where two are equally ready, the one that has been waiting longest is the one worth the session.'
            : 'Nothing is in the ready band right now, so these are simply the freshest. A group takes its most fatigued muscle, which is what limits the session.'}
          {picks.held.length > 0 && (
            <> Leave {picks.held.slice(0, 3).map(g => g.name.toLowerCase()).join(', ')}
            {picks.held.length > 3 ? ` and ${picks.held.length - 3} more` : ''}: still fatigued.</>
          )}
        </p>
      </section>

      {note && note.state !== 'ok' && !age.stale && (
        <button className={'banner ' + note.state} onClick={() => goTo?.('fuel')}>
          <span className="bn-h">{note.head}</span>
          <span className="bn-b">
            {fuel.summary.thin > 0
              ? `${fuel.summary.thin} of ${fuel.summary.trainingDays} training days in the last 14 were under-fuelled.`
              : `${fuel.summary.unknown} of ${fuel.summary.trainingDays} training days have no intake logged.`}
            {' '}See it against your training ›
          </span>
        </button>
      )}
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

  // Shoulders is the one group openGym cannot break down, so its volume split stands in — see
  // the note rendered with it.
  const deltDays = 14
  const delts = useMemo(() => {
    const cutoff = Date.now() - deltDays * 86400000
    return deltVolume(S.workouts.filter(w => (w.start || new Date(w.d).getTime()) > cutoff))
  }, [S.workouts])

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

function relDay(iso, now) {
  const days = Math.floor((now - new Date(iso + 'T12:00:00').getTime()) / 86400000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  return `${days} days ago`
}
