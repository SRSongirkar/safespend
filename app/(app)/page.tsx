'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';
import AffordCheck from '@/components/AffordCheck';
import BalanceChart from '@/components/BalanceChart';
import Dialog from '@/components/Dialog';
import EmptyState, { ErrorAlert } from '@/components/EmptyState';
import EvidenceDrawer from '@/components/EvidenceDrawer';
import HeadlineNumbers, { type Horizon } from '@/components/HeadlineNumbers';
import Icon from '@/components/Icon';
import Insights from '@/components/Insights';
import PossibleRecurring from '@/components/PossibleRecurring';
import { LoadingBlock } from '@/components/Spinner';
import { useToast } from '@/components/Toast';
import UpcomingList, { type CorrectionRequest } from '@/components/UpcomingList';
import type { AffordResult, AnalysisResult, RecurringSeries, UpcomingItem } from '@/lib/core/types';
import { analysisApi } from '@/lib/client/api';
import { currencySymbol, formatDate, formatDateLong, formatMoney, parseMoneyInput } from '@/lib/client/format';
import { useApi } from '@/lib/client/useApi';

export default function HomePage() {
  const { data: a, error, initialLoading, loading, reload } = useApi<AnalysisResult>('/api/analysis');
  const toast = useToast();
  const [horizon, setHorizon] = useState<Horizon>('payday');
  const [afford, setAfford] = useState<AffordResult | null>(null);
  const [openItem, setOpenItem] = useState<UpcomingItem | null>(null);
  const [amountEdit, setAmountEdit] = useState<{ item: UpcomingItem; value: string } | null>(null);
  const [loadingDemo, setLoadingDemo] = useState(false);

  const onAfford = useCallback((r: AffordResult | null) => setAfford(r), []);
  const closeDrawer = useCallback(() => setOpenItem(null), []);

  const undo = useCallback(
    async (seriesKey: string) => {
      try {
        await analysisApi.uncorrect(seriesKey);
        toast({ message: 'Correction undone' });
        reload();
      } catch (e) {
        toast({ message: (e as Error).message, kind: 'error' });
      }
    },
    [reload, toast],
  );

  const applyCorrection = useCallback(
    async (seriesKey: string, label: string, action: 'not_recurring' | 'cancelled' | 'confirm' | 'override_amount', amount?: number) => {
      try {
        await analysisApi.correct(seriesKey, action, amount);
        const messages = {
          cancelled: `Removed ${label} from your forecast`,
          not_recurring: `${label} is no longer treated as recurring`,
          confirm: `Added ${label} to your forecast`,
          override_amount: `${label} will now be predicted at ${formatMoney(amount ?? 0, a?.currency, { exact: true })}`,
        };
        toast({ message: messages[action], action: { label: 'Undo', onClick: () => void undo(seriesKey) } });
        setOpenItem(null);
        reload();
      } catch (e) {
        toast({ message: (e as Error).message, kind: 'error' });
      }
    },
    [a?.currency, reload, toast, undo],
  );

  const onCorrect = useCallback(
    (r: CorrectionRequest) => {
      if (!r.item.seriesKey) return;
      if (r.action === 'override_amount') {
        setAmountEdit({ item: r.item, value: (Math.abs(r.item.amount) / 100).toFixed(2) });
        return;
      }
      void applyCorrection(r.item.seriesKey, r.item.label, r.action);
    },
    [applyCorrection],
  );

  const onDecide = useCallback((s: RecurringSeries, confirm: boolean) => void applyCorrection(s.key, s.merchant, confirm ? 'confirm' : 'not_recurring'), [applyCorrection]);

  const loadDemo = async () => {
    setLoadingDemo(true);
    try {
      const r = await analysisApi.loadDemo();
      toast({ message: `Loaded demo data: ${r.added.toLocaleString('en-US')} items added` });
      reload();
    } catch (e) {
      toast({ message: (e as Error).message, kind: 'error' });
    } finally {
      setLoadingDemo(false);
    }
  };

  if (initialLoading) return <LoadingBlock label="Working out what’s committed…" />;
  if (error && !a) return <ErrorAlert message={error} onRetry={reload} />;
  if (!a) return null;

  if (!a.hasData) {
    return (
      <div className="page">
        <div className="card">
          <EmptyState
            icon="upload"
            title="Add your first account and import a statement"
            actions={
              <>
                <button type="button" className="btn btn-primary" onClick={loadDemo} disabled={loadingDemo}>
                  {loadingDemo ? <span className="spinner" /> : <Icon name="sparkle" size={16} />}
                  Load demo data
                </button>
                <Link href="/import" className="btn">
                  <Icon name="upload" size={16} /> Import a statement
                </Link>
                <Link href="/accounts" className="btn btn-ghost">
                  Add an account
                </Link>
              </>
            }
          >
            Committed reads bank, card, payslip and receipt files and shows how much of your money is already promised before payday. Everything stays encrypted in your private space.
          </EmptyState>
        </div>
      </div>
    );
  }

  const savings = a.accounts.filter((x) => x.type === 'savings').length > 0;

  return (
    <div className={`page ${loading ? 'refetching' : ''}`}>
      <header className="page-header">
        <div>
          <div className="eyebrow">As of {formatDate(a.now)} · latest statement data</div>
          <h1 className="page-title">{formatDateLong(a.now)}</h1>
          <p className="hero-note" style={{ marginTop: 6 }}>
            <span>
              Your bank balance says <strong>{formatMoney(a.startBalance, a.currency)}</strong>.
            </span>
            <span>Here’s what’s actually yours to spend.</span>
          </p>
        </div>
        <div className="row-wrap">
          {savings ? (
            <span className="chip" title="Savings are kept separate as a backup">
              <Icon name="piggy" size={13} /> Savings {formatMoney(a.savingsBalance, a.currency)}
            </span>
          ) : null}
          {a.nextPayday ? (
            <span className="chip">
              <Icon name="calendar" size={13} /> Payday {formatDate(a.nextPayday)}
              {a.payAmount ? ` · ${formatMoney(a.payAmount, a.currency)}` : ''}
            </span>
          ) : null}
        </div>
      </header>

      <HeadlineNumbers a={a} horizon={horizon} onHorizon={setHorizon} />

      <div className="home-grid">
        <div className="home-main">
          <section className="card slot-chart" aria-labelledby="chart-title">
            <div className="card-header">
              <div>
                <h2 id="chart-title" className="card-title">
                  Projected checking balance
                </h2>
                <p className="card-sub">
                  Daily through {a.followingPayday ? `your ${formatDate(a.followingPayday)} payday` : formatDate(a.forecast[a.forecast.length - 1].date)} · includes an everyday
                  spending estimate of {formatMoney(a.everydayDailyEstimate, a.currency)}/day
                </p>
              </div>
            </div>
            <BalanceChart days={a.forecast} overlay={afford?.forecast ?? null} bufferCents={a.bufferCents} currency={a.currency} overlayLabel={afford ? `With ${formatMoney(afford.amountCents, a.currency)} on ${formatDate(afford.date)}` : undefined} />
          </section>
          <div className="slot-upcoming">
            <UpcomingList a={a} onOpen={setOpenItem} onCorrect={onCorrect} />
          </div>
        </div>
        <div className="home-side">
          <div className="slot-afford">
            <AffordCheck a={a} onResult={onAfford} />
          </div>
          <div className="slot-insights">
            <Insights insights={a.insights} onUndo={undo} />
          </div>
          <div className="slot-possible">
            <PossibleRecurring series={a.possibleSeries} currency={a.currency} onDecide={onDecide} />
          </div>
        </div>
      </div>

      {openItem ? <EvidenceDrawer item={openItem} a={a} onClose={closeDrawer} onCorrect={onCorrect} /> : null}

      {amountEdit ? (
        <Dialog
          title={`Change the amount for ${amountEdit.item.label}`}
          onClose={() => setAmountEdit(null)}
          footer={
            <>
              <button type="button" className="btn" data-close onClick={() => setAmountEdit(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  const cents = parseMoneyInput(amountEdit.value);
                  if (!cents) return;
                  const { item } = amountEdit;
                  setAmountEdit(null);
                  void applyCorrection(item.seriesKey!, item.label, 'override_amount', cents);
                }}
              >
                Save amount
              </button>
            </>
          }
        >
          <p className="muted small">Future {amountEdit.item.label} payments will be predicted at this amount.</p>
          <div className="input-affix">
            <span>{currencySymbol(a.currency)}</span>
            <input
              className="input"
              inputMode="decimal"
              value={amountEdit.value}
              onChange={(e) => setAmountEdit({ ...amountEdit, value: e.target.value })}
              aria-label="New amount"
              aria-invalid={!parseMoneyInput(amountEdit.value)}
            />
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}
