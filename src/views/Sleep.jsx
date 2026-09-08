import { useMemo, useState } from 'react'
import LineChart from '../vendor/components/LineChart.jsx'
import {
  TAGS, QUALITY, derive, summarise, readings, nightScore, fmtDuration,
  TARGET_MIN, POOR_EFFICIENCY, isDisturbed,
} from '../lib/sleep.js'
import { SCALES, summarise as summariseCheckins, correlate, MIN_PAIRS } from '../lib/journal.js'

const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const WINDOWS = [7, 14, 30]

/**
 * The sleep diary, the daily check-in, and what the two of them say together.
 *
 * Built as a diary rather than as a tracker readout: onset, wakings and time awake are the fields
 * that describe insomnia, they are the ones a person actually knows, and they are the ones no
 * wrist device measures honestly. Everything on this screen is derived from six numbers typed in
 * before the day starts.
 */
export default function Sleep({ S, commitState }) {
  const [tab, setTab] = useState('night')

  return (
    <>
      <div className="seg">
        <button className={'seg-b' + (tab === 'night' ? ' on' : '')} onClick={() => setTab('night')}>Last night</button>
        <button className={'seg-b' + (tab === 'trend' ? ' on' : '')} onClick={() => setTab('trend')}>Trend</button>
        <button className={'seg-b' + (tab === 'links' ? ' on' : '')} onClick={() => setTab('links')}>Patterns</button>
      </div>
      {tab === 'night' && <LogNight S={S} commitState={commitState} />}
      {tab === 'trend' && <Trend S={S} />}
      {tab === 'links' && <Patterns S={S} />}
    </>
  )
}

/* ------------------------------------------------------------- log a night -- */

