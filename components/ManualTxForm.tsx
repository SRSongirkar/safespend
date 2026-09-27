'use client';

import { useState } from 'react';
import type { Account } from '@/lib/core/types';
import { txApi } from '@/lib/client/api';
import { currencySymbol, parseMoneyInput, todayISO } from '@/lib/client/format';
import Icon from './Icon';
import { CATEGORY_LABELS } from './meta';

export default function ManualTxForm({ accounts, currency, onDone, onCancel }: { accounts: Account[]; currency: string; onDone: () => void; onCancel: () => void }) {
  const [accountId, setAccountId] = useState(accounts.find((a) => a.type === 'checking')?.id ?? accounts[0]?.id ?? '');
  const [date, setDate] = useState(todayISO());
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [direction, setDirection] = useState<'out' | 'in'>('out');
  const [category, setCategory] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cents = parseMoneyInput(amount);
    if (!accountId) return setError('Add an account first');
    if (!description.trim()) return setError('Write what it was for, e.g. “Vegetable market”');
    if (!cents) return setError('Enter an amount');
    setBusy(true);
    setError(null);
    try {
      await txApi.create({ accountId, date, description: description.trim(), amountCents: direction === 'out' ? -cents : cents, category: category || undefined });
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card stack" onSubmit={submit} noValidate aria-labelledby="manual-title">
      <div className="card-header" style={{ marginBottom: 0 }}>
        <div>
          <h2 id="manual-title" className="card-title">
            Add a cash payment
          </h2>
          <p className="card-sub">For spending that is not in any statement yet.</p>
        </div>
        <button type="button" className="btn btn-ghost btn-icon" aria-label="Close" onClick={onCancel}>
          <Icon name="close" size={18} />
        </button>
      </div>
      <div className="form-grid">
        <div className="field">
          <label className="label" htmlFor="mt-desc">
            Description
          </label>
          <input id="mt-desc" className="input" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} placeholder="Vegetable market" />
        </div>
        <div className="field">
          <label className="label" htmlFor="mt-amount">
            Amount
          </label>
          <div className="row">
            <div className="input-affix spacer">
              <span>{currencySymbol(currency)}</span>
              <input id="mt-amount" className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="500" />
            </div>
            <div className="seg" role="group" aria-label="Direction">
              <button type="button" aria-pressed={direction === 'out'} onClick={() => setDirection('out')}>
                Out
              </button>
              <button type="button" aria-pressed={direction === 'in'} onClick={() => setDirection('in')}>
                In
              </button>
            </div>
          </div>
        </div>
        <div className="field">
          <label className="label" htmlFor="mt-date">
            Date
          </label>
          <input id="mt-date" className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field">
          <label className="label" htmlFor="mt-account">
            Account
          </label>
          <select id="mt-account" className="select" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field span-2">
          <label className="label" htmlFor="mt-cat">
            Category <span className="faint">(optional)</span>
          </label>
          <select id="mt-cat" className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Choose for me</option>
            {Object.entries(CATEGORY_LABELS)
              .filter(([k]) => k !== 'transfer' && k !== 'card payment')
              .map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
          </select>
        </div>
      </div>
      {error ? (
        <div className="error-text" role="alert">
          <Icon name="alert" size={14} /> {error}
        </div>
      ) : null}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? <span className="spinner" /> : null}
          Add payment
        </button>
      </div>
    </form>
  );
}
