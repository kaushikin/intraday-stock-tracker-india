'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock,
  PieChart,
  Radar,
  Target,
  TrendingDown,
  TrendingUp,
  Wallet,
  XCircle,
} from 'lucide-react';
import { useApp } from '@/contexts/AppContext';
import JournalPatternAnalytics from '@/components/JournalPatternAnalytics';

type StockPL = {
  symbol: string;
  trades: number;
  pnl: number;
  brokerage: number;
  wins: number;
  losses: number;
};

type SignalLifecycleStatus =
  | 'WAITING'
  | 'TRIGGERED'
  | 'TARGET_1_HIT'
  | 'TARGET_2_HIT'
  | 'STOP_LOSS_HIT'
  | 'EXPIRED';

type TrackedSignal = {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL' | 'NEUTRAL';
  strength: 'STRONG' | 'MEDIUM' | 'WEAK';
  entry: number;
  stopLoss: number;
  target1: number;
  target2: number;
  riskPerShare: number;
  rewardPerShare: number;
  riskReward: number;
  lifecycleStatus: SignalLifecycleStatus;
  createdAt: string;
  lastCheckedAt?: string;
  savedToJournal?: boolean;
  sentiment?: {
    label: 'positive' | 'negative' | 'neutral';
    confidence: number;
    signalScore: number;
  };
  // Already persisted in localStorage (TrackedSignal extends TradeSignal,
  // which has this field) -- just wasn't declared/read here before.
  reasons?: string[];
};

const TRACKED_SIGNALS_KEY = 'tracked_signals_v1';

function formatCurrency(value: number) {
  const sign = value < 0 ? '-' : '';
  return `${sign}₹${Math.abs(value).toFixed(2)}`;
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) return '0%';
  return `${value.toFixed(1)}%`;
}

function getTradePL(trade: any) {
  const gross =
    trade.side === 'BUY'
      ? (trade.exitPrice - trade.entryPrice) * trade.quantity
      : (trade.entryPrice - trade.exitPrice) * trade.quantity;

  return gross - trade.brokerage;
}

function isToday(dateString: string) {
  const date = new Date(dateString);
  const today = new Date();

  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

function isTargetHit(status: SignalLifecycleStatus) {
  return status === 'TARGET_1_HIT' || status === 'TARGET_2_HIT';
}

function isStopLossHit(status: SignalLifecycleStatus) {
  return status === 'STOP_LOSS_HIT';
}

function isCompletedSignal(status: SignalLifecycleStatus) {
  return (
    status === 'TARGET_1_HIT' ||
    status === 'TARGET_2_HIT' ||
    status === 'STOP_LOSS_HIT' ||
    status === 'EXPIRED'
  );
}

function getSignalStatusLabel(status: SignalLifecycleStatus) {
  const labels: Record<SignalLifecycleStatus, string> = {
    WAITING: 'Waiting',
    TRIGGERED: 'Triggered',
    TARGET_1_HIT: 'Target 1 Hit',
    TARGET_2_HIT: 'Target 2 Hit',
    STOP_LOSS_HIT: 'Stop Loss Hit',
    EXPIRED: 'Expired',
  };

  return labels[status];
}

// The 7 scoring factors from lib/signalEngine.ts. Each has a bullish (BUY)
// and bearish (SELL) phrasing -- checking for either lets one definition
// cover both sides of a signal.
const FACTOR_DEFINITIONS: { key: string; label: string; phrases: string[] }[] = [
  {
    key: 'vwap',
    label: 'Aligned with VWAP',
    phrases: ['Price is above VWAP', 'Price is below VWAP'],
  },
  {
    key: 'ema20',
    label: 'Aligned with EMA 20',
    phrases: ['Price is above EMA 20', 'Price is below EMA 20'],
  },
  {
    key: 'emaStructure',
    label: 'EMA 20/50 trend structure',
    phrases: ['EMA 20 is above EMA 50', 'EMA 20 is below EMA 50'],
  },
  {
    key: 'rsi',
    label: 'RSI momentum confirmation',
    phrases: ['RSI is healthy and rising', 'RSI is weak and falling'],
  },
  {
    key: 'volume',
    label: 'Volume above average',
    phrases: ['Volume is above average'],
  },
  {
    key: 'candleBody',
    label: 'Strong candle body',
    phrases: [
      'Latest candle has bullish body strength',
      'Latest candle has bearish body strength',
    ],
  },
  {
    key: 'positionInRange',
    label: 'Not at extreme of day range',
    phrases: [
      'Price is strong but not at extreme day high',
      'Price is weak but not at extreme day low',
    ],
  },
];

function getTechnicalScore(signal: TrackedSignal): number | null {
  const scoreLine = (signal.reasons || []).find((r) =>
    /score:\s*\d+\/12/i.test(r)
  );
  if (!scoreLine) return null;
  const match = scoreLine.match(/(\d+)\/12/);
  return match ? Number(match[1]) : null;
}

function MetricCard({
  title,
  value,
  subtitle,
  icon,
  tone = 'neutral',
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: ReactNode;
  tone?: 'green' | 'red' | 'yellow' | 'blue' | 'neutral';
}) {
  const toneClass =
    tone === 'green'
      ? 'text-green-400'
      : tone === 'red'
      ? 'text-red-400'
      : tone === 'yellow'
      ? 'text-yellow-400'
      : tone === 'blue'
      ? 'text-blue-400'
      : 'text-white';

  return (
    <div className="rounded-3xl border border-slate-800 bg-[#15161b] p-5 shadow-lg">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm uppercase tracking-wide text-slate-500">{title}</p>
        <div className="rounded-2xl bg-black/30 p-3 text-slate-400">{icon}</div>
      </div>

      <p className={`text-3xl font-bold ${toneClass}`}>{value}</p>

      {subtitle && <p className="mt-2 text-sm text-slate-500">{subtitle}</p>}
    </div>
  );
}

function SectionTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-4">
      <h2 className="text-sm uppercase tracking-[0.25em] text-slate-500">
        {title}
      </h2>
      {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
    </div>
  );
}