function LogNight({ S, commitState }) {
  const [date, setDate] = useState(todayISO)
  const nights = S.sleep || []
  const existing = useMemo(() => nights.find(n => n.d === date), [nights, date])
  const checkins = S.checkins || []
  const checkin = useMemo(() => checkins.find(c => c.d === date), [checkins, date])

  const [form, setForm] = useState(null)
  const draft = form ?? {
    bed: existing?.bed ?? '',
    wake: existing?.wake ?? '',
    latency: existing?.latency ?? '',
    wakings: existing?.wakings ?? '',
    waso: existing?.waso ?? '',
    quality: existing?.quality ?? null,
    note: existing?.note ?? '',
    tags: existing?.tags ?? [],
  }
  const set = patch => setForm({ ...draft, ...patch })

  const live = derive(draft)
  const score = nightScore(draft)

  async function save() {
    const entry = {
      d: date,
      bed: draft.bed,
      wake: draft.wake,
      latency: numOrNull(draft.latency),
      wakings: numOrNull(draft.wakings),
      waso: numOrNull(draft.waso),
      quality: draft.quality,
      note: draft.note,
      tags: draft.tags,
    }
    const sleep = [...nights.filter(n => n.d !== date), entry].sort((a, b) => (a.d < b.d ? -1 : 1))
    await commitState({ ...S, sleep })
    setForm(null)
  }

  async function saveCheckin(patch) {
    const next = { ...(checkin || { d: date }), ...patch }
    const list = [...checkins.filter(c => c.d !== date), next].sort((a, b) => (a.d < b.d ? -1 : 1))
    await commitState({ ...S, checkins: list })
  }

  async function removeNight() {
    if (!confirm(`Delete the night of ${date}?`)) return
    await commitState({ ...S, sleep: nights.filter(n => n.d !== date) })
    setForm(null)
  }

  return (
    <>
      <section className="card">
        <div className="d-head">
          <h2 className="c-h">Sleep diary</h2>
          <input className="input date-in" type="date" value={date} onChange={e => { setDate(e.target.value); setForm(null) }} />
        </div>

        <div className="field-grid">
          <label className="field">
            <span>To bed</span>
            <input className="input" type="time" value={draft.bed} onChange={e => set({ bed: e.target.value })} />
          </label>
          <label className="field">
            <span>Got up</span>
            <input className="input" type="time" value={draft.wake} onChange={e => set({ wake: e.target.value })} />
          </label>
          <label className="field">
            <span>Minutes to fall asleep</span>
            <input className="input" type="number" inputMode="numeric" placeholder="—"
              value={draft.latency} onChange={e => set({ latency: e.target.value })} />
          </label>
          <label className="field">
            <span>Times woken</span>
            <input className="input" type="number" inputMode="numeric" placeholder="—"
              value={draft.wakings} onChange={e => set({ wakings: e.target.value })} />
          </label>
          <label className="field">
            <span>Minutes awake in the night</span>
            <input className="input" type="number" inputMode="numeric" placeholder="—"
              value={draft.waso} onChange={e => set({ waso: e.target.value })} />
          </label>
        </div>

        <label className="field">
          <span>How rested</span>
          <div className="seg">
            {QUALITY.map((q, i) => (
              <button key={q} className={'seg-b' + (draft.quality === i + 1 ? ' on' : '')}
                onClick={() => set({ quality: i + 1 })} title={q}>
                {i + 1}
              </button>
            ))}
          </div>
        </label>

        <label className="field">
          <span>Anything that might have mattered</span>
          <div className="chips pickable">
            {TAGS.map(t => (
              <button
                key={t.id}
                className={'chip' + (draft.tags.includes(t.id) ? ' primary' : '')}
                onClick={() => set({
                  tags: draft.tags.includes(t.id)
                    ? draft.tags.filter(x => x !== t.id)
                    : [...draft.tags, t.id],
                })}
              >
                {t.label}
              </button>
            ))}
          </div>
        </label>

        <label className="field">
          <span>Note</span>
          <textarea className="input area" rows={2} placeholder="Woke at 3 and could not get back down…"
            value={draft.note} onChange={e => set({ note: e.target.value })} />
        </label>

        {live.asleep != null && (
          <div className="stat-grid" style={{ marginBottom: 14 }}>
            <Stat label="Asleep" value={fmtDuration(live.asleep)} />
            <Stat label="In bed" value={fmtDuration(live.inBed)} />
            <Stat
              label="Efficiency"
              value={live.efficiency == null ? '—' : `${Math.round(live.efficiency * 100)}%`}
              good={live.efficiency != null && live.efficiency >= POOR_EFFICIENCY}
            />
          </div>
        )}

        <div className="btn-row">
          <button className="btn primary" disabled={live.asleep == null} onClick={save}>
            {existing ? 'Update night' : 'Save night'}
          </button>
          {existing && <button className="btn danger" onClick={removeNight}>Delete</button>}
        </div>
        {live.asleep == null && (
          <p className="foot">A bed time and a wake time are enough to save. Everything else sharpens it.</p>
        )}
        {score != null && (
          <p className="foot">
            Scores {score}/100 for readiness — three parts duration against {fmtDuration(TARGET_MIN)},
            two parts efficiency. {isDisturbed({ ...draft, ...live }) && 'This one counts as disturbed: efficiency, onset or time awake is past the usual threshold.'}
          </p>
        )}
      </section>

      <section className="card">
        <h2 className="c-h">Check in · {date === todayISO() ? 'today' : date}</h2>
        <p className="p">
          Thirty seconds. The bad days are the ones carrying the information, so this is worth
          filling in exactly when you least want to.
        </p>
        {SCALES.map(s => (
          <label key={s.key} className="field">
            <span>{s.label} <em>{s.low} → {s.high}</em></span>
            <div className="seg">
              {[1, 2, 3, 4, 5].map(v => (
                <button key={v}
                  className={'seg-b' + ((checkin?.[s.key] ?? null) === v ? ' on' : '')}
                  onClick={() => saveCheckin({ [s.key]: v })}
                >{v}</button>
              ))}
            </div>
          </label>
        ))}
        <label className="field">
          <span>Note</span>
          <input className="input" type="text" placeholder="optional"
            value={checkin?.note ?? ''} onChange={e => saveCheckin({ note: e.target.value })} />
        </label>
        <p className="foot">Saved as you tap — there is no submit button to forget.</p>
      </section>

      <History nights={nights} />
    </>
  )
}

/* ------------------------------------------------------------------ trend -- */

