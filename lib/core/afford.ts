import type { ForecastModel } from './analyze';
import { formatShortDate, nextLastWorkingDay, nextMonthlyDate, parts } from './dates';
import { buildForecast, firstBelow, lowestOf, type ForecastInputEvent } from './forecast';
import { formatCents } from './money';
import type { AffordResult, Cents, ISODate } from './types';

export interface AffordRequest {
  amountCents: Cents;
  date: ISODate;
  repeat: 'once' | 'monthly';
}

/**
 * Re-run the checking forecast with the extra spend. comfortable: new lowest ≥ buffer · tight: 0 ≤ lowest < buffer ·
 * no: lowest < 0 (and say whether savings covers the gap).
 */
export function affordCheck(model: ForecastModel, req: AffordRequest): AffordResult {
  const end = req.date >= model.defaultEnd ? nextLastWorkingDay(req.date) : model.defaultEnd;
  const extra: ForecastInputEvent[] = [];
  const label = req.repeat === 'monthly' ? 'This purchase (monthly)' : 'This purchase';
  let d = req.date < model.asOf ? model.asOf : req.date;
  extra.push({ date: d, itemId: 'afford', label, amount: -req.amountCents });
  if (req.repeat === 'monthly') {
    const day = parts(req.date).d;
    for (let i = 0; i < 24; i++) {
      d = nextMonthlyDate(d, day);
      if (d > end) break;
      extra.push({ date: d, itemId: 'afford', label, amount: -req.amountCents });
    }
  }

  const forecast = buildForecast(model.start, model.asOf, end, [...model.eventsUntil(end), ...extra], model.checkingDaily);
  const lowest = lowestOf(forecast);
  const buffer = model.bufferCents;
  const verdict = lowest.amount >= buffer ? 'comfortable' : lowest.amount >= 0 ? 'tight' : 'no';
  const coveredBySavings = verdict === 'no' && model.savingsBalance + lowest.amount >= 0;
  const firstBelowBuffer = firstBelow(forecast, buffer);
  const firstBelowZero = firstBelow(forecast, 0);
  const money = (c: Cents) => formatCents(c, model.currency);
  const on = formatShortDate(lowest.date);

  let sentence: string;
  if (verdict === 'comfortable') {
    sentence = `Comfortable: your lowest point would be ${money(lowest.amount)} on ${on}, still above your ${money(buffer)} buffer.`;
  } else if (verdict === 'tight') {
    sentence = `Tight: on ${on} you'd have ${money(lowest.amount)}, below your ${money(buffer)} buffer.`;
    if (firstBelowBuffer && firstBelowBuffer !== lowest.date) sentence += ` You'd drop below it from ${formatShortDate(firstBelowBuffer)}.`;
  } else if (coveredBySavings) {
    sentence = `Not without savings: you'd be ${money(-lowest.amount)} overdrawn on ${on}. Moving ${money(-lowest.amount + buffer)} from savings (${money(
      model.savingsBalance,
    )}) keeps your buffer.`;
  } else {
    sentence = `No: you'd be ${money(-lowest.amount)} overdrawn on ${on}, and your savings (${money(model.savingsBalance)}) won't cover it.`;
  }
  if (verdict === 'no' && firstBelowZero && firstBelowZero !== lowest.date) sentence += ` You'd first go below zero on ${formatShortDate(firstBelowZero)}.`;

  return {
    verdict,
    amountCents: req.amountCents,
    date: req.date,
    repeat: req.repeat,
    lowest,
    firstBelowBuffer,
    firstBelowZero,
    bufferCents: buffer,
    savingsBalance: model.savingsBalance,
    coveredBySavings,
    sentence,
    forecast,
  };
}
