'use client';

import { useState } from 'react';
import type { Account, AccountType } from '@/lib/core/types';
import type { AccountInput } from '@/lib/client/api';
import { currencySymbol } from '@/lib/client/format';
import Icon from './Icon';

export default function AccountForm({
  account,
  accounts,
  currency,
  onSave,
  onCancel,
  compact = false,
  defaultType = 'checking',
}: {
  account?: Account;
  accounts: Account[];
  currency: string;
  onSave: (input: AccountInput) => Promise<void>;
  onCancel: () => void;
  compact?: boolean;
  defaultType?: AccountType;
}) {
  const [name, setName] = useState(account?.name ?? '');
  const [type, setType] = useState<AccountType>(account?.type ?? defaultType);
  const [closeDay, setCloseDay] = useState(account?.statementCloseDay ? String(account.statementCloseDay) : '');
  const [dueDay, setDueDay] = useState(account?.dueDay ? String(account.dueDay) : '');
  const [autopay, setAutopay] = useState(account?.autopayFromId ?? accounts.find((a) => a.type === 'checking')?.id ?? '');
  const [opening, setOpening] = useState(account?.openingBalanceCents !== undefined ? (account.openingBalanceCents / 100).toFixed(2) : '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const banks = accounts.filter((a) => a.type !== 'card' && a.id !== account?.id);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Give the account a name');
    const day = (s: string) => (s === '' ? null : Number(s));
    const cd = day(closeDay);
    const dd = day(dueDay);
    if (type === 'card' && ((cd !== null && (!Number.isInteger(cd) || cd < 1 || cd > 31)) || (dd !== null && (!Number.isInteger(dd) || dd < 1 || dd > 31)))) {
      return setError('Days must be between 1 and 31');
    }
    let openingCents: number | null = null;
    if (opening.trim() !== '') {
      const v = Number(opening.replace(/[,\s$]/g, ''));
      if (!Number.isFinite(v)) return setError('Starting balance must be a number');
      openingCents = Math.round(v * 100);
    }
    const input: AccountInput = { name: name.trim(), openingBalanceCents: openingCents };
    if (!account) input.type = type;
    if (type === 'card') Object.assign(input, { statementCloseDay: cd, dueDay: dd, autopayFromId: autopay || null });
    setBusy(true);
    setError(null);
    try {
      await onSave(input);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const id = account?.id ?? 'new';
  return (
    <form className="stack" onSubmit={submit} noValidate>
      <div className="form-grid">
        <div className={`field ${account ? 'span-2' : ''}`}>
          <label className="label" htmlFor={`acct-name-${id}`}>
            Account name
          </label>
          <input id={`acct-name-${id}`} className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Salary Account" autoFocus={!compact} />
        </div>
        {!account ? (
          <div className="field">
            <label className="label" htmlFor={`acct-type-${id}`}>
              Type
            </label>
            <select id={`acct-type-${id}`} className="select" value={type} onChange={(e) => setType(e.target.value as AccountType)}>
              <option value="checking">Main bank account (salary / everyday spending)</option>
              <option value="savings">Savings kept aside (extra savings account)</option>
              <option value="card">Credit card</option>
            </select>
            <span className="hint">Pick “Main bank account” for the account your salary comes into — even if your bank calls it a savings account.</span>
          </div>
        ) : null}
        {type === 'card' ? (
          <>
            <div className="field">
              <label className="label" htmlFor={`acct-close-${id}`}>
                Bill is made on day
              </label>
              <input id={`acct-close-${id}`} className="input" inputMode="numeric" value={closeDay} onChange={(e) => setCloseDay(e.target.value.replace(/\D/g, ''))} placeholder="8" maxLength={2} />
            </div>
            <div className="field">
              <label className="label" htmlFor={`acct-due-${id}`}>
                Pay by day
              </label>
              <input id={`acct-due-${id}`} className="input" inputMode="numeric" value={dueDay} onChange={(e) => setDueDay(e.target.value.replace(/\D/g, ''))} placeholder="28" maxLength={2} />
            </div>
            <div className="field span-2">
              <label className="label" htmlFor={`acct-autopay-${id}`}>
                Bill paid from
              </label>
              <select id={`acct-autopay-${id}`} className="select" value={autopay} onChange={(e) => setAutopay(e.target.value)}>
                <option value="">Not set (use my main bank account)</option>
                {banks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <span className="hint">We take the card bill from this account on the due day.</span>
            </div>
          </>
        ) : (
          <div className="field span-2">
            <label className="label" htmlFor={`acct-open-${id}`}>
              Starting balance <span className="faint">(optional)</span>
            </label>
            <div className="input-affix">
              <span>{currencySymbol(currency)}</span>
              <input id={`acct-open-${id}`} className="input" inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="0.00" />
            </div>
            <span className="hint">Only needed if your statement has no balance column: the balance before the first payment in the file.</span>
          </div>
        )}
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
          {account ? 'Save changes' : 'Add account'}
        </button>
      </div>
    </form>
  );
}
