/**
 * Inline-SVG charts. No charting library: the bundle is already large, and
 * these five forms are the whole need.
 *
 * Shared rules, applied here so every chart in the product agrees:
 *  - series colours come from --series-1..5 in fixed order, never cycled,
 *    and never recoloured when a filter changes how many series survive
 *  - bars cap at 24px with a 4px rounded data-end, square at the baseline
 *  - lines are 2px; markers are >= 8px across with a 2px surface ring
 *  - gridlines are hairline and recessive; text never wears a series colour
 *  - two or more series always carry a legend
 */
import { useId, useState } from 'react';

export const SERIES = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)',
  'var(--series-4)', 'var(--series-5)'];

const AXIS = { fontSize: 10, fill: 'var(--muted)' };

/** Clean axis ceiling: 0, 10, 25, 50, 100, 250… rather than 137. */
function niceMax(value) {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((s) => value <= s * magnitude) ?? 10;
  return step * magnitude;
}

const fmt = (n) => Number(n).toLocaleString();

/* ─────────────────────────── Tooltip ─────────────────────────── */

function Tooltip({ at, children }) {
  if (!at) return null;
  return (
    <div style={{
      position: 'absolute', left: at.x, top: at.y, transform: 'translate(-50%, -115%)',
      background: 'var(--panel2)', border: '1px solid var(--glass-border)',
      borderRadius: 8, padding: '7px 10px', fontSize: 12, color: 'var(--txt)',
      pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 5,
      boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
    }}>{children}</div>
  );
}

export function Legend({ items }) {
  if (items.length < 2) return null;   // one series: the title already names it
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 10 }}>
      {items.map((item) => (
        <span key={item.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--muted)' }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: item.color, flexShrink: 0 }} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

/* ──────────────────── Time series (line + area) ──────────────────── */

export function TimeSeries({ data, series, xKey = 'date', height = 190, formatX }) {
  const [hover, setHover] = useState(null);
  const gradientId = useId();
  const pad = { top: 14, right: 12, bottom: 22, left: 38 };
  const width = 760;
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const max = niceMax(Math.max(1, ...data.flatMap((row) => series.map((s) => row[s.key] ?? 0))));
  const x = (i) => pad.left + (data.length === 1 ? plotW / 2 : (i / (data.length - 1)) * plotW);
  const y = (value) => pad.top + plotH - (value / max) * plotH;

  const move = (event) => {
    const box = event.currentTarget.getBoundingClientRect();
    const ratio = ((event.clientX - box.left) / box.width) * width;
    const index = Math.round(((ratio - pad.left) / plotW) * (data.length - 1));
    if (index >= 0 && index < data.length) {
      setHover({ index, px: ((x(index) / width) * box.width), py: (y(max) / height) * box.height });
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height}
        role="img" onMouseMove={move} onMouseLeave={() => setHover(null)}>
        <defs>
          {series.map((s, i) => (
            <linearGradient key={s.key} id={`${gradientId}-${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.18" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>

        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={width - pad.right} y1={y(max * t)} y2={y(max * t)}
              stroke="var(--grid)" strokeWidth="1" />
            <text x={pad.left - 8} y={y(max * t) + 3} textAnchor="end" {...AXIS}>{fmt(Math.round(max * t))}</text>
          </g>
        ))}

        {series.map((s, i) => {
          const line = data.map((row, index) => `${index ? 'L' : 'M'}${x(index)},${y(row[s.key] ?? 0)}`).join(' ');
          return (
            <g key={s.key}>
              {series.length === 1 && (
                <path d={`${line} L${x(data.length - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill={`url(#${gradientId}-${i})`} />
              )}
              <path d={line} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            </g>
          );
        })}

        {hover && (
          <g>
            <line x1={x(hover.index)} x2={x(hover.index)} y1={pad.top} y2={pad.top + plotH}
              stroke="var(--muted)" strokeWidth="1" />
            {series.map((s) => (
              <circle key={s.key} cx={x(hover.index)} cy={y(data[hover.index][s.key] ?? 0)} r="4.5"
                fill={s.color} stroke="var(--panel)" strokeWidth="2" />
            ))}
          </g>
        )}

        {data.map((row, index) => (
          index % Math.ceil(data.length / 7) === 0 ? (
            <text key={row[xKey]} x={x(index)} y={height - 6} textAnchor="middle" {...AXIS}>
              {formatX ? formatX(row[xKey]) : row[xKey]}
            </text>
          ) : null
        ))}
      </svg>

      {hover && (
        <Tooltip at={{ x: hover.px, y: hover.py }}>
          <div style={{ color: 'var(--muted)', marginBottom: 3 }}>
            {formatX ? formatX(data[hover.index][xKey]) : data[hover.index][xKey]}
          </div>
          {series.map((s) => (
            <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color }} />
              {s.label}: <b>{fmt(data[hover.index][s.key] ?? 0)}</b>
            </div>
          ))}
        </Tooltip>
      )}
      <Legend items={series.map((s) => ({ label: s.label, color: s.color }))} />
    </div>
  );
}

/* ──────────────────────── Columns (hour of day) ──────────────────────── */

export function Columns({ data, xKey, yKey, height = 170, color = SERIES[0], formatX, formatTip }) {
  const [hover, setHover] = useState(null);
  const pad = { top: 16, right: 8, bottom: 20, left: 38 };
  const width = 760;
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const max = niceMax(Math.max(1, ...data.map((row) => row[yKey] ?? 0)));
  const band = plotW / data.length;
  const barW = Math.min(24, band - 2);          // 2px surface gap between neighbours
  const peak = data.reduce((best, row) => ((row[yKey] ?? 0) > (best[yKey] ?? 0) ? row : best), data[0] ?? {});

  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img">
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={width - pad.right} y1={pad.top + plotH - t * plotH} y2={pad.top + plotH - t * plotH}
              stroke="var(--grid)" strokeWidth="1" />
            <text x={pad.left - 8} y={pad.top + plotH - t * plotH + 3} textAnchor="end" {...AXIS}>{fmt(Math.round(max * t))}</text>
          </g>
        ))}
        {data.map((row, index) => {
          const value = row[yKey] ?? 0;
          const barH = (value / max) * plotH;
          const bx = pad.left + index * band + (band - barW) / 2;
          return (
            <g key={row[xKey]} onMouseEnter={() => setHover(index)} onMouseLeave={() => setHover(null)}>
              <rect x={bx} y={pad.top} width={barW} height={plotH} fill="transparent" />
              {/* 4px rounded cap, square at the baseline */}
              <path d={barH < 5
                ? `M${bx},${pad.top + plotH} h${barW} v${-Math.max(barH, 1)} h${-barW} Z`
                : `M${bx},${pad.top + plotH} v${-(barH - 4)} q0,-4 4,-4 h${barW - 8} q4,0 4,4 v${barH - 4} Z`}
                fill={color} opacity={hover === null || hover === index ? 1 : 0.45} />
              {/* Only the peak is labelled: a number on every column goes unread. */}
              {row === peak && value > 0 && (
                <text x={bx + barW / 2} y={pad.top + plotH - barH - 6} textAnchor="middle"
                  style={{ fontSize: 10, fill: 'var(--txt)', fontWeight: 700 }}>{fmt(value)}</text>
              )}
            </g>
          );
        })}
        {data.map((row, index) => (
          index % Math.ceil(data.length / 12) === 0 ? (
            <text key={row[xKey]} x={pad.left + index * band + band / 2} y={height - 5} textAnchor="middle" {...AXIS}>
              {formatX ? formatX(row[xKey]) : row[xKey]}
            </text>
          ) : null
        ))}
      </svg>
      {hover !== null && (
        <Tooltip at={{ x: `${((pad.left + hover * band + band / 2) / width) * 100}%`, y: 10 }}>
          {formatTip ? formatTip(data[hover]) : `${data[hover][xKey]}: ${fmt(data[hover][yKey])}`}
        </Tooltip>
      )}
    </div>
  );
}