function PLText({ value }: { value: number }) {
  const positive = value >= 0;

  return (
    <span className={positive ? 'text-green-400' : 'text-red-400'}>
      {formatCurrency(value)}
    </span>
  );
}

function SignalStatusBadge({ status }: { status: SignalLifecycleStatus }) {
  const className = isTargetHit(status)
    ? 'bg-green-500/15 text-green-400'
    : isStopLossHit(status)
    ? 'bg-red-500/15 text-red-400'
    : status === 'TRIGGERED'
    ? 'bg-blue-500/15 text-blue-400'
    : status === 'WAITING'
    ? 'bg-yellow-500/15 text-yellow-300'
    : 'bg-slate-700 text-slate-300';

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-bold ${className}`}>
      {getSignalStatusLabel(status)}
    </span>
  );
}

export default function AnalyticsPage() {
  const { trades, dailyPL } = useApp();
  const [trackedSignals, setTrackedSignals] = useState<TrackedSignal[]>([]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(TRACKED_SIGNALS_KEY);
      if (saved) {
        setTrackedSignals(JSON.parse(saved));
      }
    } catch {
      setTrackedSignals([]);
    }
  }, []);

  const tradeAnalytics = useMemo(() => {
    const totalTrades = trades.length;

    const enrichedTrades = trades.map((trade) => ({
      ...trade,
      pnl: getTradePL(trade),
    }));

    const netPL = enrichedTrades.reduce((sum, trade) => sum + trade.pnl, 0);

    const totalBrokerage = enrichedTrades.reduce(
      (sum, trade) => sum + Number(trade.brokerage || 0),
      0
    );

    const winningTrades = enrichedTrades.filter((trade) => trade.pnl > 0);
    const losingTrades = enrichedTrades.filter((trade) => trade.pnl < 0);
    const breakEvenTrades = enrichedTrades.filter((trade) => trade.pnl === 0);

    const winRate =
      totalTrades > 0 ? (winningTrades.length / totalTrades) * 100 : 0;

    const lossRate =
      totalTrades > 0 ? (losingTrades.length / totalTrades) * 100 : 0;

    const averageWin =
      winningTrades.length > 0
        ? winningTrades.reduce((sum, trade) => sum + trade.pnl, 0) /
          winningTrades.length
        : 0;

    const averageLoss =
      losingTrades.length > 0
        ? losingTrades.reduce((sum, trade) => sum + trade.pnl, 0) /
          losingTrades.length
        : 0;

    const bestTrade =
      enrichedTrades.length > 0
        ? enrichedTrades.reduce((best, trade) =>
            trade.pnl > best.pnl ? trade : best
          )
        : null;

    const worstTrade =
      enrichedTrades.length > 0
        ? enrichedTrades.reduce((worst, trade) =>
            trade.pnl < worst.pnl ? trade : worst
          )
        : null;

    const buyTrades = enrichedTrades.filter((trade) => trade.side === 'BUY');
    const sellTrades = enrichedTrades.filter((trade) => trade.side === 'SELL');

    const buyPL = buyTrades.reduce((sum, trade) => sum + trade.pnl, 0);
    const sellPL = sellTrades.reduce((sum, trade) => sum + trade.pnl, 0);

    const todayTrades = enrichedTrades.filter((trade) =>
      isToday(trade.timestamp || trade.date)
    );

    const stockMap: Record<string, StockPL> = {};

    enrichedTrades.forEach((trade) => {
      if (!stockMap[trade.symbol]) {
        stockMap[trade.symbol] = {
          symbol: trade.symbol,
          trades: 0,
          pnl: 0,
          brokerage: 0,
          wins: 0,
          losses: 0,
        };
      }

      stockMap[trade.symbol].trades += 1;
      stockMap[trade.symbol].pnl += trade.pnl;
      stockMap[trade.symbol].brokerage += Number(trade.brokerage || 0);

      if (trade.pnl > 0) stockMap[trade.symbol].wins += 1;
      if (trade.pnl < 0) stockMap[trade.symbol].losses += 1;
    });

    const stockWise = Object.values(stockMap).sort((a, b) => b.pnl - a.pnl);

    const mostTradedStock =
      stockWise.length > 0
        ? [...stockWise].sort((a, b) => b.trades - a.trades)[0]
        : null;

    const grossProfit = winningTrades.reduce(
      (sum, trade) => sum + trade.pnl,
      0
    );

    const grossLoss = Math.abs(
      losingTrades.reduce((sum, trade) => sum + trade.pnl, 0)
    );

    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : 0;

    return {
      totalTrades,
      enrichedTrades,
      netPL,
      dailyPL,
      totalBrokerage,
      winningTrades,
      losingTrades,
      breakEvenTrades,
      winRate,
      lossRate,
      averageWin,
      averageLoss,
      bestTrade,
      worstTrade,
      buyTrades,
      sellTrades,
      buyPL,
      sellPL,
      todayTrades,
      stockWise,
      mostTradedStock,
      profitFactor,
    };
  }, [trades, dailyPL]);

  const signalAnalytics = useMemo(() => {
    const totalSignals = trackedSignals.length;

    const activeSignals = trackedSignals.filter(
      (signal) => !isCompletedSignal(signal.lifecycleStatus)
    );

    const completedSignals = trackedSignals.filter((signal) =>
      isCompletedSignal(signal.lifecycleStatus)
    );

    const targetHitSignals = trackedSignals.filter((signal) =>
      isTargetHit(signal.lifecycleStatus)
    );

    const stopLossSignals = trackedSignals.filter((signal) =>
      isStopLossHit(signal.lifecycleStatus)
    );

    const expiredSignals = trackedSignals.filter(
      (signal) => signal.lifecycleStatus === 'EXPIRED'
    );

    const triggeredSignals = trackedSignals.filter(
      (signal) => signal.lifecycleStatus === 'TRIGGERED'
    );

    const buySignals = trackedSignals.filter((signal) => signal.side === 'BUY');
    const sellSignals = trackedSignals.filter(
      (signal) => signal.side === 'SELL'
    );

    const buyTargetHits = buySignals.filter((signal) =>
      isTargetHit(signal.lifecycleStatus)
    );

    const buyStopLossHits = buySignals.filter((signal) =>
      isStopLossHit(signal.lifecycleStatus)
    );

    const sellTargetHits = sellSignals.filter((signal) =>
      isTargetHit(signal.lifecycleStatus)
    );

    const sellStopLossHits = sellSignals.filter((signal) =>
      isStopLossHit(signal.lifecycleStatus)
    );

    const completedForAccuracy = trackedSignals.filter(
      (signal) =>
        isTargetHit(signal.lifecycleStatus) ||
        isStopLossHit(signal.lifecycleStatus)
    );

    const targetHitRate =
      completedForAccuracy.length > 0
        ? (targetHitSignals.length / completedForAccuracy.length) * 100
        : 0;

    const stopLossRate =
      completedForAccuracy.length > 0
        ? (stopLossSignals.length / completedForAccuracy.length) * 100
        : 0;

    const buyCompletedForAccuracy = buySignals.filter(
      (signal) =>
        isTargetHit(signal.lifecycleStatus) ||
        isStopLossHit(signal.lifecycleStatus)
    );

    const sellCompletedForAccuracy = sellSignals.filter(
      (signal) =>
        isTargetHit(signal.lifecycleStatus) ||
        isStopLossHit(signal.lifecycleStatus)
    );

    const buyAccuracy =
      buyCompletedForAccuracy.length > 0
        ? (buyTargetHits.length / buyCompletedForAccuracy.length) * 100
        : 0;

    const sellAccuracy =
      sellCompletedForAccuracy.length > 0
        ? (sellTargetHits.length / sellCompletedForAccuracy.length) * 100
        : 0;

    const savedToJournal = trackedSignals.filter(
      (signal) => signal.savedToJournal
    );

    const signalsWithScore = trackedSignals.filter(
      (signal) => signal.sentiment?.signalScore !== undefined
    );

    const averageSignalScore =
      signalsWithScore.length > 0
        ? signalsWithScore.reduce(
            (sum, signal) => sum + Number(signal.sentiment?.signalScore || 0),
            0
          ) / signalsWithScore.length
        : 0;

    const winningSignalsWithScore = targetHitSignals.filter(
      (signal) => signal.sentiment?.signalScore !== undefined
    );

    const losingSignalsWithScore = stopLossSignals.filter(
      (signal) => signal.sentiment?.signalScore !== undefined
    );

    const averageWinningSignalScore =
      winningSignalsWithScore.length > 0
        ? winningSignalsWithScore.reduce(
            (sum, signal) => sum + Number(signal.sentiment?.signalScore || 0),
            0
          ) / winningSignalsWithScore.length
        : 0;

    const averageLosingSignalScore =
      losingSignalsWithScore.length > 0
        ? losingSignalsWithScore.reduce(
            (sum, signal) => sum + Number(signal.sentiment?.signalScore || 0),
            0
          ) / losingSignalsWithScore.length
        : 0;

    const symbolMap: Record<
      string,
      {
        symbol: string;
        total: number;
        targetHits: number;
        stopLossHits: number;
        active: number;
      }
    > = {};

    trackedSignals.forEach((signal) => {
      if (!symbolMap[signal.symbol]) {
        symbolMap[signal.symbol] = {
          symbol: signal.symbol,
          total: 0,
          targetHits: 0,
          stopLossHits: 0,
          active: 0,
        };
      }

      symbolMap[signal.symbol].total += 1;

      if (isTargetHit(signal.lifecycleStatus)) {
        symbolMap[signal.symbol].targetHits += 1;
      } else if (isStopLossHit(signal.lifecycleStatus)) {
        symbolMap[signal.symbol].stopLossHits += 1;
      } else if (!isCompletedSignal(signal.lifecycleStatus)) {
        symbolMap[signal.symbol].active += 1;
      }
    });

    const symbolAccuracy = Object.values(symbolMap).sort(
      (a, b) => b.targetHits - a.targetHits
    );

    const recentSignals = [...trackedSignals]
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
      .slice(0, 5);

    return {
      totalSignals,
      activeSignals,
      completedSignals,
      targetHitSignals,
      stopLossSignals,
      expiredSignals,
      triggeredSignals,
      buySignals,
      sellSignals,
      buyTargetHits,
      buyStopLossHits,
      sellTargetHits,
      sellStopLossHits,
      targetHitRate,
      stopLossRate,
      buyAccuracy,
      sellAccuracy,
      savedToJournal,
      averageSignalScore,
      averageWinningSignalScore,
      averageLosingSignalScore,
      symbolAccuracy,
      recentSignals,
    };
  }, [trackedSignals]);

  const factorAnalytics = useMemo(() => {
    // Same convention as signalAnalytics.targetHitRate: only signals that
    // actually resolved (target or stop-loss hit) count toward win rate.
    // EXPIRED/active signals are excluded as inconclusive.
    const completed = trackedSignals.filter(
      (signal) =>
        (signal.side === 'BUY' || signal.side === 'SELL') &&
        (isTargetHit(signal.lifecycleStatus) ||
          isStopLossHit(signal.lifecycleStatus))
    );

    const factorRows = FACTOR_DEFINITIONS.map((factor) => {
      const withFactor = completed.filter((signal) =>
        factor.phrases.some((phrase) =>
          (signal.reasons || []).includes(phrase)
        )
      );
      const withoutFactor = completed.filter(
        (signal) =>
          !factor.phrases.some((phrase) =>
            (signal.reasons || []).includes(phrase)
          )
      );

      const withWins = withFactor.filter((s) =>
        isTargetHit(s.lifecycleStatus)
      ).length;
      const withoutWins = withoutFactor.filter((s) =>
        isTargetHit(s.lifecycleStatus)
      ).length;

      return {
        key: factor.key,
        label: factor.label,
        withCount: withFactor.length,
        withWinRate:
          withFactor.length > 0 ? (withWins / withFactor.length) * 100 : 0,
        withoutCount: withoutFactor.length,
        withoutWinRate:
          withoutFactor.length > 0
            ? (withoutWins / withoutFactor.length) * 100
            : 0,
      };
    });

    const scoreBuckets = [
      { label: '6-7 (borderline)', min: 6, max: 7 },
      { label: '8-9 (STRONG)', min: 8, max: 9 },
      { label: '10-12 (STRONG + index boost)', min: 10, max: 12 },
    ];

    const scoreRows = scoreBuckets.map((bucket) => {
      const inBucket = completed.filter((signal) => {
        const score = getTechnicalScore(signal);
        return score !== null && score >= bucket.min && score <= bucket.max;
      });
      const wins = inBucket.filter((s) =>
        isTargetHit(s.lifecycleStatus)
      ).length;

      return {
        label: bucket.label,
        count: inBucket.length,
        winRate: inBucket.length > 0 ? (wins / inBucket.length) * 100 : 0,
      };
    });

    return {
      totalCompleted: completed.length,
      factorRows,
      scoreRows,
    };
  }, [trackedSignals]);

  const netTone = tradeAnalytics.netPL >= 0 ? 'green' : 'red';
  const todayTone = tradeAnalytics.dailyPL >= 0 ? 'green' : 'red';

  return (
    <main className="min-h-screen bg-[#050608] px-5 pb-28 pt-8 text-white">
      <div className="mx-auto max-w-4xl">
        <div>
          <h1 className="text-4xl font-bold">Analytics</h1>
          <p className="mt-2 text-slate-400">
            Review trade performance, signal accuracy, and discipline.
          </p>
        </div>

        <section className="mt-8">
          <SectionTitle title="Trade Performance" />

          {tradeAnalytics.totalTrades === 0 ? (
            <div className="rounded-3xl border border-slate-800 bg-[#15161b] p-6 text-slate-400">
              No trades yet. Save a completed signal to journal or add a trade
              manually to see trade analytics.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <MetricCard
                  title="Net P/L"
                  value={formatCurrency(tradeAnalytics.netPL)}
                  subtitle={`${tradeAnalytics.totalTrades} total trades`}
                  icon={<Wallet className="h-5 w-5" />}
                  tone={netTone}
                />

                <MetricCard
                  title="Today's P/L"
                  value={formatCurrency(tradeAnalytics.dailyPL)}
                  subtitle={`${tradeAnalytics.todayTrades.length} trades today`}
                  icon={<CalendarDays className="h-5 w-5" />}
                  tone={todayTone}
                />

                <MetricCard
                  title="Win Rate"
                  value={formatPercent(tradeAnalytics.winRate)}
                  subtitle={`${tradeAnalytics.winningTrades.length} wins • ${tradeAnalytics.losingTrades.length} losses`}
                  icon={<Target className="h-5 w-5" />}
                  tone={
                    tradeAnalytics.winRate >= 55
                      ? 'green'
                      : tradeAnalytics.winRate >= 40
                      ? 'yellow'
                      : 'red'
                  }
                />

                <MetricCard
                  title="Profit Factor"
                  value={
                    tradeAnalytics.profitFactor
                      ? tradeAnalytics.profitFactor.toFixed(2)
                      : '0.00'
                  }
                  subtitle="Gross profit / gross loss"
                  icon={<Activity className="h-5 w-5" />}
                  tone={
                    tradeAnalytics.profitFactor >= 1.5
                      ? 'green'
                      : tradeAnalytics.profitFactor >= 1
                      ? 'yellow'
                      : 'red'
                  }
                />
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <MetricCard
                  title="Average Win"
                  value={formatCurrency(tradeAnalytics.averageWin)}
                  subtitle={`${tradeAnalytics.winningTrades.length} winning trades`}
                  icon={<ArrowUpRight className="h-5 w-5" />}
                  tone="green"
                />

                <MetricCard
                  title="Average Loss"
                  value={formatCurrency(tradeAnalytics.averageLoss)}
                  subtitle={`${tradeAnalytics.losingTrades.length} losing trades`}
                  icon={<ArrowDownRight className="h-5 w-5" />}
                  tone="red"
                />

                <MetricCard
                  title="Best Trade"
                  value={
                    tradeAnalytics.bestTrade
                      ? formatCurrency(tradeAnalytics.bestTrade.pnl)
                      : '₹0.00'
                  }
                  subtitle={
                    tradeAnalytics.bestTrade
                      ? `${tradeAnalytics.bestTrade.symbol} • ${tradeAnalytics.bestTrade.side}`
                      : 'No trade'
                  }
                  icon={<TrendingUp className="h-5 w-5" />}
                  tone="green"
                />

                <MetricCard
                  title="Worst Trade"
                  value={
                    tradeAnalytics.worstTrade
                      ? formatCurrency(tradeAnalytics.worstTrade.pnl)
                      : '₹0.00'
                  }
                  subtitle={
                    tradeAnalytics.worstTrade
                      ? `${tradeAnalytics.worstTrade.symbol} • ${tradeAnalytics.worstTrade.side}`
                      : 'No trade'
                  }
                  icon={<TrendingDown className="h-5 w-5" />}
                  tone="red"
                />
              </div>

              <div className="mt-4 rounded-3xl border border-slate-800 bg-[#15161b] p-5">
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div>
                    <p className="text-sm text-slate-500">Total Trades</p>
                    <p className="mt-1 text-2xl font-bold text-white">
                      {tradeAnalytics.totalTrades}
                    </p>
                  </div>

                  <div>
                    <p className="text-sm text-slate-500">BUY Trades</p>
                    <p className="mt-1 text-2xl font-bold text-green-400">
                      {tradeAnalytics.buyTrades.length}
                    </p>
                    <p className="text-xs text-slate-500">
                      P/L <PLText value={tradeAnalytics.buyPL} />
                    </p>
                  </div>

                  <div>
                    <p className="text-sm text-slate-500">SELL Trades</p>
                    <p className="mt-1 text-2xl font-bold text-red-400">
                      {tradeAnalytics.sellTrades.length}
                    </p>
                    <p className="text-xs text-slate-500">
                      P/L <PLText value={tradeAnalytics.sellPL} />
                    </p>
                  </div>

                  <div>
                    <p className="text-sm text-slate-500">Brokerage</p>
                    <p className="mt-1 text-2xl font-bold text-white">
                      {formatCurrency(tradeAnalytics.totalBrokerage)}
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}
        </section>



        <JournalPatternAnalytics />

        <section className="mt-10">
          <SectionTitle
            title="Signal Accuracy"
            subtitle="Based on tracked signals from the Signals page."
          />

          {signalAnalytics.totalSignals === 0 ? (
            <div className="rounded-3xl border border-slate-800 bg-[#15161b] p-6 text-slate-400">
              No tracked signals yet. Go to Signals, tap “Track Signal”, then
              come back here to see accuracy analytics.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <MetricCard
                  title="Tracked Signals"
                  value={String(signalAnalytics.totalSignals)}
                  subtitle={`${signalAnalytics.activeSignals.length} active • ${signalAnalytics.completedSignals.length} completed`}
                  icon={<Radar className="h-5 w-5" />}
                  tone="blue"
                />

                <MetricCard
                  title="Target Hit Rate"
                  value={formatPercent(signalAnalytics.targetHitRate)}
                  subtitle={`${signalAnalytics.targetHitSignals.length} target hits • ${signalAnalytics.stopLossSignals.length} SL hits`}
                  icon={<CheckCircle2 className="h-5 w-5" />}
                  tone={
                    signalAnalytics.targetHitRate >= 60
                      ? 'green'
                      : signalAnalytics.targetHitRate >= 40
                      ? 'yellow'
                      : 'red'
                  }
                />

                <MetricCard
                  title="Stop Loss Rate"
                  value={formatPercent(signalAnalytics.stopLossRate)}
                  subtitle={`${signalAnalytics.stopLossSignals.length} stop loss hits`}
                  icon={<XCircle className="h-5 w-5" />}
                  tone={
                    signalAnalytics.stopLossRate <= 35
                      ? 'green'
                      : signalAnalytics.stopLossRate <= 55
                      ? 'yellow'
                      : 'red'
                  }
                />

                <MetricCard
                  title="Saved to Journal"
                  value={String(signalAnalytics.savedToJournal.length)}
                  subtitle="Tracked signals converted to trades"
                  icon={<BarChart3 className="h-5 w-5" />}
                  tone="neutral"
                />
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <MetricCard
                  title="BUY Accuracy"
                  value={formatPercent(signalAnalytics.buyAccuracy)}
                  subtitle={`${signalAnalytics.buyTargetHits.length} target hits • ${signalAnalytics.buyStopLossHits.length} SL hits`}
                  icon={<TrendingUp className="h-5 w-5" />}
                  tone={
                    signalAnalytics.buyAccuracy >= 60
                      ? 'green'
                      : signalAnalytics.buyAccuracy >= 40
                      ? 'yellow'
                      : 'red'
                  }
                />

                <MetricCard
                  title="SELL Accuracy"
                  value={formatPercent(signalAnalytics.sellAccuracy)}
                  subtitle={`${signalAnalytics.sellTargetHits.length} target hits • ${signalAnalytics.sellStopLossHits.length} SL hits`}
                  icon={<TrendingDown className="h-5 w-5" />}
                  tone={
                    signalAnalytics.sellAccuracy >= 60
                      ? 'green'
                      : signalAnalytics.sellAccuracy >= 40
                      ? 'yellow'
                      : 'red'
                  }
                />

                <MetricCard
                  title="Avg Signal Score"
                  value={`${signalAnalytics.averageSignalScore.toFixed(1)}/100`}
                  subtitle="Average AI score for tracked signals"
                  icon={<PieChart className="h-5 w-5" />}
                  tone="blue"
                />

                <MetricCard
                  title="Winning Signal Score"
                  value={`${signalAnalytics.averageWinningSignalScore.toFixed(
                    1
                  )}/100`}
                  subtitle={`Losing avg: ${signalAnalytics.averageLosingSignalScore.toFixed(
                    1
                  )}/100`}
                  icon={<Target className="h-5 w-5" />}
                  tone="green"
                />
              </div>

              <div className="mt-4 rounded-3xl border border-slate-800 bg-[#15161b] p-5">
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div>
                    <p className="text-sm text-slate-500">Waiting</p>
                    <p className="mt-1 text-2xl font-bold text-yellow-300">
                      {
                        signalAnalytics.activeSignals.filter(
                          (s) => s.lifecycleStatus === 'WAITING'
                        ).length
                      }
                    </p>
                  </div>

                  <div>
                    <p className="text-sm text-slate-500">Triggered</p>
                    <p className="mt-1 text-2xl font-bold text-blue-400">
                      {signalAnalytics.triggeredSignals.length}
                    </p>
                  </div>

                  <div>
                    <p className="text-sm text-slate-500">Target Hits</p>
                    <p className="mt-1 text-2xl font-bold text-green-400">
                      {signalAnalytics.targetHitSignals.length}
                    </p>
                  </div>

                  <div>
                    <p className="text-sm text-slate-500">Expired</p>
                    <p className="mt-1 text-2xl font-bold text-slate-300">
                      {signalAnalytics.expiredSignals.length}
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}
        </section>

        {factorAnalytics.totalCompleted > 0 && (
          <section className="mt-10">
            <SectionTitle title="Signal Factor Win Rate (Beta)" />
            <p className="mb-4 text-sm text-slate-500">
              Based on {factorAnalytics.totalCompleted} completed signals
              (target hit or stop-loss hit). Small sample sizes early on --
              treat as directional, not conclusive, until this grows.
            </p>

            <div className="space-y-3">
              {factorAnalytics.factorRows.map((row) => (
                <div
                  key={row.key}
                  className="rounded-3xl border border-slate-800 bg-[#15161b] p-5"
                >
                  <h3 className="text-base font-bold text-white">
                    {row.label}
                  </h3>
                  <div className="mt-3 grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-slate-500">
                        Present ({row.withCount})
                      </p>
                      <p
                        className={`mt-1 text-xl font-bold ${
                          row.withWinRate >= 60
                            ? 'text-green-400'
                            : row.withWinRate >= 40
                            ? 'text-yellow-400'
                            : 'text-red-400'
                        }`}
                      >
                        {row.withCount > 0
                          ? formatPercent(row.withWinRate)
                          : '--'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">
                        Absent ({row.withoutCount})
                      </p>
                      <p
                        className={`mt-1 text-xl font-bold ${
                          row.withoutWinRate >= 60
                            ? 'text-green-400'
                            : row.withoutWinRate >= 40
                            ? 'text-yellow-400'
                            : 'text-red-400'
                        }`}
                      >
                        {row.withoutCount > 0
                          ? formatPercent(row.withoutWinRate)
                          : '--'}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <h3 className="mb-3 mt-8 text-sm uppercase tracking-[0.25em] text-slate-500">
              Win Rate by Technical Score
            </h3>
            <div className="space-y-3">
              {factorAnalytics.scoreRows.map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between rounded-3xl border border-slate-800 bg-[#15161b] p-5"
                >
                  <p className="text-sm text-slate-400">
                    {row.label} ({row.count})
                  </p>
                  <p
                    className={`text-xl font-bold ${
                      row.winRate >= 60
                        ? 'text-green-400'
                        : row.winRate >= 40
                        ? 'text-yellow-400'
                        : 'text-red-400'
                    }`}
                  >
                    {row.count > 0 ? formatPercent(row.winRate) : '--'}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {signalAnalytics.symbolAccuracy.length > 0 && (
          <section className="mt-10">
            <SectionTitle title="Signal Accuracy by Symbol" />

            <div className="space-y-3">
              {signalAnalytics.symbolAccuracy.map((item) => {
                const completed = item.targetHits + item.stopLossHits;
                const accuracy =
                  completed > 0 ? (item.targetHits / completed) * 100 : 0;

                return (
                  <div
                    key={item.symbol}
                    className="rounded-3xl border border-slate-800 bg-[#15161b] p-5"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <h3 className="text-xl font-bold text-white">
                          {item.symbol}
                        </h3>
                        <p className="mt-1 text-sm text-slate-500">
                          {item.total} tracked • {item.active} active
                        </p>
                      </div>

                      <p
                        className={`text-xl font-bold ${
                          accuracy >= 60
                            ? 'text-green-400'
                            : accuracy >= 40
                            ? 'text-yellow-400'
                            : 'text-red-400'
                        }`}
                      >
                        {formatPercent(accuracy)}
                      </p>
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                      <div className="rounded-2xl bg-black/30 p-3">
                        <p className="text-slate-500">Target Hits</p>
                        <p className="font-bold text-green-400">
                          {item.targetHits}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-black/30 p-3">
                        <p className="text-slate-500">SL Hits</p>
                        <p className="font-bold text-red-400">
                          {item.stopLossHits}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-black/30 p-3">
                        <p className="text-slate-500">Active</p>
                        <p className="font-bold text-blue-400">{item.active}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {tradeAnalytics.stockWise.length > 0 && (
          <section className="mt-10">
            <SectionTitle
              title="Stock-wise Trade P/L"
              subtitle={
                tradeAnalytics.mostTradedStock
                  ? `Most traded: ${tradeAnalytics.mostTradedStock.symbol} (${tradeAnalytics.mostTradedStock.trades} trades)`
                  : undefined
              }
            />

            <div className="space-y-3">
              {tradeAnalytics.stockWise.map((stock) => {
                const winRate =
                  stock.trades > 0 ? (stock.wins / stock.trades) * 100 : 0;

                return (
                  <div
                    key={stock.symbol}
                    className="rounded-3xl border border-slate-800 bg-[#15161b] p-5"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <h3 className="text-xl font-bold text-white">
                          {stock.symbol}
                        </h3>
                        <p className="mt-1 text-sm text-slate-500">
                          {stock.trades} trades • Win rate{' '}
                          {formatPercent(winRate)}
                        </p>
                      </div>

                      <p
                        className={`text-xl font-bold ${
                          stock.pnl >= 0 ? 'text-green-400' : 'text-red-400'
                        }`}
                      >
                        {formatCurrency(stock.pnl)}
                      </p>
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                      <div className="rounded-2xl bg-black/30 p-3">
                        <p className="text-slate-500">Wins</p>
                        <p className="font-bold text-green-400">
                          {stock.wins}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-black/30 p-3">
                        <p className="text-slate-500">Losses</p>
                        <p className="font-bold text-red-400">
                          {stock.losses}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-black/30 p-3">
                        <p className="text-slate-500">Brokerage</p>
                        <p className="font-bold text-white">
                          {formatCurrency(stock.brokerage)}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {signalAnalytics.recentSignals.length > 0 && (
          <section className="mt-10">
            <SectionTitle title="Recent Tracked Signals" />

            <div className="space-y-3">
              {signalAnalytics.recentSignals.map((signal) => (
                <div
                  key={signal.id}
                  className="rounded-3xl border border-slate-800 bg-[#15161b] p-5"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-bold text-white">
                          {signal.symbol}
                        </h3>

                        <span
                          className={`rounded-full px-3 py-1 text-xs font-bold ${
                            signal.side === 'BUY'
                              ? 'bg-green-500/15 text-green-400'
                              : signal.side === 'SELL'
                              ? 'bg-red-500/15 text-red-400'
                              : 'bg-slate-700 text-slate-300'
                          }`}
                        >
                          {signal.side}
                        </span>

                        <SignalStatusBadge status={signal.lifecycleStatus} />
                      </div>

                      <p className="mt-2 text-sm text-slate-500">
                        Entry {formatCurrency(signal.entry)} • SL{' '}
                        {formatCurrency(signal.stopLoss)} • T1{' '}
                        {formatCurrency(signal.target1)}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-sm text-slate-500">Score</p>
                      <p className="font-bold text-white">
                        {signal.sentiment?.signalScore ?? '--'}/100
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                    <Clock className="h-4 w-4" />
                    {new Date(signal.createdAt).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="mt-8 rounded-2xl border border-yellow-500/20 bg-yellow-500/10 p-4 text-sm text-yellow-200">
          Analytics are for journaling and education only. Signal accuracy is
          based on locally tracked signals and does not guarantee future
          performance.
        </div>
      </div>
    </main>
  );
}
