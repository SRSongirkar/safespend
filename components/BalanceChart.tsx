'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ForecastDay } from '@/lib/core/types';
import { formatDate, formatDateDay, formatMoney, formatMoneyCompact } from '@/lib/client/format';

interface Props {
  days: ForecastDay[];
  overlay?: ForecastDay[] | null;
  bufferCents: number;
  currency: string;
  overlayLabel?: string;
}

function niceStep(raw: number): number {
  if (raw <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

function lowest(days: ForecastDay[]) {
  let idx = 0;
  days.forEach((d, i) => {
    if (d.low < days[idx].low) idx = i;
  });
  return idx;
}

/** Projected daily checking balance: 2px line + 10% wash, dashed buffer threshold, solid zero line, crosshair tooltip. */
export default function BalanceChart({ days, overlay, bufferCents, currency, overlayLabel = 'With this purchase' }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [active, setActive] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const summaryId = useId();

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setWidth(Math.max(280, Math.round(entries[0].contentRect.width))));
    ro.observe(el);
    setWidth(Math.max(280, Math.round(el.getBoundingClientRect().width)));
    return () => ro.disconnect();
  }, []);

  const height = width < 560 ? 220 : 260;
  const m = { l: 50, r: 14, t: 20, b: 28 };
  const base = overlay && overlay.length > days.length ? overlay : days;
  const n = base.length;

  const geo = useMemo(() => {
    const values: number[] = [0, bufferCents];
    for (const d of days) values.push(d.low, d.balance);
    for (const d of overlay ?? []) values.push(d.low, d.balance);
    const vMin = Math.min(...values);
    const vMax = Math.max(...values);
    const step = niceStep((vMax - vMin || 100) / 4);
    const lo = Math.floor(vMin / step) * step;
    const hi = Math.ceil(vMax / step) * step || step;
    const ticks: number[] = [];
    for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v));
    const plotW = width - m.l - m.r;
    const plotH = height - m.t - m.b;
    const x = (i: number) => m.l + (n <= 1 ? 0 : (i * plotW) / (n - 1));
    const y = (v: number) => m.t + ((hi - v) / (hi - lo || 1)) * plotH;
    const path = (ds: ForecastDay[]) =>
      ds
        .map((d, i) => {
          const X = x(i).toFixed(1);
          let seg = `${i === 0 ? 'M' : 'L'}${X},${y(d.low).toFixed(1)}`;
          if (d.balance !== d.low) seg += `L${X},${y(d.balance).toFixed(1)}`;
          return seg;
        })
        .join('');
    const xTickStep = Math.max(1, Math.ceil((n - 1) / (width < 560 ? 4 : 6)));
    const xTicks: number[] = [];
    for (let i = 0; i < n; i += xTickStep) xTicks.push(i);
    if (n - 1 - xTicks[xTicks.length - 1] >= xTickStep * 0.6) xTicks.push(n - 1);
    return { lo, hi, ticks, x, y, path, xTicks, bottom: m.t + plotH };
  }, [days, overlay, bufferCents, width, height, n, m.l, m.r, m.t, m.b]);

  if (days.length < 2) return <p className="muted">Not enough data to draw a forecast yet.</p>;

  const { x, y, ticks, xTicks, bottom } = geo;
  const mainPath = geo.path(days);
  const areaPath = `${mainPath}L${x(days.length - 1)},${bottom}L${x(0)},${bottom}Z`;
  const lowIdx = lowest(days);
  const overlayLowIdx = overlay ? lowest(overlay) : -1;
  const money = (c: number) => formatMoney(c, currency);

  const bigEvents = days
    .map((d, i) => ({ i, d, out: d.events.filter((e) => !e.estimate && e.amount <= -10000) }))
    .filter((e) => e.out.length > 0 && e.i !== lowIdx);

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * width;
    const i = Math.round(((px - m.l) / (width - m.l - m.r)) * (n - 1));
    setActive(Math.max(0, Math.min(n - 1, i)));
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      setActive((a) => {
        const cur = a ?? lowIdx;
        return Math.max(0, Math.min(n - 1, cur + (e.key === 'ArrowRight' ? 1 : -1)));
      });
    } else if (e.key === 'Home') setActive(0);
    else if (e.key === 'End') setActive(n - 1);
    else if (e.key === 'Escape') setActive(null);
  };

  const labelFor = (i: number, value: number, text: string, prefer: 'above' | 'below') => {
    const px = x(i);
    const anchor = px > width * 0.72 ? 'end' : px < width * 0.28 ? 'start' : 'middle';
    const dx = anchor === 'end' ? -8 : anchor === 'start' ? 8 : 0;
    const py = y(value);
    const roomBelow = bottom - py;
    const below = prefer === 'below' ? roomBelow > 22 : roomBelow > 22 && py - m.t < 22;
    return (
      <text x={px + dx} y={below ? py + 18 : py - 10} textAnchor={anchor} className="chart-label-strong">
        {text}
      </text>
    );
  };

  const activeDay = active !== null ? base[active] : null;
  const mainDay = active !== null ? days[active] : undefined;
  const overlayDay = active !== null ? overlay?.[active] : undefined;
  const ttLeft = active !== null ? x(active) : 0;
  const flip = ttLeft > width * 0.55;

  return (
    <div>
      <div ref={wrapRef} className="chart">
        <p id={summaryId} className="sr-only">
          Projected checking balance from {formatDate(days[0].date)} to {formatDate(days[days.length - 1].date)}. Lowest point {money(days[lowIdx].low)} on{' '}
          {formatDate(days[lowIdx].date)}. Buffer {money(bufferCents)}. Use the arrow keys to move between days.
        </p>
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="group"
          aria-label="Projected checking balance chart"
          aria-describedby={summaryId}
          tabIndex={0}
          onPointerMove={onMove}
          onPointerLeave={() => setActive(null)}
          onKeyDown={onKey}
          onBlur={() => setActive(null)}
          onFocus={() => setActive((a) => a ?? lowIdx)}
        >
          {/* grid + y axis */}
          <g className="chart-axis">
            {ticks.map((t) => (
              <g key={t}>
                <line x1={m.l} x2={width - m.r} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--axis)' : 'var(--grid)'} strokeWidth={1} />
                <text x={m.l - 8} y={y(t) + 4} textAnchor="end">
                  {formatMoneyCompact(t, currency)}
                </text>
              </g>
            ))}
            {xTicks.map((i) => (
              <text key={i} x={x(i)} y={height - 8} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}>
                {formatDate(base[i].date)}
              </text>
            ))}
          </g>

          {/* buffer threshold */}
          <line x1={m.l} x2={width - m.r} y1={y(bufferCents)} y2={y(bufferCents)} stroke="var(--ink-3)" strokeWidth={1} strokeDasharray="4 4" />
          <text x={m.l + 6} y={y(bufferCents) - 6} textAnchor="start" className="chart-label">
            Buffer {money(bufferCents)}
          </text>

          {/* series */}
          <path d={areaPath} fill="var(--s1)" opacity={0.1} />
          <path d={mainPath} fill="none" stroke="var(--s1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {overlay ? <path d={geo.path(overlay)} fill="none" stroke="var(--s2)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" /> : null}

          {/* event markers (big outflows) */}
          {bigEvents.map(({ i, d }) => (
            <circle key={d.date} cx={x(i)} cy={y(d.low)} r={3.5} fill="var(--s1)" stroke="var(--surface)" strokeWidth={2} />
          ))}

          {/* lowest points + selective direct labels */}
          <circle cx={x(lowIdx)} cy={y(days[lowIdx].low)} r={5} fill="var(--s1)" stroke="var(--surface)" strokeWidth={2} />
          {labelFor(lowIdx, days[lowIdx].low, `Lowest ${money(days[lowIdx].low)} · ${formatDate(days[lowIdx].date)}`, overlay ? 'above' : 'below')}
          {overlay && overlayLowIdx >= 0 ? (
            <>
              <circle cx={x(overlayLowIdx)} cy={y(overlay[overlayLowIdx].low)} r={5} fill="var(--s2)" stroke="var(--surface)" strokeWidth={2} />
              {labelFor(overlayLowIdx, overlay[overlayLowIdx].low, `${money(overlay[overlayLowIdx].low)} · ${formatDate(overlay[overlayLowIdx].date)}`, 'below')}
            </>
          ) : null}

          {/* crosshair */}
          {active !== null ? (
            <g pointerEvents="none">
              <line x1={x(active)} x2={x(active)} y1={m.t - 6} y2={bottom} stroke="var(--ink-3)" strokeWidth={1} opacity={0.7} />
              {mainDay ? <circle cx={x(active)} cy={y(mainDay.balance)} r={4.5} fill="var(--s1)" stroke="var(--surface)" strokeWidth={2} /> : null}
              {overlayDay ? <circle cx={x(active)} cy={y(overlayDay.balance)} r={4.5} fill="var(--s2)" stroke="var(--surface)" strokeWidth={2} /> : null}
            </g>
          ) : null}
          {/* full-height hit area so the pointer never has to land on the 2px line */}
          <rect x={m.l} y={m.t} width={width - m.l - m.r} height={bottom - m.t} fill="transparent" />
        </svg>

        {activeDay && active !== null ? (
          <div className="chart-tooltip" style={{ left: flip ? ttLeft - 14 : ttLeft + 14, top: 8, transform: flip ? 'translateX(-100%)' : undefined }}>
            <div className="tt-date">{formatDateDay(activeDay.date)}</div>
            {mainDay ? (
              <div className="tt-row">
                <span className="line-key" style={{ background: 'var(--s1)' }} />
                <strong>{money(mainDay.balance)}</strong>
                <span>{overlay ? 'Projected' : 'End of day'}</span>
              </div>
            ) : null}
            {mainDay && mainDay.low !== mainDay.balance ? <div className="tiny faint">Lowest that day {money(mainDay.low)}, before income lands</div> : null}
            {overlayDay ? (
              <div className="tt-row">
                <span className="line-key" style={{ background: 'var(--s2)' }} />
                <strong>{money(overlayDay.balance)}</strong>
                <span>{overlayLabel}</span>
              </div>
            ) : null}
            {(() => {
              const evs = [...(overlayDay ?? mainDay)!.events].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
              if (evs.length === 0) return null;
              return (
                <div className="tt-events">
                  {evs.slice(0, 5).map((e, k) => (
                    <div key={k} className="tt-event">
                      <span>{e.label}</span>
                      <b>{formatMoney(e.amount, currency, { signed: true })}</b>
                    </div>
                  ))}
                  {evs.length > 5 ? <div className="tiny faint">+{evs.length - 5} more</div> : null}
                </div>
              );
            })()}
          </div>
        ) : null}
      </div>

      <div className="chart-foot">
        {overlay ? (
          <ul className="legend" style={{ margin: 0 }}>
            <li>
              <span className="line-key" style={{ background: 'var(--s1)' }} /> Current forecast
            </li>
            <li>
              <span className="line-key" style={{ background: 'var(--s2)' }} /> {overlayLabel}
            </li>
            <li>
              <span className="line-key dashed" /> Your buffer
            </li>
          </ul>
        ) : (
          <span className="tiny faint">Dots mark bills of $100+. Hover or use arrow keys for each day.</span>
        )}
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowTable((s) => !s)} aria-expanded={showTable}>
          {showTable ? 'Hide table' : 'Show as table'}
        </button>
      </div>

      {showTable ? (
        <div className="table-wrap" style={{ maxHeight: 320, overflowY: 'auto', marginTop: 8, border: '1px solid var(--border)', borderRadius: 10 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th className="right">Lowest</th>
                <th className="right">End of day</th>
                {overlay ? <th className="right">{overlayLabel}</th> : null}
                <th>What happens</th>
              </tr>
            </thead>
            <tbody>
              {base.map((d, i) => {
                const main = days[i];
                const evs = (main ?? d).events.filter((e) => !e.estimate);
                return (
                  <tr key={d.date}>
                    <td className="nowrap">{formatDateDay(d.date)}</td>
                    <td className="num">{main ? money(main.low) : '—'}</td>
                    <td className="num">{main ? money(main.balance) : '—'}</td>
                    {overlay ? <td className="num">{overlay[i] ? money(overlay[i].balance) : '—'}</td> : null}
                    <td className="small muted">{evs.map((e) => `${e.label} ${formatMoney(e.amount, currency, { signed: true })}`).join(' · ') || 'Everyday spending only'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
