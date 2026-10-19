/* Hand-built SVG charts rendered at real pixel width (crisp labels at any size). */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useWidth } from '@/hooks/data';
import { MONTHS, WEEKDAYS, fmtCompact, fmtHour, fmtHours, fmtLongDur, fmtN, pct, clamp } from '@/lib/format';
import { H, type Evolution } from '@/lib/history';

export const SERIES = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s6)', 'var(--s7)', 'var(--s8)'];
const OTHER = 'var(--fill-3)';
export const heatColor = (v: number) => (v <= 0 ? 'var(--heat-0)' : `color-mix(in srgb, var(--accent) ${Math.round((0.18 + 0.82 * Math.pow(v, 0.75)) * 100)}%, transparent)`);
/** Tooltip text: lines separated by "\n"; the first line is bold. */
const tip = (...lines: string[]) => lines.join('\n');

function niceStep(v: number) { const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; }
function niceScale(v: number, n = 4) {
  if (v <= 0) return { max: 1, ticks: [0, 1] };
  const step = niceStep(v / n); const max = Math.ceil(v / step - 1e-9) * step; const ticks: number[] = [];
  for (let t = 0; t <= max + step / 2; t += step) ticks.push(t);
  return { max, ticks };
}

function Sized({ minHeight, children }: { minHeight: number; children: (w: number) => ReactNode }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  return <div ref={ref} style={{ minHeight, width: '100%' }}>{w > 0 && children(w)}</div>;
}

export interface BarItem { label: string; short?: string; value: number; tip?: string }
export function BarChart({ items, height = 200, fmt = fmtCompact, unit = '', labelEvery = 0 }: { items: BarItem[]; height?: number; fmt?: (v: number) => string; unit?: string; labelEvery?: number }) {
  if (!items.length) return <p className="muted">No listening in this period.</p>;
  return (
    <Sized minHeight={height}>{(W) => {
      const Hh = height, padL = 44, padB = 24, padT = 10, padR = 4;
      const sc = niceScale(Math.max(...items.map((d) => d.value))); const max = sc.max;
      const n = items.length, cw = (W - padL - padR) / n;
      const bw = Math.max(1.5, Math.min(36, cw - Math.max(2, cw * 0.3)));
      const y = (v: number) => padT + (Hh - padT - padB) * (1 - v / max);
      const every = labelEvery || Math.ceil(n / Math.max(3, Math.floor(W / 78)));
      return (
        <svg className="chart" width={W} height={Hh} viewBox={`0 0 ${W} ${Hh}`} role="img" aria-label="Bar chart">
          <defs><linearGradient id="barg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--accent-2)" /><stop offset="1" stopColor="var(--accent)" /></linearGradient></defs>
          <g className="grid">{sc.ticks.map((v, k) => <g key={k}><line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} /><text x={padL - 8} y={y(v) + 4} textAnchor="end">{fmt(v)}{k === sc.ticks.length - 1 ? unit : ''}</text></g>)}</g>
          <line className="base" x1={padL} x2={W - padR} y1={Hh - padB} y2={Hh - padB} />
          {items.map((d, i) => {
            const x = padL + i * cw + (cw - bw) / 2, h = Math.max(0, Hh - padB - y(d.value)), r = Math.min(5, bw / 2, h);
            return (
              <g key={i}>
                {h > 0 && <path d={`M${x},${Hh - padB} V${Hh - padB - h + r} Q${x},${Hh - padB - h} ${x + r},${Hh - padB - h} H${x + bw - r} Q${x + bw},${Hh - padB - h} ${x + bw},${Hh - padB - h + r} V${Hh - padB} Z`} fill="url(#barg)" />}
                <rect x={padL + i * cw} y={padT} width={cw} height={Hh - padT - padB} fill="transparent" data-tip={d.tip || tip(d.label, fmt(d.value) + unit)} />
                {i % every === 0 && <text x={padL + i * cw + cw / 2} y={Hh - 6} textAnchor="middle">{d.short ?? d.label}</text>}
              </g>
            );
          })}
        </svg>
      );
    }}</Sized>
  );
}

