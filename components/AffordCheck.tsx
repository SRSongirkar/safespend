'use client';

import { useEffect, useState } from 'react';
import type { AffordResult, AnalysisResult } from '@/lib/core/types';
import { analysisApi } from '@/lib/client/api';
import { addDaysISO, currencySymbol, formatDate, formatMoney, parseMoneyInput } from '@/lib/client/format';
import Icon from './Icon';

const VERDICT = {
  comfortable: { title: 'Yes, you can buy it', icon: 'check' },
  tight: { title: 'Yes, but money will be tight', icon: 'alert' },
  no: { title: 'Only if you use savings', icon: 'x_circle' },
} as const;

export default function AffordCheck({ a, onResult }: { a: AnalysisResult; onResult: (r: AffordResult | null) => void }) {
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(() => addDaysISO(a.now, 8));
  const [repeat, setRepeat] = useState<'once' | 'monthly'>('once');
  const [result, setResult] = useState<AffordResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // A new analysis (e.g. after a correction) makes an old verdict stale.
  useEffect(() => {
    setResult(null);
    onResult(null);
  }, [a, onResult]);

  const run = async (e?: React.FormEvent, override?: string) => {
    e?.preventDefault();
    const cents = parseMoneyInput(override ?? amount);
    if (!cents || cents <= 0) {
      setError('Enter a price, e.g. 15000');
      return;
    }
    if (!date || date < a.now) {
      setError(`Pick a date on or after ${formatDate(a.now)}`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await analysisApi.afford(cents, date, repeat);
      setResult(r);
      onResult(r);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const clear = () => {
    setResult(null);
    onResult(null);
  };

  const money = (c: number) => formatMoney(c, a.currency);
  const v = result ? VERDICT[result.verdict] : null;
  const title = result ? (result.verdict === 'no' && !result.coveredBySavings ? 'No, you can’t afford it now' : v!.title) : '';
  const sentence = result ? result.sentence : '';

  return (
    <section className="card" aria-labelledby="afford-title">
      <div className="card-header" style={{ marginBottom: 12 }}>
        <div>
          <h2 id="afford-title" className="card-title">
            Can I buy this?
          </h2>
          <p className="card-sub">Enter a price and a date. We check it against all your upcoming bills.</p>
        </div>
      </div>
      <form className="afford-form" onSubmit={run} noValidate>
        <div className="field">
          <label className="label" htmlFor="afford-amount">
            Price
          </label>
          <div className="input-affix">
            <span>{currencySymbol(a.currency)}</span>
            <input
              id="afford-amount"
              className="input"
              inputMode="decimal"
              placeholder="15000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-invalid={!!error && !parseMoneyInput(amount)}
              autoComplete="off"
            />
          </div>
        </div>
        <div className="field">
          <label className="label" htmlFor="afford-date">
            Pay on
          </label>
          <input id="afford-date" className="input" type="date" min={a.now} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field span-2">
          <span className="label" id="afford-repeat">
            How often
          </span>
          <div className="seg" role="group" aria-labelledby="afford-repeat" style={{ alignSelf: 'flex-start' }}>
            <button type="button" aria-pressed={repeat === 'once'} onClick={() => setRepeat('once')}>
              One time
            </button>
            <button type="button" aria-pressed={repeat === 'monthly'} onClick={() => setRepeat('monthly')}>
              Every month
            </button>
          </div>
        </div>
        <div className="span-2 quick-amounts" aria-label="Quick amounts">
          {(a.currency === 'INR' ? [7500, 15000, 50000] : [300, 600, 2000]).map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => {
                setAmount(String(q));
                void run(undefined, String(q));
              }}
            >
              Try {formatMoney(q * 100, a.currency)}
            </button>
          ))}
        </div>
        {error ? (
          <div className="span-2 error-text" role="alert">
            <Icon name="alert" size={14} /> {error}
          </div>
        ) : null}
        <div className="span-2 row">
          <button type="submit" className="btn btn-primary spacer" disabled={busy}>
            {busy ? <span className="spinner" /> : null}
            Check
          </button>
          {result ? (
            <button type="button" className="btn btn-ghost" onClick={clear}>
              Clear
            </button>
          ) : null}
        </div>
      </form>

      {result && v ? (
        <div className={`verdict verdict-${result.verdict}`} role="status" aria-live="polite">
          <div className="verdict-icon">
            <Icon name={v.icon} size={18} strokeWidth={2.6} />
          </div>
          <div>
            <div className="verdict-title">{title}</div>
            <p className="verdict-text">{sentence.charAt(0).toUpperCase() + sentence.slice(1)}</p>
            <div className="verdict-meta">
              <span>
                Lowest balance <strong>{money(result.lowest.amount)}</strong> on {formatDate(result.lowest.date)}
              </span>
              {result.firstBelowBuffer ? <span>Below minimum from {formatDate(result.firstBelowBuffer)}</span> : null}
              {result.verdict === 'no' ? <span>Savings {money(result.savingsBalance)}</span> : null}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
