'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Brain,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { useApp } from '@/contexts/AppContext';
import { generateSignals, TradeSignal } from '@/lib/signalEngine';

type AISentiment = {
  label: 'positive' | 'negative' | 'neutral';
  confidence: number;
  signalScore: number;
};

function formatPrice(value: number) {
  if (!value) return '--';
  return `₹${value.toFixed(2)}`;
}

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

function getFallbackSentiment(signal: TradeSignal): AISentiment {
  if (signal.side === 'BUY') {
    return {
      label: 'positive',
      confidence: 70,
      signalScore: signal.strength === 'STRONG' ? 78 : 65,
    };
  }

  if (signal.side === 'SELL') {
    return {
      label: 'negative',
      confidence: 70,
      signalScore: signal.strength === 'STRONG' ? 78 : 65,
    };
  }

  return {
    label: 'neutral',
    confidence: 60,
    signalScore: 45,
  };
}

function buildSentimentText(signal: TradeSignal) {
  const reasons = signal.reasons.join('. ');

  if (signal.side === 'BUY') {
    return `${signal.symbol} shows a positive intraday technical setup. ${reasons}. Price action appears bullish with possible upside momentum.`;
  }

  if (signal.side === 'SELL') {
    return `${signal.symbol} shows a negative intraday technical setup. ${reasons}. Price action appears bearish with possible downside pressure.`;
  }

  return `${signal.symbol} has no clear intraday trading setup currently. ${reasons}. Market signal is neutral and uncertain.`;
}

function calculateSignalScore(signal: TradeSignal, label: string, confidence: number) {
  let baseScore = 40;

  if (signal.side === 'BUY' || signal.side === 'SELL') {
    baseScore = signal.strength === 'STRONG' ? 70 : 60;
  }

  if (signal.side === 'BUY' && label === 'positive') {
    baseScore += 15;
  }

  if (signal.side === 'SELL' && label === 'negative') {
    baseScore += 15;
  }

  if (label === 'neutral') {
    baseScore -= 5;
  }

  if (signal.riskReward >= 1) {
    baseScore += 5;
  }

  if (confidence >= 90) {
    baseScore += 5;
  }

  return Math.max(0, Math.min(100, Math.round(baseScore)));
}

function SentimentBox({
  sentiment,
  loading,
}: {
  sentiment?: AISentiment;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="mt-4 rounded-2xl border border-purple-500/20 bg-purple-500/10 p-4">
        <div className="flex items-center gap-2 text-purple-300">
          <Brain className="h-4 w-4 animate-pulse" />
          <span className="text-sm font-semibold">AI is analyzing...</span>
        </div>
      </div>
    );
  }

  if (!sentiment) {
    return null;
  }

  const isPositive = sentiment.label === 'positive';
  const isNegative = sentiment.label === 'negative';

  const sentimentClass = isPositive
    ? 'text-green-400'
    : isNegative
    ? 'text-red-400'
    : 'text-slate-300';

  const scoreClass =
    sentiment.signalScore >= 75
      ? 'text-green-400'
      : sentiment.signalScore >= 55
      ? 'text-yellow-400'
      : 'text-red-400';

  return (
    <div className="mt-4 rounded-2xl border border-purple-500/20 bg-purple-500/10 p-4">
      <div className="mb-3 flex items-center gap-2 text-purple-300">
        <Sparkles className="h-4 w-4" />
        <span className="text-sm font-semibold">Hugging Face AI Analysis</span>
      </div>

      <div className="grid grid-cols-3 gap-3 text-sm">
        <div>
          <p className="text-slate-500">News Sentiment</p>
          <p className={`font-bold capitalize ${sentimentClass}`}>
            {sentiment.label}
          </p>
        </div>

        <div>
          <p className="text-slate-500">AI Confidence</p>
          <p className="font-bold text-white">
            {formatPercent(sentiment.confidence)}
          </p>
        </div>

        <div>
          <p className="text-slate-500">Signal Score</p>
          <p className={`font-bold ${scoreClass}`}>
            {sentiment.signalScore}/100
          </p>
        </div>
      </div>
    </div>
  );
}

