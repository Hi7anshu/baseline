/**
 * The one number, drawn big.
 *
 * A ring rather than a bar because it reads at arm's length in a doorway before the gym, which is
 * the moment this screen exists for. The colour carries the band and the number carries the
 * detail, so it survives being glanced at and rewards being looked at.
 *
 * `segments` optionally splits the ring by what each input contributed, in proportion to its
 * weight — the picture of "40% of this is sleep" that a single arc cannot show. Given how easily
 * a dial like this is mistaken for a measurement, the breakdown is not decoration.
 */
export default function Ring({ value, label, sub, band = 'flat', size = 168, segments = null }) {
  const stroke = 14
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = value == null ? 0 : Math.max(0, Math.min(100, value)) / 100

  // Each component owns a slice of the circle sized by its weight, and fills its own slice in
  // proportion to its own score. So the ring is literally the weighted average it claims to be:
  // a component scoring 30 leaves most of its slice empty, and which slice is empty is visible
  // from across the room. Scaling every slice by the total instead — the obvious first attempt —
  // draws four arcs that all say the same thing.
  let offset = 0
  const arcs = (segments || []).map(s => {
    const slot = c * s.share
    const len = slot * Math.max(0, Math.min(100, s.value ?? 0)) / 100
    const arc = { ...s, len, gap: c - len, rot: (offset / c) * 360 }
    offset += slot
    return arc
  })

  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke="var(--sunk)" strokeWidth={stroke}
        />
        {arcs.length ? arcs.map(a => (
          <circle
            key={a.id}
            cx={size / 2} cy={size / 2} r={r} fill="none"
            stroke={`var(--seg-${a.id}, var(--accent))`}
            strokeWidth={stroke} strokeLinecap="butt"
            strokeDasharray={`${a.len} ${a.gap}`}
            transform={`rotate(${-90 + a.rot} ${size / 2} ${size / 2})`}
          />
        )) : (
          <circle
            cx={size / 2} cy={size / 2} r={r} fill="none"
            stroke={`var(--${band === 'flat' ? 'line' : band})`}
            strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={`${c * pct} ${c * (1 - pct)}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
      </svg>
      <div className="ring-in">
        <span className={'ring-v ' + band}>{value == null ? '—' : value}</span>
        {label && <span className="ring-l">{label}</span>}
        {sub && <span className="ring-s">{sub}</span>}
      </div>
    </div>
  )
}
