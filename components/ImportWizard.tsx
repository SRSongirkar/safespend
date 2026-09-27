'use client';

import Link from 'next/link';
import { useCallback, useRef, useState } from 'react';
import type { Account, AccountType, ImportRecord } from '@/lib/core/types';
import { accountsApi, importApi, type ImportBody, type ImportPreview } from '@/lib/client/api';
import { formatDateYear, formatMoney, plural } from '@/lib/client/format';
import AccountForm from './AccountForm';
import ColumnMapper, { type MappingInput } from './ColumnMapper';
import Icon from './Icon';
import { ACCOUNT_LABELS } from './meta';
import { useToast } from './Toast';

const MAX_BYTES = 5 * 1024 * 1024;

const FORMAT_LABEL: Record<string, string> = {
  A: 'Bank CSV — debit / credit / balance (DD/MM/YYYY)',
  B: 'Bank CSV — signed amounts (YYYY-MM-DD)',
  C: 'Card CSV — amount + DR/CR (MM/DD/YYYY)',
  mapped: 'CSV with your saved column mapping',
  json: 'JSON document',
  text: 'Pasted email',
  unknown: 'Unrecognised CSV',
};

const SAMPLES = [
  { file: 'bank_checking_overlap.csv', label: 'Overlapping checking export', hint: 'shows dedupe' },
  { file: 'renamed_headers.csv', label: 'CSV with unfamiliar headers', hint: 'shows column mapping' },
  { file: 'bank_checking.csv', label: 'Checking (format A)' },
  { file: 'bank_savings.csv', label: 'Savings (format B)' },
  { file: 'card_rewards.csv', label: 'Card (format C)' },
  { file: 'payslips.json', label: 'Payslips' },
  { file: 'receipts.json', label: 'Receipt emails' },
];

interface Entry {
  id: string;
  fileName: string;
  text: string;
  kind?: 'receipt_text';
  accountId: string;
  mapping?: MappingInput;
  preview?: ImportPreview;
  busy: boolean;
  error?: string;
  newAccount?: AccountType;
  result?: ImportRecord;
}

let seq = 0;