export function ClockChart({ hours, size = 300, mono = false }: { hours: number[]; size?: number; mono?: boolean }) {
  const max = Math.max(...hours) || 1, c = 150, r0 = 46, r1 = 132, peak = hours.indexOf(Math.max(...hours));
  const p = (r: number, a: number) => `${(c + r * Math.cos(a)).toFixed(2)},${(c + r * Math.sin(a)).toFixed(2)}`;
  const col = mono ? 'rgba(255,255,255,.8)' : 'var(--accent)', peakCol = mono ? '#fff' : 'var(--accent-2)';
  return (
    <div style={{ maxWidth: size, margin: 'auto' }}>
      <svg className="chart" viewBox="-16 -16 332 332" role="img" aria-label="Listening by hour of day" style={{ width: '100%', height: 'auto' }}>
        {hours.map((v, h) => {
          const a0 = ((h / 24) * 360 - 90 + 1.6) * (Math.PI / 180), a1 = (((h + 1) / 24) * 360 - 90 - 1.6) * (Math.PI / 180);
          const rr = r0 + (r1 - r0) * Math.sqrt(v / max);
          return (
            <g key={h}>
              <path d={`M${p(r0, a0)} L${p(r1, a0)} A${r1},${r1} 0 0 1 ${p(r1, a1)} L${p(r0, a1)} A${r0},${r0} 0 0 0 ${p(r0, a0)} Z`} fill={mono ? 'rgba(255,255,255,.08)' : 'var(--fill)'} />
              <path d={`M${p(r0, a0)} L${p(rr, a0)} A${rr},${rr} 0 0 1 ${p(rr, a1)} L${p(r0, a1)} A${r0},${r0} 0 0 0 ${p(r0, a0)} Z`} fill={h === peak ? peakCol : col} opacity={h === peak ? 1 : 0.5 + 0.5 * (v / max)} />
              <path d={`M${p(r0, a0)} L${p(r1, a0)} A${r1},${r1} 0 0 1 ${p(r1, a1)} L${p(r0, a1)} Z`} fill="transparent" data-tip={tip(`${fmtHour(h)} – ${fmtHour((h + 1) % 24)}`, `${fmtHours(v)} hours`)} />
            </g>
          );
        })}
        {[0, 6, 12, 18].map((h) => { const a = ((h / 24) * 360 - 90) * (Math.PI / 180); return <text key={h} x={c + (r1 + 13) * Math.cos(a)} y={c + (r1 + 13) * Math.sin(a) + 4} textAnchor="middle" style={mono ? { fill: 'rgba(255,255,255,.8)' } : undefined}>{fmtHour(h)}</text>; })}
        <text x={c} y={c - 4} textAnchor="middle" style={{ fontSize: 12, ...(mono ? { fill: 'rgba(255,255,255,.8)' } : {}) }}>Peak</text>
        <text x={c} y={c + 15} textAnchor="middle" style={{ fontSize: 16, fontWeight: 750, fill: mono ? '#fff' : 'var(--label)' }}>{fmtHour(peak)}</text>
      </svg>
    </div>
  );
}

export function DowHourHeat({ m }: { m: number[][] }) {
  let max = 0; m.forEach((r) => r.forEach((v) => (max = Math.max(max, v))));
  return (
    <div className="heat" style={{ gridTemplateColumns: '34px repeat(24, minmax(0,1fr))' }}>
      {m.map((row, d) => [
        <div key={'l' + d} style={{ fontSize: 11, color: 'var(--label-2)', alignSelf: 'center' }}>{WEEKDAYS[d]}</div>,
        ...row.map((v, h) => <div key={d + '-' + h} className="heat-cell" style={{ background: heatColor(max ? v / max : 0) }} data-tip={tip(`${WEEKDAYS[d]} · ${fmtHour(h)}`, `${fmtHours(v)} hours`)} />),
      ])}
      <div />
      {Array.from({ length: 24 }, (_, h) => <div key={'h' + h} style={{ fontSize: 10, color: 'var(--label-3)', textAlign: 'center', whiteSpace: 'nowrap' }}>{h % 6 === 0 ? fmtHour(h) : ''}</div>)}
    </div>
  );
}

