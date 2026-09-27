import { addDays } from './dates';
import type { BalancePoint, Cents, ForecastDay, ForecastEvent, ISODate } from './types';

export interface ForecastInputEvent extends ForecastEvent {
  date: ISODate;
}

/**
 * Daily checking balance from asOf to `end`. Within a day outflows are applied first, then income (conservative),
 * so `low` is the balance after the day's outflows. The everyday estimate is applied daily from asOf + 1.
 */
export function buildForecast(start: Cents, asOf: ISODate, end: ISODate, events: ForecastInputEvent[], dailyEstimate: Cents): ForecastDay[] {
  const byDate = new Map<ISODate, ForecastInputEvent[]>();
  for (const e of events) {
    const d = e.date < asOf ? asOf : e.date;
    if (d > end) continue;
    const list = byDate.get(d) ?? [];
    list.push(e);
    byDate.set(d, list);
  }
  const days: ForecastDay[] = [];
  let balance = start;
  for (let d = asOf; d <= end; d = addDays(d, 1)) {
    const evs = (byDate.get(d) ?? []).map(({ date: _date, ...rest }) => rest);
    if (d > asOf && dailyEstimate > 0) evs.push({ itemId: 'everyday', label: 'Everyday spending (estimate)', amount: -dailyEstimate, estimate: true });
    let out = 0;
    let inc = 0;
    for (const e of evs) (e.amount < 0 ? (out += e.amount) : (inc += e.amount));
    const low = balance + out;
    balance = low + inc;
    days.push({ date: d, low, balance, events: evs });
  }
  return days;
}

/** Earliest day with the minimum `low`. */
export function lowestOf(days: ForecastDay[]): BalancePoint {
  let best: BalancePoint = { date: days[0]?.date ?? '', amount: days[0]?.low ?? 0 };
  for (const d of days) if (d.low < best.amount) best = { date: d.date, amount: d.low };
  return best;
}

export function firstBelow(days: ForecastDay[], threshold: Cents): ISODate | undefined {
  return days.find((d) => d.low < threshold)?.date;
}
