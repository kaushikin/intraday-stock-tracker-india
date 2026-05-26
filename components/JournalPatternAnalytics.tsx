'use client';

import { useMemo, type ReactNode } from 'react';
import { useApp, type Trade } from '@/contexts/AppContext';
import {
  AlertTriangle,
  Brain,
  Flame,
  PieChart,
  Target,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';

type PatternRow = {
  name: string;
  trades: number;
  pnl: number;
  wins: number;
  losses: number;
  winRate: number;
  averagePL: number;
};

function getTradePL(trade: Trade) {
  const gross =
    trade.side === 'BUY'
      ? (trade.exitPrice - trade.entryPrice) * trade.quantity
      : (trade.entryPrice - trade.exitPrice) * trade.quantity;

  return gross - trade.brokerage;
}

function formatCurrency(value: number) {
  const sign = value < 0 ? '-' : '';
  return `${sign}₹${Math.abs(value).toFixed(2)}`;
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) return '0%';
  return `${value.toFixed(1)}%`;
}

function buildPatternRows(
  trades: Trade[],
  key: 'setup' | 'emotion' | 'mistake'
): PatternRow[] {
  const map: Record<string, PatternRow> = {};

  for (const trade of trades) {
    const rawValue = trade[key];
    const name = rawValue && rawValue.trim() ? rawValue.trim() : 'Not tagged';
    const pnl = getTradePL(trade);

    if (!map[name]) {
      map[name] = {
        name,
        trades: 0,
        pnl: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        averagePL: 0,
      };
    }

    map[name].trades += 1;
    map[name].pnl += pnl;

    if (pnl > 0) map[name].wins += 1;
    if (pnl < 0) map[name].losses += 1;
  }

  return Object.values(map)
    .map((row) => ({
      ...row,
      winRate: row.trades > 0 ? (row.wins / row.trades) * 100 : 0,
      averagePL: row.trades > 0 ? row.pnl / row.trades : 0,
    }))
    .sort((a, b) => b.pnl - a.pnl);
}

function Card({
  title,
  value,
  subtitle,
  icon,
  tone = 'neutral',
}: {
  title: string;
  value: string;
  subtitle: string;
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
    <div className="rounded-3xl border border-slate-800 bg-[#15161b] p-5">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs uppercase tracking-wide text-slate-500">
          {title}
        </p>

        <div className="rounded-2xl bg-black/30 p-3 text-slate-400">
          {icon}
        </div>
      </div>

      <p className={`text-2xl font-bold ${toneClass}`}>{value}</p>
      <p className="mt-2 text-sm text-slate-500">{subtitle}</p>
    </div>
  );
}