export function CalendarHeat({ daily, a, b }: { daily: Map<number, number>; a: number; b: number }) {
  return (
    <Sized minHeight={150}>{(width) => {
      const start = new Date(a * 1000); const s0 = new Date(start.getFullYear(), start.getMonth(), start.getDate() - ((start.getDay() + 6) % 7));
      const end = new Date(Math.min(b, (H.last || b) + 86400) * 1000);
      const cells: { d: Date; v: number; out: boolean }[] = []; let max = 0;
      for (let d = new Date(s0); d < end; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
        const v = daily.get(Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000)) || 0; max = Math.max(max, v);
        cells.push({ d, v, out: d < start });
      }
      const weeks = Math.ceil(cells.length / 7), gap = 3, cs = clamp(Math.floor((width - 30) / weeks - gap), 9, 17);
      const W = 30 + weeks * (cs + gap), Hh = 18 + 7 * (cs + gap);
      let lastM = -1;
      return (
        <div className="scroll-x">
          <svg className="chart" width={W} height={Hh} viewBox={`0 0 ${W} ${Hh}`} role="img" aria-label="Daily listening calendar">
            {cells.map((c, i) => {
              const w = Math.floor(i / 7), dd = i % 7, x = 30 + w * (cs + gap), y = 18 + dd * (cs + gap);
              const label = dd === 0 && c.d.getMonth() !== lastM && c.d.getDate() <= 7 ? (lastM = c.d.getMonth(), MONTHS[c.d.getMonth()]) : null;
              return (
                <g key={i}>
                  {label && <text x={x} y={11}>{label}</text>}
                  {!c.out && <rect x={x} y={y} width={cs} height={cs} rx={3.5} fill={heatColor(max ? c.v / max : 0)} data-tip={tip(c.d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }), c.v ? fmtLongDur(c.v) : 'No listening')} />}
                </g>
              );
            })}
            {[0, 2, 4].map((d) => <text key={d} x={0} y={18 + d * (cs + gap) + cs - 2}>{WEEKDAYS[d]}</text>)}
          </svg>
          <div className="scale">Less {[0, 0.25, 0.5, 0.75, 1].map((v) => <i key={v} style={{ background: heatColor(v) }} />)} More</div>
        </div>
      );
    }}</Sized>
  );
}