function Trend({ S }) {
  const [days, setDays] = useState(14)
  const sum = useMemo(() => summarise(S.sleep, days), [S.sleep, days])

  if (!sum.logged) {
    return (
      <section className="card empty">
        <h2>Nothing logged yet</h2>
        <p>Log a few nights and the pattern — not any one night — is what shows up here.</p>
      </section>
    )
  }

  const at = iso => new Date(iso + 'T12:00:00').getTime()
  const asleepPts = sum.rows.map(r => ({ t: at(r.d), d: r.d, y: Math.round((r.asleep / 60) * 10) / 10 }))
  const effPts = sum.rows.filter(r => r.efficiency != null)
    .map(r => ({ t: at(r.d), d: r.d, y: Math.round(r.efficiency * 100) }))

  return (
    <>
      <section className="card">
        <div className="d-head">
          <h2 className="c-h">Last {days} nights</h2>
          <div className="seg tight">
            {WINDOWS.map(d => (
              <button key={d} className={'seg-b' + (days === d ? ' on' : '')} onClick={() => setDays(d)}>{d}d</button>
            ))}
          </div>
        </div>

        <div className="stat-grid">
          <Stat label="Asleep" value={fmtDuration(sum.asleep)} />
          <Stat label="Efficiency" value={`${Math.round(sum.efficiency * 100)}%`}
            good={sum.efficiency >= POOR_EFFICIENCY} />
          <Stat label="To fall asleep" value={sum.latency == null ? '—' : `${Math.round(sum.latency)}m`} />
          <Stat label="Awake in night" value={sum.waso == null ? '—' : `${Math.round(sum.waso)}m`} />
          <Stat label="Wakings" value={sum.wakings == null ? '—' : sum.wakings.toFixed(1)} />
          <Stat label="Disturbed" value={`${sum.disturbed}/${sum.logged}`} />
        </div>
        <p className="foot">
          Across {sum.logged} logged night{sum.logged === 1 ? '' : 's'}.
          {sum.bedSpread != null && ` Bedtime varies by about ${Math.round(sum.bedSpread)} minutes, wake time by ${Math.round(sum.wakeSpread)}.`}
        </p>
      </section>

      <section className="card">
        <h2 className="c-h">Hours asleep</h2>
        <div className="chart">
          <LineChart points={asleepPts} h={150} unit=" h" color="var(--accent)" goal={TARGET_MIN / 60} />
        </div>
        <p className="foot">Dashed line is {fmtDuration(TARGET_MIN)}. Only nights you logged appear — gaps are gaps.</p>
      </section>

      {effPts.length > 1 && (
        <section className="card">
          <h2 className="c-h">Sleep efficiency</h2>
          <div className="chart">
            <LineChart points={effPts} h={150} unit="%" color="var(--accent)" goal={POOR_EFFICIENCY * 100} />
          </div>
          <p className="foot">
            Time asleep as a share of time in bed. Under {Math.round(POOR_EFFICIENCY * 100)}% is the
            conventional line for disturbed sleep, and it is the number that separates "not enough
            sleep" from "hours in bed, awake" — which have opposite fixes.
          </p>
        </section>
      )}

      <section className="card">
        <h2 className="c-h">Reading</h2>
        <ul className="reads">
          {readings(sum).map((r, i) => <li key={i} className={r.state}>{r.text}</li>)}
        </ul>
        <p className="foot">
          Thresholds are the conventional ones from sleep medicine, not this app's invention. None
          of this is a diagnosis, and persistent insomnia is worth taking to a doctor — what a diary
          is genuinely good for is showing them three weeks of evidence instead of a description.
        </p>
      </section>
    </>
  )
}

/* --------------------------------------------------------------- patterns -- */

/**
 * What moves with what.
 *
 * Correlations from a fortnight of one person's self-report are the weakest evidence in the app,
 * so they are quarantined on their own tab, gated behind a minimum number of paired days, and
 * worded as "moved together" throughout. Sleep is offset by a night against mood: the question is
 * whether last night shows up in today, not whether they were recorded on the same date.
 */