export default function ImportWizard({ accounts, currency, onAccountsChanged, onImported }: { accounts: Account[]; currency: string; onAccountsChanged: () => void; onImported: () => void }) {
  const toast = useToast();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [drag, setDrag] = useState(false);
  const [paste, setPaste] = useState('');
  const [showPaste, setShowPaste] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const accountsRef = useRef(accounts);
  accountsRef.current = accounts;

  const update = useCallback((id: string, patch: Partial<Entry>) => setEntries((list) => list.map((e) => (e.id === id ? { ...e, ...patch } : e))), []);

  const body = (e: Entry): ImportBody => ({
    fileName: e.fileName,
    text: e.text,
    accountId: e.accountId || undefined,
    mapping: e.mapping,
    kind: e.kind,
  });

  const runPreview = useCallback(
    async (e: Entry) => {
      update(e.id, { busy: true, error: undefined });
      try {
        let preview = await importApi.preview(body(e));
        let accountId = e.accountId;
        let newAccount: AccountType | undefined;
        if (preview.kind === 'csv' && !accountId && !preview.needsMapping) {
          const type = preview.suggestedAccountType ?? 'checking';
          const match = accountsRef.current.find((a) => a.type === type) ?? (preview.format === 'mapped' ? accountsRef.current.find((a) => a.type !== 'card') : undefined);
          if (match) {
            accountId = match.id;
            preview = await importApi.preview({ ...body(e), accountId });
          } else newAccount = type;
        }
        update(e.id, { preview, accountId, newAccount, busy: false });
      } catch (err) {
        update(e.id, { busy: false, error: (err as Error).message });
      }
    },
    [update],
  );

  const addEntry = useCallback(
    (fileName: string, text: string, kind?: 'receipt_text') => {
      const e: Entry = { id: `f${++seq}`, fileName, text, kind, accountId: '', busy: true };
      setEntries((list) => [...list, e]);
      void runPreview(e);
    },
    [runPreview],
  );

  const addFiles = async (files: FileList | File[]) => {
    for (const f of Array.from(files)) {
      if (f.size > MAX_BYTES) {
        toast({ message: `${f.name} is larger than 5 MB`, kind: 'error' });
        continue;
      }
      addEntry(f.name, await f.text());
    }
  };

  const addSample = async (file: string) => {
    try {
      const res = await fetch(`/demo/${file}`);
      if (!res.ok) throw new Error('Sample file not found');
      addEntry(file, await res.text());
    } catch (e) {
      toast({ message: (e as Error).message, kind: 'error' });
    }
  };

  const setAccount = (e: Entry, accountId: string) => {
    if (accountId === '__new') {
      update(e.id, { newAccount: e.preview?.suggestedAccountType ?? 'checking' });
      return;
    }
    const next = { ...e, accountId, newAccount: undefined };
    update(e.id, { accountId, newAccount: undefined });
    void runPreview(next);
  };

  const commit = async (e: Entry) => {
    update(e.id, { busy: true, error: undefined });
    try {
      const r = await importApi.commit(body(e));
      update(e.id, { busy: false, result: r.import, preview: r.preview });
      toast({ message: `${e.fileName}: ${plural(r.import.added, 'new item')} imported, ${r.import.duplicates} duplicates skipped` });
      onImported();
    } catch (err) {
      update(e.id, { busy: false, error: (err as Error).message });
    }
  };

  const ready = entries.filter((e) => e.preview && !e.result && !e.busy && !e.preview.needsMapping && !e.preview.needsAccount && e.preview.added > 0);

  return (
    <div className="stack">
      <div
        className={`dropzone ${drag ? 'drag' : ''}`}
        role="button"
        tabIndex={0}
        aria-label="Choose files to import"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(ev) => (ev.key === 'Enter' || ev.key === ' ') && (ev.preventDefault(), inputRef.current?.click())}
        onDragOver={(ev) => {
          ev.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(ev) => {
          ev.preventDefault();
          setDrag(false);
          void addFiles(ev.dataTransfer.files);
        }}
      >
        <div className="empty-icon">
          <Icon name="upload" size={24} />
        </div>
        <strong>Drop statements here, or click to choose</strong>
        <span className="small muted">Bank or card CSV, payslips.json, receipts.json — several at once is fine. Up to 5 MB each.</span>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".csv,.json,.txt,text/csv,application/json"
          hidden
          onChange={(ev) => {
            if (ev.target.files) void addFiles(ev.target.files);
            ev.target.value = '';
          }}
        />
      </div>

      <div className="row-wrap" style={{ justifyContent: 'space-between' }}>
        <div className="stack-sm" style={{ gap: 6 }}>
          <span className="small muted">No files handy? Try a sample:</span>
          <div className="sample-files">
            {SAMPLES.map((s) => (
              <button key={s.file} type="button" className="btn btn-sm" onClick={() => addSample(s.file)} title={s.file}>
                {s.label}
                {s.hint ? <span className="faint"> · {s.hint}</span> : null}
              </button>
            ))}
          </div>
        </div>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setShowPaste((s) => !s)} aria-expanded={showPaste}>
          <Icon name="mail" size={15} /> Paste a receipt email
        </button>
      </div>

      {showPaste ? (
        <div className="card stack-sm">
          <label className="label" htmlFor="paste-email">
            Paste a receipt or renewal email
          </label>
          <textarea
            id="paste-email"
            className="textarea"
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            placeholder={'From: HomeShield <billing@homeshield.example>\nSubject: Your renewal\nDate: 2026-09-10\n\nYour policy renews on October 3, 2026. Amount: $186.00.'}
          />
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!paste.trim()}
              onClick={() => {
                addEntry('Pasted email', paste, 'receipt_text');
                setPaste('');
                setShowPaste(false);
              }}
            >
              Preview email
            </button>
          </div>
        </div>
      ) : null}

      {entries.map((e) => {
        const p = e.preview;
        const bankAccounts = accounts;
        return (
          <section key={e.id} className="card file-card" aria-label={e.fileName}>
            <div className="file-head">
              <div className="file-icon">
                <Icon name={e.kind === 'receipt_text' ? 'mail' : e.fileName.endsWith('.json') ? 'receipt' : 'file'} size={19} />
              </div>
              <div className="spacer" style={{ minWidth: 0 }}>
                <div className="file-name" title={e.fileName}>
                  {e.fileName}
                </div>
                <div className="small muted">{p ? FORMAT_LABEL[p.format] ?? p.format : e.busy ? 'Reading…' : ''}</div>
              </div>
              {e.result ? (
                <span className="badge badge-good">
                  <Icon name="check" size={12} strokeWidth={2.6} /> Imported
                </span>
              ) : (
                <button type="button" className="btn btn-ghost btn-icon" aria-label={`Remove ${e.fileName}`} onClick={() => setEntries((l) => l.filter((x) => x.id !== e.id))}>
                  <Icon name="close" size={17} />
                </button>
              )}
            </div>

            {e.error ? (
              <div className="alert alert-error" role="alert">
                <Icon name="alert" size={16} />
                <span>{e.error}</span>
              </div>
            ) : null}

            {p && p.kind === 'csv' && !e.result ? (
              <div className="form-grid">
                <div className="field">
                  <label className="label" htmlFor={`acct-${e.id}`}>
                    Account
                  </label>
                  <select id={`acct-${e.id}`} className="select" value={e.newAccount ? '__new' : e.accountId} onChange={(ev) => setAccount(e, ev.target.value)}>
                    <option value="" disabled>
                      Choose an account…
                    </option>
                    {bankAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({ACCOUNT_LABELS[a.type]})
                      </option>
                    ))}
                    <option value="__new">+ Add a new account…</option>
                  </select>
                </div>
                {p.suggestedAccountType ? (
                  <div className="field">
                    <span className="label">Looks like</span>
                    <span className="small muted" style={{ paddingTop: 10 }}>
                      a {ACCOUNT_LABELS[p.suggestedAccountType].toLowerCase()} export
                    </span>
                  </div>
                ) : null}
              </div>
            ) : null}

            {e.newAccount && !e.result ? (
              <div className="card" style={{ background: 'var(--surface-2)', boxShadow: 'none' }}>
                <strong className="small">New account for this file</strong>
                <div style={{ marginTop: 10 }}>
                  <AccountForm
                    accounts={accounts}
                    currency={currency}
                    defaultType={e.newAccount}
                    compact
                    onCancel={() => update(e.id, { newAccount: undefined })}
                    onSave={async (input) => {
                      const { account } = await accountsApi.create(input);
                      accountsRef.current = [...accountsRef.current, account];
                      onAccountsChanged();
                      setAccount({ ...e, newAccount: undefined }, account.id);
                    }}
                  />
                </div>
              </div>
            ) : null}

            {p?.needsMapping && p.header && !e.result ? (
              <ColumnMapper
                header={p.header}
                text={e.text}
                busy={e.busy}
                onApply={(mapping) => {
                  const next = { ...e, mapping };
                  update(e.id, { mapping });
                  void runPreview(next);
                }}
              />
            ) : null}

            {p && !p.needsMapping && !p.needsAccount ? (
              <>
                <div className="counts">
                  <div className="count">
                    <b className="num">{p.rows.toLocaleString('en-US')}</b>
                    <span>rows in file</span>
                  </div>
                  <div className="count good">
                    <b className="num">{(e.result?.added ?? p.added).toLocaleString('en-US')}</b>
                    <span>{e.result ? 'imported' : 'new'}</span>
                  </div>
                  <div className="count">
                    <b className="num">{p.duplicates.toLocaleString('en-US')}</b>
                    <span>duplicates skipped</span>
                  </div>
                </div>
                {p.added === 0 && p.duplicates > 0 && !e.result ? (
                  <div className="alert alert-good">
                    <Icon name="check" size={16} />
                    <span>Everything in this file is already in your space — importing it again adds nothing.</span>
                  </div>
                ) : null}
                {p.errors.length > 0 ? (
                  <details className="alert alert-error">
                    <summary style={{ cursor: 'pointer' }}>
                      {plural(p.errors.length, 'row')} couldn’t be read and will be skipped
                    </summary>
                    <ul className="small" style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                      {p.errors.slice(0, 8).map((er, i) => (
                        <li key={i}>{er}</li>
                      ))}
                    </ul>
                  </details>
                ) : null}
                {p.sample.length > 0 ? (
                  <div className="table-wrap" style={{ border: '1px solid var(--border)', borderRadius: 10 }}>
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Description</th>
                          {p.kind === 'csv' || p.kind === 'payslips' ? <th className="right">Amount</th> : null}
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {p.sample.map((s, i) => (
                          <tr key={i} className={s.duplicate ? 'dup-row' : ''}>
                            <td className="nowrap">{formatDateYear(s.date)}</td>
                            <td className="small">{s.description}</td>
                            {p.kind === 'csv' || p.kind === 'payslips' ? <td className="num">{formatMoney(s.amount, currency, { exact: true, signed: true })}</td> : null}
                            <td className="right">{s.duplicate ? <span className="badge">Duplicate</span> : <span className="badge badge-good">New</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
                {e.result ? (
                  <div className="alert alert-good">
                    <Icon name="check" size={16} />
                    <span className="spacer">
                      Imported {plural(e.result.added, 'new item')}
                      {e.result.duplicates ? `, skipped ${e.result.duplicates} duplicates` : ''}.
                    </span>
                    <Link href="/" className="btn btn-sm">
                      See my forecast
                    </Link>
                  </div>
                ) : (
                  <div className="row" style={{ justifyContent: 'flex-end' }}>
                    <button type="button" className="btn btn-primary" disabled={e.busy || p.added === 0} onClick={() => commit(e)}>
                      {e.busy ? <span className="spinner" /> : <Icon name="check" size={16} />}
                      {p.added === 0 ? 'Nothing new to import' : `Import ${plural(p.added, 'new item')}`}
                    </button>
                  </div>
                )}
              </>
            ) : null}
            {e.busy && !p ? <span className="small muted row"><span className="spinner" /> Checking the file…</span> : null}
          </section>
        );
      })}

      {ready.length > 1 ? (
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={async () => {
              for (const e of ready) await commit(e);
            }}
          >
            Import all {ready.length} files
          </button>
        </div>
      ) : null}
    </div>
  );
}
