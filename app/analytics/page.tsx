'use client';

import { useMemo } from 'react';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  IndianRupee,
  PieChart,
  ShieldAlert,
  Target,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { useApp } from '@/contexts/AppContext';

type StockPL = {
  symbol: string;
  trades: number;
  pnl: number;
  brokerage: number;
  wins: number;
  losses: number;
};

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
  icon: React.ReactNode;
  tone?: 'green' | 'red' | 'yellow' | 'neutral';
}) {
  const toneClass =
    tone === 'green'
      ? 'text-green-400'
      : tone === 'red'
      ? 'text-red-400'
      : tone === 'yellow'
      ? 'text-yellow-400'
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

export default function AnalyticsPage() {
  const { trades, dailyPL } = useApp();

  const analytics = useMemo(() => {
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

  const netTone = analytics.netPL >= 0 ? 'green' : 'red';
  const todayTone = analytics.dailyPL >= 0 ? 'green' : 'red';

  return (
    <main className="min-h-screen bg-[#050608] px-5 pb-28 pt-8 text-white">
      <div className="mx-auto max-w-4xl">
        <div>
          <h1 className="text-4xl font-bold">Analytics</h1>
          <p className="mt-2 text-slate-400">
            Review your trading performance, discipline, and stock-wise results.
          </p>
        </div>

        {analytics.totalTrades === 0 ? (
          <div className="mt-8 rounded-3xl border border-slate-800 bg-[#15161b] p-6 text-slate-400">
            No trades yet. Save a completed signal to journal or add a trade
            manually to see analytics.
          </div>
        ) : (
          <>
            <section className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <MetricCard
                title="Net P/L"
                value={formatCurrency(analytics.netPL)}
                subtitle={`${analytics.totalTrades} total trades`}
                icon={<Wallet className="h-5 w-5" />}
                tone={netTone}
              />

              <MetricCard
                title="Today's P/L"
                value={formatCurrency(analytics.dailyPL)}
                subtitle={`${analytics.todayTrades.length} trades today`}
                icon={<CalendarDays className="h-5 w-5" />}
                tone={todayTone}
              />

              <MetricCard
                title="Win Rate"
                value={formatPercent(analytics.winRate)}
                subtitle={`${analytics.winningTrades.length} wins • ${analytics.losingTrades.length} losses`}
                icon={<Target className="h-5 w-5" />}
                tone={
                  analytics.winRate >= 55
                    ? 'green'
                    : analytics.winRate >= 40
                    ? 'yellow'
                    : 'red'
                }
              />

              <MetricCard
                title="Profit Factor"
                value={
                  analytics.profitFactor
                    ? analytics.profitFactor.toFixed(2)
                    : '0.00'
                }
                subtitle="Gross profit / gross loss"
                icon={<Activity className="h-5 w-5" />}
                tone={
                  analytics.profitFactor >= 1.5
                    ? 'green'
                    : analytics.profitFactor >= 1
                    ? 'yellow'
                    : 'red'
                }
              />
            </section>

            <section className="mt-8">
              <SectionTitle title="Performance Summary" />

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <MetricCard
                  title="Average Win"
                  value={formatCurrency(analytics.averageWin)}
                  subtitle={`${analytics.winningTrades.length} winning trades`}
                  icon={<ArrowUpRight className="h-5 w-5" />}
                  tone="green"
                />

                <MetricCard
                  title="Average Loss"
                  value={formatCurrency(analytics.averageLoss)}
                  subtitle={`${analytics.losingTrades.length} losing trades`}
                  icon={<ArrowDownRight className="h-5 w-5" />}
                  tone="red"
                />

                <MetricCard
                  title="Best Trade"
                  value={
                    analytics.bestTrade
                      ? formatCurrency(analytics.bestTrade.pnl)
                      : '₹0.00'
                  }
                  subtitle={
                    analytics.bestTrade
                      ? `${analytics.bestTrade.symbol} • ${analytics.bestTrade.side}`
                      : 'No trade'
                  }
                  icon={<TrendingUp className="h-5 w-5" />}
                  tone="green"
                />

                <MetricCard
                  title="Worst Trade"
                  value={
                    analytics.worstTrade
                      ? formatCurrency(analytics.worstTrade.pnl)
                      : '₹0.00'
                  }
                  subtitle={
                    analytics.worstTrade
                      ? `${analytics.worstTrade.symbol} • ${analytics.worstTrade.side}`
                      : 'No trade'
                  }
                  icon={<TrendingDown className="h-5 w-5" />}
                  tone="red"
                />
              </div>
            </section>

            <section className="mt-8">
              <SectionTitle title="Trade Breakdown" />

              <div className="rounded-3xl border border-slate-800 bg-[#15161b] p-5">
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div>
                    <p className="text-sm text-slate-500">Total Trades</p>
                    <p className="mt-1 text-2xl font-bold text-white">
                      {analytics.totalTrades}
                    </p>
                  </div>

                  <div>
                    <p className="text-sm text-slate-500">BUY Trades</p>
                    <p className="mt-1 text-2xl font-bold text-green-400">
                      {analytics.buyTrades.length}
                    </p>
                    <p className="text-xs text-slate-500">
                      P/L <PLText value={analytics.buyPL} />
                    </p>
                  </div>

                  <div>
                    <p className="text-sm text-slate-500">SELL Trades</p>
                    <p className="mt-1 text-2xl font-bold text-red-400">
                      {analytics.sellTrades.length}
                    </p>
                    <p className="text-xs text-slate-500">
                      P/L <PLText value={analytics.sellPL} />
                    </p>
                  </div>

                  <div>
                    <p className="text-sm text-slate-500">Brokerage</p>
                    <p className="mt-1 text-2xl font-bold text-white">
                      {formatCurrency(analytics.totalBrokerage)}
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <section className="mt-8">
              <SectionTitle
                title="Stock-wise P/L"
                subtitle={
                  analytics.mostTradedStock
                    ? `Most traded: ${analytics.mostTradedStock.symbol} (${analytics.mostTradedStock.trades} trades)`
                    : undefined
                }
              />

              <div className="space-y-3">
                {analytics.stockWise.map((stock) => {
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

            <section className="mt-8">
              <SectionTitle title="Recent Trades" />

              <div className="space-y-3">
                {analytics.enrichedTrades.slice(0, 5).map((trade) => (
                  <div
                    key={trade.id}
                    className="rounded-3xl border border-slate-800 bg-[#15161b] p-5"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg font-bold text-white">
                            {trade.symbol}
                          </h3>
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-bold ${
                              trade.side === 'BUY'
                                ? 'bg-green-500/15 text-green-400'
                                : 'bg-red-500/15 text-red-400'
                            }`}
                          >
                            {trade.side}
                          </span>
                        </div>

                        <p className="mt-1 text-sm text-slate-500">
                          Entry ₹{trade.entryPrice} → Exit ₹{trade.exitPrice} •
                          Qty {trade.quantity}
                        </p>
                      </div>

                      <p
                        className={`text-lg font-bold ${
                          trade.pnl >= 0 ? 'text-green-400' : 'text-red-400'
                        }`}
                      >
                        {formatCurrency(trade.pnl)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        <div className="mt-8 rounded-2xl border border-yellow-500/20 bg-yellow-500/10 p-4 text-sm text-yellow-200">
          Analytics are for journaling and education only. They do not guarantee
          future performance.
        </div>
      </div>
    </main>
  );
}