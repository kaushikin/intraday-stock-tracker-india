'use client';

import TradeRulesAlert from '@/components/TradeRulesAlert';
import { useState } from 'react';
import Link from 'next/link';
import { useApp } from '@/contexts/AppContext';
import PLProgress from '@/components/PLProgress';
import StockCard from '@/components/StockCard';
import TradeFormModal from '@/components/TradeFormModal';
import { formatCurrency } from '@/lib/utils';
import { Plus, ArrowRight, TrendingUp } from 'lucide-react';

export default function Dashboard() {
  const {
    watchlist,
    prices,
    getTodayTrades,
    dailyPL,
    isTargetReached,
    isLossLimitReached,
  } = useApp();
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [selectedSymbolForTrade, setSelectedSymbolForTrade] = useState('');

  const todayTrades = getTodayTrades();
  const recentTrades = todayTrades.slice(0, 3);
  const totalTrades = todayTrades.length;

  const handleQuickTrade = (symbol: string) => {
    setSelectedSymbolForTrade(symbol);
    setShowTradeModal(true);
  };

  return (
    <div className="space-y-8">
      <header className="scanner-hero">
        <p className="text-xs uppercase tracking-widest text-teal-200">
          Your workspace
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          Your research desk
        </h1>
        <p className="mt-2 text-sm text-slate-300">
          Start with the Nifty 50 scanner, or continue your separate three-stock
          study in Practice.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-4">
          <Link href="/market" className="scanner-primary">
            Open 3R scanner
          </Link>
          <Link
            href="/signals"
            className="text-sm text-teal-200 underline underline-offset-4"
          >
            Continue three-stock study
          </Link>
        </div>
      </header>
      <p className="text-sm text-slate-400">
        The overview below shows your manual trade journal. Scanner and Practice
        results remain in their own journals.
      </p>

      {/* Trade Rules Alert */}
      <TradeRulesAlert />

      {/* Risk Status Banner */}
      {(isTargetReached || isLossLimitReached) && (
        <div
          className={`rounded-3xl p-5 text-center ${isTargetReached ? 'bg-emerald-500/10 border border-emerald-500/40' : 'bg-red-500/10 border border-red-500/40'}`}
        >
          <div
            className={`text-2xl mb-2 ${isTargetReached ? 'text-emerald-400' : 'text-red-400'}`}
          >
            {isTargetReached ? '🎯 TARGET ACHIEVED' : '🛑 LOSS LIMIT HIT'}
          </div>
          <p className="text-sm text-zinc-400">
            {isTargetReached
              ? 'Excellent work! Consider closing the app and reviewing tomorrow.'
              : "Protect your capital. Step away and reflect on today's trades."}
          </p>
        </div>
      )}

      {/* Daily P/L Card */}
      <PLProgress />

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800">
          <div className="text-xs text-zinc-500">TRADES TODAY</div>
          <div className="text-3xl font-semibold mt-1">{totalTrades}</div>
          <div className="text-[10px] text-emerald-400">manual journal</div>
        </div>
        <div className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800">
          <div className="text-xs text-zinc-500">WATCHLIST</div>
          <div className="text-3xl font-semibold mt-1">{watchlist.length}</div>
          <div className="text-[10px] text-zinc-400">stocks tracking</div>
        </div>
        <div className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800 flex flex-col justify-between">
          <div>
            <div className="text-xs text-zinc-500">AVG P/L / TRADE</div>
            <div
              className={`text-2xl font-semibold mt-1 ${totalTrades > 0 ? (dailyPL / totalTrades > 0 ? 'text-emerald-400' : 'text-red-400') : ''}`}
            >
              {totalTrades > 0 ? formatCurrency(dailyPL / totalTrades) : '—'}
            </div>
          </div>
          <div className="text-[10px] text-zinc-500">per trade</div>
        </div>
      </div>

      {/* Watchlist Preview */}
      <div>
        <div className="flex items-center justify-between mb-4 px-1">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-emerald-400" />
            <h2 className="font-semibold text-lg">Watchlist</h2>
          </div>
          <Link
            href="/watchlist"
            className="flex items-center text-sm text-emerald-400 hover:text-emerald-300"
          >
            View all <ArrowRight className="w-4 h-4 ml-1" />
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-3">
          {watchlist.slice(0, 4).map((symbol) => (
            <StockCard
              key={symbol}
              symbol={symbol}
              showRemove={false}
              onQuickTrade={handleQuickTrade}
            />
          ))}
        </div>

        {watchlist.length === 0 && (
          <div className="text-center py-8 text-zinc-500">
            No stocks in watchlist.{' '}
            <Link href="/watchlist" className="text-emerald-400">
              Add some →
            </Link>
          </div>
        )}
      </div>

      {/* Recent Trades */}
      <div>
        <div className="flex items-center justify-between mb-4 px-1">
          <h2 className="font-semibold text-lg">Recent Trades</h2>
          <Link
            href="/trades"
            className="text-sm text-emerald-400 flex items-center"
          >
            All trades <ArrowRight className="w-4 h-4 ml-1" />
          </Link>
        </div>

        {recentTrades.length > 0 ? (
          <div className="space-y-3">
            {recentTrades.map((trade, index) => {
              const pl =
                trade.side === 'BUY'
                  ? (trade.exitPrice - trade.entryPrice) * trade.quantity -
                    trade.brokerage
                  : (trade.entryPrice - trade.exitPrice) * trade.quantity -
                    trade.brokerage;

              return (
                <div
                  key={index}
                  className="bg-zinc-900 rounded-2xl p-4 flex justify-between items-center border border-zinc-800"
                >
                  <div className="flex items-center gap-4">
                    <div>
                      <div className="font-mono text-sm text-white">
                        {trade.symbol}
                      </div>
                      <div className="text-xs text-zinc-500">
                        {new Date(trade.timestamp).toLocaleTimeString('en-IN', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>
                    <div
                      className={`px-2.5 py-px text-xs rounded font-medium ${trade.side === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}
                    >
                      {trade.side}
                    </div>
                  </div>

                  <div
                    className={`font-mono text-right ${pl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
                  >
                    {pl >= 0 ? '+' : ''}
                    {formatCurrency(pl)}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-zinc-900/50 rounded-3xl p-8 text-center border border-dashed border-zinc-800">
            <div className="mx-auto w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center mb-4">
              <Plus className="w-6 h-6 text-zinc-400" />
            </div>
            <p className="text-zinc-400">No trades recorded today</p>
            <button
              onClick={() => setShowTradeModal(true)}
              className="mt-4 text-sm px-5 py-2 bg-white text-black rounded-full font-medium"
            >
              Record your first trade
            </button>
          </div>
        )}
      </div>

      {/* Floating Action Button */}
      <button
        onClick={() => {
          setSelectedSymbolForTrade('');
          setShowTradeModal(true);
        }}
        aria-label="Record manual journal trade"
        className="fixed bottom-24 right-6 bg-white text-black w-14 h-14 rounded-full flex items-center justify-center shadow-xl shadow-black/50 active:scale-95 z-40"
      >
        <Plus className="w-6 h-6" />
      </button>

      <TradeFormModal
        isOpen={showTradeModal}
        onClose={() => {
          setShowTradeModal(false);
          setSelectedSymbolForTrade('');
        }}
        defaultSymbol={selectedSymbolForTrade}
      />
    </div>
  );
}