function Patterns({ S }) {
  const [days, setDays] = useState(30)

  const links = useMemo(() => {
    const nights = new Map((S.sleep || []).map(n => [n.d, { ...n, ...derive(n) }]))
    const checkins = S.checkins || []
    const cutoff = Date.now() - days * 86400000

    const prevDay = iso => {
      const d = new Date(iso + 'T12:00:00')
      d.setDate(d.getDate() - 1)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }

    const rows = checkins.filter(c => new Date(c.d + 'T12:00:00').getTime() > cutoff)

    const pairs = (xOf, yOf) => rows.map(c => ({ x: xOf(c), y: yOf(c) }))
    const nightOf = c => nights.get(c.d) || null
    const nightBefore = c => nights.get(prevDay(c.d)) || null

    return [
      {
        id: 'sleep-mood',
        label: 'Hours asleep → next-day mood',
        result: correlate(pairs(c => nightOf(c)?.asleep ?? null, c => c.mood)),
        note: 'The night indexed to the morning it ended, against how that day felt.',
      },
      {
        id: 'eff-energy',
        label: 'Sleep efficiency → energy',
        result: correlate(pairs(c => nightOf(c)?.efficiency ?? null, c => c.energy)),
        note: 'Broken sleep and short sleep are different complaints; this is the broken one.',
      },
      {
        id: 'stress-sleep',
        label: "Today's stress → tonight's sleep",
        result: correlate(pairs(c => c.stress, c => {
          // Tonight's sleep is recorded against tomorrow's date, so it is fetched forward.
          const d = new Date(c.d + 'T12:00:00')
          d.setDate(d.getDate() + 1)
          const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
          return nights.get(iso)?.efficiency ?? null
        })),
        note: 'The direction that usually matters more, and the one people check less.',
      },
      {
        id: 'prev-soreness',
        label: 'Last night → soreness today',
        result: correlate(pairs(c => nightBefore(c)?.asleep ?? null, c => c.soreness)),
        note: 'Repair happens while you are asleep, so this is the pairing to watch on a hard block.',
      },
    ]
  }, [S.sleep, S.checkins, days])

  const found = links.filter(l => l.result)

  return (
    <>
      <section className="card">
        <div className="d-head">
          <h2 className="c-h">What moves together</h2>
          <div className="seg tight">
            {[30, 90].map(d => (
              <button key={d} className={'seg-b' + (days === d ? ' on' : '')} onClick={() => setDays(d)}>{d}d</button>
            ))}
          </div>
        </div>

        {found.length === 0 ? (
          <p className="p">
            Nothing to show yet. This needs at least {MIN_PAIRS} days where both halves of a pair
            were logged — a sleep diary and a check-in on the same day. Keep going and the pairings
            fill in one by one.
          </p>
        ) : (
          <ul className="reads">
            {links.map(l => (
              <li key={l.id} className={l.result ? (Math.abs(l.result.r) >= 0.4 ? 'ok' : 'flat') : 'flat'}>
                <strong>{l.label}</strong> —{' '}
                {l.result
                  ? l.result.strength === 'nothing'
                    ? `no relationship worth naming across ${l.result.n} days.`
                    : `${l.result.strength} ${l.result.r > 0 ? 'positive' : 'negative'} relationship (r ${l.result.r.toFixed(2)}) across ${l.result.n} days.`
                  : `needs ${MIN_PAIRS} paired days.`}
                {l.result && l.result.strength !== 'nothing' && <> {l.note}</>}
              </li>
            ))}
          </ul>
        )}

        <p className="foot">
          These are correlations in your own diary, and nothing more. A fortnight of self-report
          from one person cannot separate cause from coincidence — a bad week at work moves stress,
          sleep and mood together without either causing the other. Read them as somewhere to look,
          then test it deliberately: change one thing for two weeks and watch this page.
        </p>
      </section>
    </>
  )
}

/* ---------------------------------------------------------------- history -- */

function History({ nights }) {
  const rows = useMemo(
    () => [...(nights || [])].sort((a, b) => (a.d < b.d ? 1 : -1)).slice(0, 14).map(n => ({ ...n, ...derive(n) })),
    [nights],
  )
  if (!rows.length) return null

  return (
    <section className="card">
      <h2 className="c-h">Recent nights</h2>
      <ul className="rows">
        {rows.map(n => (
          <li key={n.d} className="row static night-row">
            <span className="r-name">{shortDate(n.d)}</span>
            <span className="hist-cells">
              <em>{fmtDuration(n.asleep)}</em>
              {n.efficiency != null && (
                <em className={n.efficiency < POOR_EFFICIENCY ? 'bad' : ''}>{Math.round(n.efficiency * 100)}%</em>
              )}
              {n.wakings ? <em>{n.wakings}×</em> : null}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Stat({ label, value, good }) {
  return (
    <div className="stat">
      <span className="stat-l">{label}</span>
      <span className={'stat-v' + (good ? ' good' : '')}>{value}</span>
    </div>
  )
}

const numOrNull = v => {
  const n = Number(v)
  return v === '' || v == null || !Number.isFinite(n) || n < 0 ? null : n
}

const shortDate = iso =>
  new Date(iso + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
