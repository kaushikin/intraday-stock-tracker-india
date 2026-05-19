'use client';

import { useMemo } from 'react';
import { RefreshCw, ShieldAlert, Target, TrendingDown, TrendingUp } from 'lucide-react';
import { useApp } from '@/contexts/AppContext';
import { generateSignals, TradeSignal } from '@/lib/signalEngine';

function formatPrice(value: number) {
  if (!value) return '--';
  return `₹${value.toFixed(2)}`;
}

function SignalCard({ signal }: { signal: TradeSignal }) {
  const isBuy = signal.side === 'BUY';
  const isSell = signal.side === 'SELL';
  const isNeutral = signal.side === 'NEUTRAL';

  const cardBorder = isBuy
    ? 'border-green-500/30'
    : isSell
    ? 'border-red-500/30'
    : 'border-slate-700';

  const badgeClass = isBuy
    ? 'bg-green-500/15 text-green-400'
    : isSell
    ? 'bg-red-500/15 text-red-400'
    : 'bg-slate-700 text-slate-300';

  return (
    <div className={`rounded-3xl border ${cardBorder} bg-[#15161b] p-5 shadow-lg`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-white">{signal.symbol}</h2>
          <p className="mt-1 text-sm text-slate-400">Strategy: Intraday Price Action</p>
        </div>

        <div className={`rounded-full px-4 py-2 text-sm font-semibold ${badgeClass}`}>
          {signal.status.replaceAll('_', ' ')}
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3">
        {isBuy && <TrendingUp className="h-6 w-6 text-green-400" />}
        {isSell && <TrendingDown className="h-6 w-6 text-red-400" />}
        {isNeutral && <ShieldAlert className="h-6 w-6 text-slate-400" />}

        <div>
          <p className="text-sm text-slate-400">Signal</p>
          <p
            className={
              isBuy
                ? 'text-xl font-bold text-green-400'
                : isSell
                ? 'text-xl font-bold text-red-400'
                : 'text-xl font-bold text-slate-300'
            }
          >
            {signal.side}
          </p>
        </div>

        <div className="ml-auto text-right">
          <p className="text-sm text-slate-400">Strength</p>
          <p className="text-lg font-semibold text-white">{signal.strength}</p>
        </div>
      </div>

      {!isNeutral && (
        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-black/30 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Entry</p>
            <p className="mt-1 text-lg font-bold text-white">{formatPrice(signal.entry)}</p>
          </div>

          <div className="rounded-2xl bg-black/30 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Stop Loss</p>
            <p className="mt-1 text-lg font-bold text-red-400">
              {formatPrice(signal.stopLoss)}
            </p>
          </div>

          <div className="rounded-2xl bg-black/30 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Target 1</p>
            <p className="mt-1 text-lg font-bold text-green-400">
              {formatPrice(signal.target1)}
            </p>
          </div>

          <div className="rounded-2xl bg-black/30 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Target 2</p>
            <p className="mt-1 text-lg font-bold text-green-400">
              {formatPrice(signal.target2)}
            </p>
          </div>
        </div>
      )}

      {!isNeutral && (
        <div className="mt-4 rounded-2xl bg-black/30 p-4">
          <div className="flex items-center gap-2 text-slate-300">
            <Target className="h-4 w-4" />
            <span className="text-sm font-medium">Risk Details</span>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
            <div>
              <p className="text-slate-500">Risk/share</p>
              <p className="font-semibold text-white">{formatPrice(signal.riskPerShare)}</p>
            </div>
            <div>
              <p className="text-slate-500">Reward/share</p>
              <p className="font-semibold text-white">{formatPrice(signal.rewardPerShare)}</p>
            </div>
            <div>
              <p className="text-slate-500">R:R</p>
              <p className="font-semibold text-white">1:{signal.riskReward}</p>
            </div>
          </div>
        </div>
      )}

      <div className="mt-5">
        <p className="mb-2 text-sm font-semibold text-slate-300">Reasons</p>
        <ul className="space-y-2">
          {signal.reasons.map((reason, index) => (
            <li key={index} className="text-sm text-slate-400">
              • {reason}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function SignalsPage() {
  const { watchlist, prices, updatePrices } = useApp();

  const signals = useMemo(() => {
    return generateSignals(watchlist, prices);
  }, [watchlist, prices]);

  const activeSignals = signals.filter((s) => s.side !== 'NEUTRAL');
  const neutralSignals = signals.filter((s) => s.side === 'NEUTRAL');

  return (
    <main className="min-h-screen bg-[#050608] px-5 pb-28 pt-8 text-white">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold">Signals</h1>
            <p className="mt-2 text-slate-400">
              Rule-based intraday watch signals using live Angel One data.
            </p>
          </div>

          <button
            onClick={() => updatePrices()}
            className="flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 font-semibold text-white"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>

        <div className="mt-5 rounded-2xl border border-yellow-500/20 bg-yellow-500/10 p-4 text-sm text-yellow-200">
          Educational signal tracker only. Not financial advice. Always use your own
          judgement and risk management.
        </div>

        <section className="mt-8">
          <h2 className="mb-4 text-sm uppercase tracking-[0.25em] text-slate-500">
            Active Watch Signals ({activeSignals.length})
          </h2>

          {activeSignals.length === 0 ? (
            <div className="rounded-3xl border border-slate-800 bg-[#15161b] p-6 text-slate-400">
              No active buy/sell watch signals right now. Wait for cleaner setup.
            </div>
          ) : (
            <div className="space-y-5">
              {activeSignals.map((signal) => (
                <SignalCard key={signal.symbol} signal={signal} />
              ))}
            </div>
          )}
        </section>

        <section className="mt-8">
          <h2 className="mb-4 text-sm uppercase tracking-[0.25em] text-slate-500">
            Neutral / No Trade ({neutralSignals.length})
          </h2>

          <div className="space-y-5">
            {neutralSignals.map((signal) => (
              <SignalCard key={signal.symbol} signal={signal} />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}