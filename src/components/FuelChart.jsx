/**
 * Intake over training load, on one timeline.
 *
 * Two units on one chart, which is normally a bad idea — it invites reading a crossing point as
 * a relationship. It earns its place here because the question is genuinely "did the hard days
 * get fed", and answering that from two separate charts means holding fourteen dates in your
 * head. The bars are training and the line is food; the line breaks wherever a day was not
 * logged rather than joining across the hole, because a straight segment over a gap is a
 * fabricated meal.
 *
 * The dashed rule is the reference — estimated burn for calories, the 1.6 g/kg floor for
 * protein — so a day reads as over or under something without needing the axis.
 */
const W = 340

export default function FuelChart({ rows, metric, unit, goal, h = 170 }) {
  const P = { l: 34, r: 30, t: 12, b: 20 }
  if (!rows?.length) return <div className="empty small">No days in this window yet</div>

  const vals = rows.map(r => r[metric]).filter(v => v != null)
  const maxSets = Math.max(1, ...rows.map(r => r.sets))

  let ymax = Math.max(goal || 0, ...vals, 1)
  ymax *= 1.15
  const Y = v => P.t + (1 - v / ymax) * (h - P.t - P.b)

  const n = rows.length
  const span = W - P.l - P.r
  const step = span / n
  const X = i => P.l + step * (i + 0.5)

  // Points are laid out on the day index, not the timestamp: every row here is one calendar
  // day, so even spacing is the true spacing, and it keeps the bars under their own dots.
  const segments = []
  let run = []
  rows.forEach((r, i) => {
    if (r[metric] == null) { if (run.length) segments.push(run); run = []; return }
    run.push({ x: X(i), y: Y(r[metric]), r })
  })
  if (run.length) segments.push(run)

  const setScale = s => (s / maxSets) * (h - P.t - P.b) * 0.55

  return (
    <div className="chart fuel-chart">
      <svg viewBox={`0 0 ${W} ${h}`} preserveAspectRatio="none" style={{ aspectRatio: `${W}/${h}` }}>
        {[0, 0.5, 1].map(f => (
          <line key={f} x1={P.l} x2={W - P.r} y1={Y(ymax * f)} y2={Y(ymax * f)}
            stroke="var(--line)" strokeWidth="1" strokeDasharray="2 4" />
        ))}
        <text x={P.l - 5} y={Y(ymax) + 8} textAnchor="end" fontSize="9.5" fill="var(--faint)">
          {Math.round(ymax)}
        </text>

        {rows.map((r, i) => (
          r.sets > 0 && (
            <rect key={'b' + r.d} x={X(i) - step * 0.3} width={step * 0.6}
              y={h - P.b - setScale(r.sets)} height={setScale(r.sets)}
              rx="2" fill="var(--accent)" opacity=".28" />
          )
        ))}

        {goal != null && (
          <>
            <line x1={P.l} x2={W - P.r} y1={Y(goal)} y2={Y(goal)}
              stroke="var(--recovering)" strokeWidth="1.4" strokeDasharray="6 4" />
            <text x={W - P.r + 2} y={Y(goal) + 3.5} fontSize="9" fill="var(--recovering)">
              {Math.round(goal)}
            </text>
          </>
        )}

        {segments.map((seg, i) => (
          <polyline key={'s' + i} fill="none" stroke="var(--l4)" strokeWidth="2.2"
            strokeLinejoin="round" strokeLinecap="round"
            points={seg.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')} />
        ))}
        {segments.flat().map(p => (
          <circle key={'p' + p.r.d} cx={p.x} cy={p.y} r="3" fill="var(--l4)" />
        ))}

        <line x1={P.l} x2={W - P.r} y1={h - P.b} y2={h - P.b} stroke="var(--line)" strokeWidth="1" />
        <text x={P.l} y={h - 6} fontSize="9" fill="var(--faint)">{shortDay(rows[0].d)}</text>
        <text x={W - P.r} y={h - 6} textAnchor="end" fontSize="9" fill="var(--faint)">
          {shortDay(rows[rows.length - 1].d)}
        </text>
      </svg>

      <div className="fc-key">
        <span><i className="k-line" /> {metric === 'kcal' ? 'Calories' : 'Protein'}{unit ? ` (${unit})` : ''}</span>
        <span><i className="k-bar" /> Working sets</span>
        {goal != null && <span><i className="k-goal" /> {metric === 'kcal' ? 'Estimated burn' : 'Protein floor'}</span>}
      </div>
    </div>
  )
}

const shortDay = iso =>
  new Date(iso + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
