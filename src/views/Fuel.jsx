import { useMemo, useState } from 'react'
import {
  parseMacros, kcalFromMacros, summarise, targets, ageFrom,
  proteinVerdict, PROTEIN_LOW, CLAUDE_PROMPT,
} from '../lib/nutrition.js'
import { hardSets } from '../lib/fuel.js'
import FuelLoad from './FuelLoad.jsx'

const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const MACROS = [
  { key: 'kcal', label: 'Calories', unit: '' },
  { key: 'protein', label: 'Protein', unit: 'g' },
  { key: 'carbs', label: 'Carbs', unit: 'g' },
  { key: 'fat', label: 'Fat', unit: 'g' },
]

/**
 * What went in, next to what went out.
 *
 * The form is always open rather than hidden behind an Add button: this is the one screen you
 * come to in order to type something, so making the typing a second step was pure friction.
 *
 * This deliberately stops short of scoring recovery from food. Intake and training volume are
 * shown on one timeline and concrete things are flagged — protein against body weight, a week's
 * intake against an estimated burn — but nothing claims a causal link between a day's eating and
 * a muscle's readiness. The data cannot support that, and a confident invented number would be
 * worse than none.
 */
export default function Fuel({ S, commitState }) {
  const [tab, setTab] = useState('log')

  return (
    <>
      <div className="seg">
        <button className={'seg-b' + (tab === 'log' ? ' on' : '')} onClick={() => setTab('log')}>Log</button>
        <button className={'seg-b' + (tab === 'load' ? ' on' : '')} onClick={() => setTab('load')}>Against training</button>
      </div>
      {tab === 'log' ? <Log S={S} commitState={commitState} /> : <FuelLoad S={S} />}
    </>
  )
}

