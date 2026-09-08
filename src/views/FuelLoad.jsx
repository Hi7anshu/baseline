import { useMemo, useState } from 'react'
import FuelChart from '../components/FuelChart.jsx'
import { fuelRead, conditionsByGroup, consequence } from '../lib/fuel.js'
import { targets, PROTEIN_LOW } from '../lib/nutrition.js'

/**
 * What the food was for: the training it was meant to support.
 *
 * This lived on Recovery and did not survive contact with the question "so what is it doing to my
 * muscles" — a chart of intake beside a chart of load is two facts sitting next to each other, not
 * an answer. It belongs here, next to the log it is made of, while Recovery keeps only the one-line
 * verdict and a way through to this page. The reasoning it carries has not changed: report the
 * conditions, state the consequence as confidence in the clock, never scale a fatigue number.
 */
export default function FuelLoad({ S }) {
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

const round1 = v => Math.round(v * 10) / 10