function PatternTable({
  title,
  subtitle,
  rows,
}: {
  title: string;
  subtitle: string;
  rows: PatternRow[];
}) {
  return (
    <div className="rounded-3xl border border-slate-800 bg-[#15161b] p-5">
      <div className="mb-4">
        <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-slate-400">
          {title}
        </h3>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      </div>

      {rows.length > 0 ? (
        <div className="space-y-3">
          {rows.map((row) => {
            const positive = row.pnl >= 0;

            return (
              <div
                key={row.name}
                className="rounded-2xl border border-slate-800 bg-black/20 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-white">{row.name}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {row.trades} trades • {row.wins} wins • {row.losses}{' '}
                      losses
                    </p>
                  </div>

                  <div className="text-right">
                    <p
                      className={`font-mono text-lg font-bold ${
                        positive ? 'text-green-400' : 'text-red-400'
                      }`}
                    >
                      {positive ? '+' : ''}
                      {formatCurrency(row.pnl)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Avg {formatCurrency(row.averagePL)}
                    </p>
                  </div>
                </div>

                <div className="mt-3">
                  <div className="mb-1 flex justify-between text-xs text-slate-500">
                    <span>Win Rate</span>
                    <span>{formatPercent(row.winRate)}</span>
                  </div>

                  <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                    <div
                      className={`h-full rounded-full ${
                        row.winRate >= 60
                          ? 'bg-green-500'
                          : row.winRate >= 40
                          ? 'bg-yellow-500'
                          : 'bg-red-500'
                      }`}
                      style={{ width: `${Math.min(100, row.winRate)}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-800 p-6 text-center text-sm text-slate-500">
          No tagged trades yet.
        </div>
      )}
    </div>
  );
}

export default function JournalPatternAnalytics() {
  const { trades } = useApp();

  const analytics = useMemo(() => {
    const enriched = trades.map((trade) => ({
      ...trade,
      pnl: getTradePL(trade),
    }));

    const taggedTrades = enriched.filter(
      (trade) => trade.setup || trade.emotion || trade.mistake || trade.notes
    );

    const setupRows = buildPatternRows(trades, 'setup');
    const emotionRows = buildPatternRows(trades, 'emotion');
    const mistakeRows = buildPatternRows(trades, 'mistake');

    const taggedRate =
      trades.length > 0 ? (taggedTrades.length / trades.length) * 100 : 0;

    const bestSetup =
      setupRows.filter((row) => row.name !== 'Not tagged').length > 0
        ? setupRows.filter((row) => row.name !== 'Not tagged')[0]
        : null;

    const worstSetup =
      setupRows.filter((row) => row.name !== 'Not tagged').length > 0
        ? [...setupRows.filter((row) => row.name !== 'Not tagged')].sort(
            (a, b) => a.pnl - b.pnl
          )[0]
        : null;

    const fomoTrades = enriched.filter((trade) => trade.emotion === 'FOMO');
    const revengeTrades = enriched.filter((trade) => trade.emotion === 'Revenge');

    const disciplineMistakes = enriched.filter(
      (trade) =>
        trade.mistake &&
        trade.mistake !== 'None' &&
        trade.mistake !== 'Not tagged'
    );

    const disciplineMistakePL = disciplineMistakes.reduce(
      (sum, trade) => sum + trade.pnl,
      0
    );

    const fomoPL = fomoTrades.reduce((sum, trade) => sum + trade.pnl, 0);
    const revengePL = revengeTrades.reduce((sum, trade) => sum + trade.pnl, 0);

    const mostCommonMistake =
      mistakeRows
        .filter((row) => row.name !== 'None' && row.name !== 'Not tagged')
        .sort((a, b) => b.trades - a.trades)[0] || null;

    return {
      totalTrades: trades.length,
      taggedTrades: taggedTrades.length,
      taggedRate,
      setupRows,
      emotionRows,
      mistakeRows,
      bestSetup,
      worstSetup,
      fomoTrades,
      revengeTrades,
      fomoPL,
      revengePL,
      disciplineMistakes,
      disciplineMistakePL,
      mostCommonMistake,
    };
  }, [trades]);

  if (analytics.totalTrades === 0) {
    return (
      <section className="mt-10">
        <div className="rounded-3xl border border-slate-800 bg-[#15161b] p-6 text-center">
          <Brain className="mx-auto h-10 w-10 text-slate-500" />
          <h2 className="mt-4 text-xl font-bold text-white">
            Journal Pattern Analytics
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            Add trades with setup, emotion, mistake, and notes to unlock
            psychology-based analytics.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="mt-10">
      <div className="mb-4">
        <h2 className="text-sm uppercase tracking-[0.25em] text-slate-500">
          Journal Pattern Analytics
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Understand which setups, emotions, and mistakes affect your P/L.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card
          title="Tagged Trades"
          value={`${analytics.taggedTrades}/${analytics.totalTrades}`}
          subtitle={`${formatPercent(
            analytics.taggedRate
          )} of trades have journal details`}
          icon={<PieChart className="h-5 w-5" />}
          tone={analytics.taggedRate >= 70 ? 'green' : 'yellow'}
        />

        <Card
          title="Best Setup"
          value={analytics.bestSetup?.name || 'Not enough data'}
          subtitle={
            analytics.bestSetup
              ? `${analytics.bestSetup.trades} trades • ${formatCurrency(
                  analytics.bestSetup.pnl
                )}`
              : 'Tag more trades with setup'
          }
          icon={<TrendingUp className="h-5 w-5" />}
          tone="green"
        />

        <Card
          title="Worst Setup"
          value={analytics.worstSetup?.name || 'Not enough data'}
          subtitle={
            analytics.worstSetup
              ? `${analytics.worstSetup.trades} trades • ${formatCurrency(
                  analytics.worstSetup.pnl
                )}`
              : 'Tag more trades with setup'
          }
          icon={<TrendingDown className="h-5 w-5" />}
          tone="red"
        />

        <Card
          title="Most Common Mistake"
          value={analytics.mostCommonMistake?.name || 'None found'}
          subtitle={
            analytics.mostCommonMistake
              ? `${analytics.mostCommonMistake.trades} trades • ${formatCurrency(
                  analytics.mostCommonMistake.pnl
                )}`
              : 'Good. No repeated mistake tagged yet.'
          }
          icon={<AlertTriangle className="h-5 w-5" />}
          tone={analytics.mostCommonMistake ? 'red' : 'green'}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card
          title="FOMO Impact"
          value={formatCurrency(analytics.fomoPL)}
          subtitle={`${analytics.fomoTrades.length} FOMO trades`}
          icon={<Flame className="h-5 w-5" />}
          tone={analytics.fomoPL < 0 ? 'red' : 'green'}
        />

        <Card
          title="Revenge Impact"
          value={formatCurrency(analytics.revengePL)}
          subtitle={`${analytics.revengeTrades.length} revenge trades`}
          icon={<AlertTriangle className="h-5 w-5" />}
          tone={analytics.revengePL < 0 ? 'red' : 'green'}
        />

        <Card
          title="Mistake P/L"
          value={formatCurrency(analytics.disciplineMistakePL)}
          subtitle={`${analytics.disciplineMistakes.length} trades with mistakes`}
          icon={<Target className="h-5 w-5" />}
          tone={analytics.disciplineMistakePL < 0 ? 'red' : 'green'}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-5">
        <PatternTable
          title="P/L by Setup"
          subtitle="Find which trade setups actually work for you."
          rows={analytics.setupRows}
        />

        <PatternTable
          title="P/L by Emotion"
          subtitle="See how your mental state affects performance."
          rows={analytics.emotionRows}
        />

        <PatternTable
          title="P/L by Mistake"
          subtitle="Identify the mistakes costing the most money."
          rows={analytics.mistakeRows}
        />
      </div>
    </section>
  );
}