function Log({ S, commitState }) {
  const [date, setDate] = useState(todayISO)
  const [paste, setPaste] = useState('')
  const [vals, setVals] = useState({})
  const [days, setDays] = useState(7)
  const [copied, setCopied] = useState(false)
  const [saved, setSaved] = useState(null)

  const log = S.nutrition || []
  const summary = useMemo(() => summarise(log, days), [log, days])
  // Max by date, not the last element: a restored backup or a day added out of order leaves
  // the array in whatever sequence it arrived in, and this card claims to be about the newest day.
  const latest = useMemo(() => log.reduce((a, b) => (!a || b.d > a.d ? b : a), null), [log])

  const weightKg = S.bodyweight?.length ? S.bodyweight[S.bodyweight.length - 1].w : null
  const goals = useMemo(() => targets(S.profile, weightKg), [S.profile, weightKg])
  const perKg = summary.protein != null && weightKg ? summary.protein / weightKg : null
  const verdict = proteinVerdict(perKg)

  // Completed working sets, not openGym's per-muscle load: the load figure spreads one set
  // across every muscle it touches, so a bench press counted as roughly three, and the row
  // then read "31 sets" for a ten-set session.
  const setsByDay = useMemo(() => {
    const map = {}
    const cutoff = Date.now() - days * 86400000
    for (const w of S.workouts || []) {
      if ((w.start || new Date(w.d).getTime()) <= cutoff) continue
      map[w.d] = (map[w.d] || 0) + hardSets(w)
    }
    return map
  }, [S.workouts, days])

  function onPaste(text) {
    setPaste(text)
    const parsed = parseMacros(text)
    if (Object.values(parsed).some(v => v != null)) {
      setVals(v => ({
        ...v,
        ...Object.fromEntries(Object.entries(parsed).filter(([, x]) => x != null)),
      }))
    }
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(CLAUDE_PROMPT)
      setCopied(true)
      setTimeout(() => setCopied(false), 2200)
    } catch {
      // Clipboard access can be refused; the prompt is on screen to select by hand.
      setCopied(false)
    }
  }

  async function save() {
    const entry = { d: date }
    let any = false
    for (const m of MACROS) {
      const n = Number(vals[m.key])
      if (Number.isFinite(n) && n >= 0 && vals[m.key] !== '') { entry[m.key] = n; any = true }
    }
    if (!any) return
    const nutrition = [...log.filter(n => n.d !== date), entry].sort((a, b) => (a.d < b.d ? -1 : 1))
    await commitState({ ...S, nutrition })
    setVals({}); setPaste('')
    setSaved(date)
    setTimeout(() => setSaved(null), 2500)
  }

  async function remove(d) {
    if (!confirm(`Delete the entry for ${d}?`)) return
    await commitState({ ...S, nutrition: log.filter(n => n.d !== d) })
  }

  const implied = kcalFromMacros(vals)
  const typed = Number(vals.kcal)
  const mismatch = implied != null && Number.isFinite(typed) && typed > 0
    && Math.abs(implied - typed) > Math.max(150, typed * 0.12)
  const filled = MACROS.some(m => vals[m.key] !== undefined && vals[m.key] !== '')
  const existing = log.some(n => n.d === date)

  return (
    <>
      <section className="card">
        <h2 className="c-h">Log today</h2>

        <div className="form">
          <label className="field">
            <span>Date</span>
            <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} />
          </label>

          <label className="field">
            <span>Paste Claude's reply</span>
            <textarea
              className="input area"
              rows={2}
              placeholder="Total: 2,150 kcal | Protein 148g | Carbs 210g | Fat 68g"
              value={paste}
              onChange={e => onPaste(e.target.value)}
            />
          </label>

          <div className="field-grid">
            {MACROS.map(m => (
              <label key={m.key} className="field">
                <span>{m.label} {m.unit && <em>{m.unit}</em>}</span>
                <input
                  className="input" type="number" inputMode="decimal" placeholder="—"
                  value={vals[m.key] ?? ''}
                  onChange={e => setVals(v => ({ ...v, [m.key]: e.target.value }))}
                />
              </label>
            ))}
          </div>

          {mismatch && (
            <div className="note busy">
              Those macros work out to about {Math.round(implied)} kcal, not {Math.round(typed)}.
              Worth a look — though rounding and fibre explain a small gap.
            </div>
          )}

          <button className="btn primary" disabled={!filled} onClick={save}>
            {saved === date ? 'Saved' : existing ? 'Update this day' : 'Save day'}
          </button>
        </div>
      </section>

      <section className="card">
        <div className="d-head">
          <h2 className="c-h">Ask Claude first</h2>
          <button className="btn small" onClick={copyPrompt}>{copied ? 'Copied' : 'Copy prompt'}</button>
        </div>
        <p className="p">
          Paste this into Claude on your phone, then list what you ate. It replies with one line in
          exactly the format the box above reads, so nothing needs retyping.
        </p>
        <pre className="prompt">{CLAUDE_PROMPT}</pre>
      </section>

      <section className="card">
        <h2 className="c-h">Your targets</h2>
        {goals ? (
          <>
            <div className="stat-grid">
              <Target label="Maintain" value={goals.tdee} unit="kcal" estimate />
              <Target label="Cut" value={goals.cut} unit="kcal" estimate />
              <Target label="Gain" value={goals.gain} unit="kcal" estimate />
              <Target label="Protein" value={`${goals.proteinLow}–${goals.proteinHigh}`} unit="g" />
              <Target label="Fat floor" value={goals.fatFloor} unit="g" />
              <Target label="Carbs" value={goals.carbs} unit="g" />
            </div>
            <p className="foot">
              Calculated from your height, age, sex and activity in <strong>Body → Profile</strong>,
              against your latest weight ({weightKg} kg). Calories are Mifflin-St Jeor scaled by
              activity — a reference, not a prescription, since the equation varies between people
              and the multiplier is your own assessment. Protein is a range because the evidence is
              a range; fat is a floor rather than a target; carbs are whatever the other two leave.
            </p>
          </>
        ) : (
          <>
            <p className="p">
              Targets need {listMissing(missingFor(S))}. Fill{' '}
              {missingFor(S).length === 1 ? 'that' : 'those'} in under{' '}
              <strong>Body → Profile</strong> and this card fills itself in — that is the whole
              payoff of the profile form, along with the reference line on{' '}
              <strong>Recovery → Fuel</strong>.
            </p>
            <p className="foot">
              Height, sex and date of birth go into Mifflin-St Jeor for a resting burn; activity
              scales it to a daily one; body weight sets the protein range and the fat floor.
              Nothing else reads them.
            </p>
          </>
        )}
      </section>

      <section className="card">
        <div className="d-head">
          <h2 className="c-h">Last {days} days</h2>
          <div className="seg tight">
            {[7, 14, 30].map(d => (
              <button key={d} className={'seg-b' + (days === d ? ' on' : '')} onClick={() => setDays(d)}>
                {d}d
              </button>
            ))}
          </div>
        </div>

        {summary.logged === 0 ? (
          <p className="p">Nothing logged in this window yet.</p>
        ) : (
          <>
            <div className="stat-grid macros">
              {MACROS.map(m => (
                <div key={m.key} className="stat">
                  <span className="stat-l">{m.label}</span>
                  <span className="stat-v">
                    {summary[m.key] == null ? '—' : Math.round(summary[m.key])}
                    {summary[m.key] != null && m.unit ? <small>{m.unit}</small> : null}
                  </span>
                  <span className="stat-d flat">daily avg</span>
                </div>
              ))}
            </div>
            <p className="foot">
              Averaged over the {summary.logged} day{summary.logged === 1 ? '' : 's'} you actually
              logged, not over all {days} — otherwise a missed entry would read as a day of eating
              nothing.
            </p>
          </>
        )}
      </section>

      {goals && latest && (
        <section className="card">
          <h2 className="c-h">{latest.d === todayISO() ? 'Today' : latest.d} against target</h2>
          <ul className="reads">
            {latest.kcal != null && (
              <li className={Math.abs(latest.kcal - goals.tdee) < goals.tdee * 0.08 ? 'ok' : latest.kcal < goals.tdee ? 'low' : 'high'}>
                <strong>{Math.round(latest.kcal)} kcal</strong> against {goals.tdee} maintenance —{' '}
                {describeGap(latest.kcal, goals.tdee)}.
              </li>
            )}
            {latest.protein != null && (
              <li className={latest.protein >= goals.proteinLow ? 'ok' : 'low'}>
                <strong>{Math.round(latest.protein)} g protein</strong> against a{' '}
                {goals.proteinLow}–{goals.proteinHigh} g range —{' '}
                {latest.protein >= goals.proteinLow
                  ? 'inside it'
                  : `${Math.round(goals.proteinLow - latest.protein)} g short of the floor`}.
              </li>
            )}
            {latest.fat != null && (
              <li className={latest.fat >= goals.fatFloor ? 'ok' : 'low'}>
                <strong>{Math.round(latest.fat)} g fat</strong> against a {goals.fatFloor} g floor —{' '}
                {latest.fat >= goals.fatFloor ? 'above it' : 'under it'}.
              </li>
            )}
          </ul>
          <p className="foot">
            One day is a day. The window below is what to act on, and{' '}
            <strong>Recovery → Fuel</strong> puts these against the training they were meant to
            support.
          </p>
        </section>
      )}

      {summary.logged > 0 && (
        <section className="card">
          <h2 className="c-h">Reading</h2>
          <ul className="reads">
            {perKg != null && (
              <li className={verdict.state}>
                {/* Two decimals, not one: 1.573 rounds to "1.6" and then reads as
                    "1.6 g/kg — below 1.6 g/kg", which looks like a bug rather than a near miss. */}
                <strong>{perKg.toFixed(2)} g/kg protein</strong> — {verdict.text}.
                {verdict.state === 'low' && weightKg * PROTEIN_LOW - summary.protein >= 5 &&
                  ` About ${Math.round(weightKg * PROTEIN_LOW)} g/day would reach the bottom of the range.`}
              </li>
            )}
            {goals && summary.kcal != null && (
              <li className={Math.abs(summary.kcal - goals.tdee) < goals.tdee * 0.08 ? 'ok' : summary.kcal < goals.tdee ? 'low' : 'high'}>
                <strong>{Math.round(summary.kcal)} kcal/day</strong> against an estimated{' '}
                {goals.tdee} burn — {describeGap(summary.kcal, goals.tdee)}.
              </li>
            )}
            {perKg == null && (
              <li className="flat">
                Log a body weight under <strong>Body</strong> to see protein per kilogram, which is
                the number that actually matters.
              </li>
            )}
          </ul>
        </section>
      )}

      {summary.days.length > 0 && (
        <section className="card">
          <h2 className="c-h">Day by day</h2>
          <ul className="rows">
            {[...summary.days].reverse().map(d => (
              <li key={d.d} className="row day-row static">
                <span className="r-name">
                  {new Date(d.d + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
                </span>
                <span className="hist-cells">
                  {d.kcal != null ? <em>{Math.round(d.kcal)} kcal</em> : null}
                  {d.protein != null ? <em>{Math.round(d.protein)}p</em> : null}
                  {setsByDay[d.d] ? <em className="sets">{setsByDay[d.d]} sets</em> : null}
                </span>
                <button className="x" onClick={() => remove(d.d)} aria-label={`Delete ${d.d}`}>×</button>
              </li>
            ))}
          </ul>
          <p className="foot">
            Working sets are shown alongside so heavy days and intake read together. Delete a day
            with the ×.
          </p>
        </section>
      )}
    </>
  )
}

function Target({ label, value, unit, estimate }) {
  return (
    <div className="stat">
      <span className="stat-l">{label}{estimate && <span className="est">≈</span>}</span>
      <span className="stat-v">{value}<small>{unit}</small></span>
    </div>
  )
}

function describeGap(intake, burn) {
  const diff = intake - burn
  if (Math.abs(diff) / burn < 0.08) return 'roughly maintenance'
  const per = Math.abs(Math.round(diff))
  return diff < 0 ? `about ${per} kcal under` : `about ${per} kcal over`
}

// Which profile fields are still standing between you and a target.
function missingFor(S) {
  const p = S.profile || {}
  const out = []
  if (!(Number(p.heightCm) > 0)) out.push('your height')
  if (!p.sex) out.push('sex')
  if (!ageFrom(p.dob)) out.push('date of birth')
  if (!S.bodyweight?.length) out.push('a logged body weight')
  return out
}

function listMissing(items) {
  if (items.length <= 1) return items[0] || 'nothing'
  return items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1]
}