export function StackedArea({ ev, height = 280, share = false }: { ev: Evolution | null; height?: number; share?: boolean }) {
  if (!ev || ev.buckets.length < 2) return <p className="muted">Not enough time in this period to show a trend. Pick a longer period.</p>;
  const layers = [...ev.series.map((s, i) => ({ name: s.name, values: s.values, color: SERIES[i] })), { name: 'Everyone else', values: ev.other, color: OTHER }];
  return (
    <>
      <Sized minHeight={height}>{(W) => {
        const Hh = height, padL = 44, padB = 24, padT = 10, padR = 6, n = ev.buckets.length, tot = ev.totals;
        const val = (vals: number[], k: number) => (share ? (tot[k] ? vals[k] / tot[k] : 0) : vals[k] / 3600000);
        const sc = share ? { max: 1, ticks: [0, 0.25, 0.5, 0.75, 1] } : niceScale(Math.max(...tot.map((t) => t / 3600000)));
        const x = (k: number) => padL + (k / (n - 1)) * (W - padL - padR);
        const y = (v: number) => padT + (Hh - padT - padB) * (1 - v / sc.max);
        const base = new Array(n).fill(0);
        const paths = layers.map((l) => {
          const top = base.map((b, k) => b + val(l.values, k));
          let d = `M${x(0)},${y(top[0])}`;
          for (let k = 1; k < n; k++) { const xm = (x(k - 1) + x(k)) / 2; d += ` C${xm},${y(top[k - 1])} ${xm},${y(top[k])} ${x(k)},${y(top[k])}`; }
          d += ` L${x(n - 1)},${y(base[n - 1])}`;
          for (let k = n - 2; k >= 0; k--) { const xm = (x(k + 1) + x(k)) / 2; d += ` C${xm},${y(base[k + 1])} ${xm},${y(base[k])} ${x(k)},${y(base[k])}`; }
          for (let k = 0; k < n; k++) base[k] = top[k];
          return <path key={l.name} d={d + ' Z'} fill={l.color} stroke="var(--bg)" strokeOpacity={0.5} strokeWidth={1} opacity={0.92} />;
        });
        const every = Math.ceil(n / Math.max(3, Math.floor(W / 95))); const cw = (W - padL - padR) / (n - 1);
        return (
          <svg className="chart" width={W} height={Hh} viewBox={`0 0 ${W} ${Hh}`} role="img" aria-label="Top artists over time">
            <g className="grid">{sc.ticks.map((v, k) => <g key={k}><line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} /><text x={padL - 8} y={y(v) + 4} textAnchor="end">{share ? pct(v) : fmtN(v) + (k === sc.ticks.length - 1 ? ' h' : '')}</text></g>)}</g>
            {paths}
            {ev.buckets.map((b, k) => {
              const rows = layers.map((l) => ({ n: l.name, v: l.values[k] })).filter((r) => r.v > 0).sort((p, q) => q.v - p.v).slice(0, 6);
              const lab = n <= 14 ? MONTHS[b.date.getMonth()] : b.date.getMonth() === 0 ? String(b.date.getFullYear()) : `${MONTHS[b.date.getMonth()]} ’${String(b.date.getFullYear()).slice(2)}`;
              return (
                <g key={k}>
                  {k % every === 0 && <text x={x(k)} y={Hh - 6} textAnchor="middle">{lab}</text>}
                  <rect x={x(k) - cw / 2} y={padT} width={cw} height={Hh - padT - padB} fill="transparent" data-tip={tip(b.date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }), ...rows.map((r) => `${r.n} · ${fmtHours(r.v)} h`))} />
                </g>
              );
            })}
          </svg>
        );
      }}</Sized>
      <div className="legend">{layers.map((l) => <span key={l.name}><i style={{ background: l.color }} />{l.name}</span>)}</div>
    </>
  );
}

export function HBars({ rows, fmt = fmtN, color }: { rows: { label: ReactNode; value: number; color?: string }[]; fmt?: (v: number) => string; color?: string }) {
  const max = Math.max(...rows.map((r) => r.value), 1e-9);
  return (
    <div className="hbars">
      {rows.map((r, i) => (
        <div key={i}>
          <div className="hbar-top"><span>{r.label}</span><span>{fmt(r.value)}</span></div>
          <div className="progress"><i style={{ width: `${(r.value / max) * 100}%`, background: r.color || color }} /></div>
        </div>
      ))}
    </div>
  );
}

/** One global tooltip for every element with data-tip. */
export function Tooltip() {
  const ref = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<string[] | null>(null);
  useEffect(() => {
    let cur: Element | null = null;
    const move = (e: PointerEvent) => {
      const el = ref.current; if (!el) return;
      const t = (e.target as Element)?.closest?.('[data-tip]');
      if (!t) { if (cur) { cur = null; setLines(null); } return; }
      if (t !== cur) { cur = t; setLines(t.getAttribute('data-tip')!.split('\n')); }
      el.style.left = clamp(e.clientX, 90, window.innerWidth - 90) + 'px'; el.style.top = e.clientY + 'px';
    };
    const hide = () => { cur = null; setLines(null); };
    document.addEventListener('pointermove', move, { passive: true });
    document.addEventListener('pointerdown', move, { passive: true });
    window.addEventListener('scroll', hide, { passive: true, capture: true });
    return () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerdown', move); window.removeEventListener('scroll', hide, { capture: true }); };
  }, []);
  return <div ref={ref} className={`chart-tip ${lines ? 'on' : ''}`} role="tooltip">{lines?.map((l, i) => (i === 0 ? <b key={i}>{l}</b> : <div key={i}>{l}</div>))}</div>;
}