/* ──────────────────────── Horizontal bars (ranking) ──────────────────────── */

export function Bars({ data, labelKey, valueKey, color = SERIES[0], max: givenMax, empty = 'No data yet' }) {
  if (!data.length) return <div className="hint" style={{ padding: '14px 0' }}>{empty}</div>;
  const max = givenMax ?? niceMax(Math.max(1, ...data.map((row) => row[valueKey] ?? 0)));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
      {data.map((row) => (
        <div key={row[labelKey]}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5, gap: 10 }}>
            <span style={{ color: 'var(--txt)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row[labelKey]}</span>
            <b style={{ color: 'var(--txt)', flexShrink: 0 }}>{fmt(row[valueKey] ?? 0)}</b>
          </div>
          <div style={{ height: 8, background: 'var(--stat-bg)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${Math.max(((row[valueKey] ?? 0) / max) * 100, 1)}%`,
              background: color, borderRadius: '0 4px 4px 0',
            }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ──────────────────────────── Donut (share) ──────────────────────────── */

export function Donut({ slices, size = 150, centerLabel, centerValue }) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const radius = size / 2 - 10;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
      <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img"
          style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--stat-bg)" strokeWidth="14" />
          {total > 0 && slices.map((slice) => {
            const fraction = slice.value / total;
            // 2px of surface between neighbouring arcs, same as a bar gap.
            const dash = Math.max(fraction * circumference - 2, 0);
            const element = (
              <circle key={slice.label} cx={size / 2} cy={size / 2} r={radius} fill="none"
                stroke={slice.color} strokeWidth="14"
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-offset} />
            );
            offset += fraction * circumference;
            return element;
          })}
        </svg>
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
        }}>
          <b style={{ fontSize: 22, color: 'var(--txt)' }}>{centerValue ?? fmt(total)}</b>
          <span style={{ fontSize: 10, color: 'var(--muted)' }}>{centerLabel}</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 130 }}>
        {slices.map((slice) => (
          <span key={slice.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: slice.color, flexShrink: 0 }} />
            <span style={{ color: 'var(--muted)', flex: 1 }}>{slice.label}</span>
            <b style={{ color: 'var(--txt)' }}>{fmt(slice.value)}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ──────────────────────────── Stat tile ──────────────────────────── */

export function Stat({ icon, label, value, hint, tone = 'var(--accent)' }) {
  return (
    <div className="panel glass-panel" style={{ padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span style={{ color: tone, display: 'flex' }}>{icon}</span>
        <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</span>
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--txt)', lineHeight: 1.1 }}>{value}</div>
      {hint ? <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>{hint}</div> : null}
    </div>
  );
}