function SignalCard({
  signal,
  sentiment,
  loadingSentiment,
}: {
  signal: TradeSignal;
  sentiment?: AISentiment;
  loadingSentiment: boolean;
}) {
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
          <p className="mt-1 text-sm text-slate-400">
            Strategy: Intraday Price Action
          </p>
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

      <SentimentBox sentiment={sentiment} loading={loadingSentiment} />

      {!isNeutral && (
        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-black/30 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Entry</p>
            <p className="mt-1 text-lg font-bold text-white">
              {formatPrice(signal.entry)}
            </p>
          </div>

          <div className="rounded-2xl bg-black/30 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">
              Stop Loss
            </p>
            <p className="mt-1 text-lg font-bold text-red-400">
              {formatPrice(signal.stopLoss)}
            </p>
          </div>

          <div className="rounded-2xl bg-black/30 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">
              Target 1
            </p>
            <p className="mt-1 text-lg font-bold text-green-400">
              {formatPrice(signal.target1)}
            </p>
          </div>

          <div className="rounded-2xl bg-black/30 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">
              Target 2
            </p>
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
              <p className="font-semibold text-white">
                {formatPrice(signal.riskPerShare)}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Reward/share</p>
              <p className="font-semibold text-white">
                {formatPrice(signal.rewardPerShare)}
              </p>
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

  const [sentiments, setSentiments] = useState<Record<string, AISentiment>>({});
  const [loadingSentiment, setLoadingSentiment] = useState(false);

  const signals = useMemo(() => {
    return generateSignals(watchlist, prices);
  }, [watchlist, prices]);

  const activeSignals = signals.filter((s) => s.side !== 'NEUTRAL');
  const neutralSignals = signals.filter((s) => s.side === 'NEUTRAL');

  async function analyzeSentiments() {
    if (!signals.length) return;

    setLoadingSentiment(true);

    const nextSentiments: Record<string, AISentiment> = {};

    for (const signal of signals) {
      try {
        const response = await fetch('/api/hf/sentiment', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text: buildSentimentText(signal),
          }),
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          nextSentiments[signal.symbol] = getFallbackSentiment(signal);
          continue;
        }

        const result = data.result?.[0] || [];

        const top = result.reduce(
          (best: any, item: any) => {
            if (!best || item.score > best.score) return item;
            return best;
          },
          null
        );

        const label = (top?.label || 'neutral').toLowerCase() as
          | 'positive'
          | 'negative'
          | 'neutral';

        const confidence = Math.round((top?.score || 0.6) * 100);

        nextSentiments[signal.symbol] = {
          label,
          confidence,
          signalScore: calculateSignalScore(signal, label, confidence),
        };
      } catch {
        nextSentiments[signal.symbol] = getFallbackSentiment(signal);
      }
    }

    setSentiments(nextSentiments);
    setLoadingSentiment(false);
  }

  useEffect(() => {
    if (!signals.length) return;

    analyzeSentiments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signals.length]);

  return (
    <main className="min-h-screen bg-[#050608] px-5 pb-28 pt-8 text-white">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold">Signals</h1>
            <p className="mt-2 text-slate-400">
              Rule-based intraday watch signals with Hugging Face AI sentiment.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <button
              onClick={() => updatePrices()}
              className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 font-semibold text-white"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>

            <button
              onClick={analyzeSentiments}
              className="flex items-center justify-center gap-2 rounded-2xl bg-purple-600 px-4 py-3 font-semibold text-white"
            >
              <Brain className="h-4 w-4" />
              AI Check
            </button>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-yellow-500/20 bg-yellow-500/10 p-4 text-sm text-yellow-200">
          Educational signal tracker only. Not financial advice. Hugging Face
          currently analyzes signal text; actual live news integration can be added next.
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
                <SignalCard
                  key={signal.symbol}
                  signal={signal}
                  sentiment={sentiments[signal.symbol]}
                  loadingSentiment={loadingSentiment}
                />
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
              <SignalCard
                key={signal.symbol}
                signal={signal}
                sentiment={sentiments[signal.symbol]}
                loadingSentiment={loadingSentiment}
              />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}