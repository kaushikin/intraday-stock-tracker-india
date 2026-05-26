'use client';

import { useMemo, useState } from 'react';
import { useApp, type Trade } from '@/contexts/AppContext';
import TradeRulesAlert from '@/components/TradeRulesAlert';
import TradeFormModal from '@/components/TradeFormModal';
import EditTradeModal from '@/components/EditTradeModal';
import { formatCurrency, formatPrice } from '@/lib/utils';
import { downloadCsv } from '@/lib/exportCsv';
import { Download, Pencil, Plus, StickyNote, Trash2 } from 'lucide-react';

function getTradePL(trade: {
  side: 'BUY' | 'SELL';
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  brokerage: number;
}) {
  const gross =
    trade.side === 'BUY'
      ? (trade.exitPrice - trade.entryPrice) * trade.quantity
      : (trade.entryPrice - trade.exitPrice) * trade.quantity;

  return gross - trade.brokerage;
}

function formatCsvDateTime(timestamp?: string) {
  if (!timestamp) {
    return {
      date: '',
      time: '',
    };
  }

  const date = new Date(timestamp);

  return {
    date: date.toLocaleDateString('en-IN'),
    time: date.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }),
  };
}

function getCsvFilename(prefix: string) {
  const now = new Date();

  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');

  return `${prefix}-${yyyy}-${mm}-${dd}.csv`;
}

function DetailPill({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value?: string;
  tone?: 'green' | 'red' | 'yellow' | 'blue' | 'neutral';
}) {
  if (!value) return null;

  const toneClass =
    tone === 'green'
      ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
      : tone === 'red'
      ? 'border-red-500/20 bg-red-500/10 text-red-300'
      : tone === 'yellow'
      ? 'border-yellow-500/20 bg-yellow-500/10 text-yellow-200'
      : tone === 'blue'
      ? 'border-blue-500/20 bg-blue-500/10 text-blue-300'
      : 'border-zinc-700 bg-zinc-800/60 text-zinc-300';

  return (
    <div className={`rounded-2xl border px-3 py-2 ${toneClass}`}>
      <div className="text-[10px] uppercase tracking-wide opacity-70">
        {label}
      </div>
      <div className="mt-0.5 text-xs font-semibold">{value}</div>
    </div>
  );
}

function getEmotionTone(
  emotion?: string
): 'green' | 'red' | 'yellow' | 'blue' | 'neutral' {
  if (!emotion) return 'neutral';

  if (emotion === 'Calm') return 'green';
  if (emotion === 'FOMO' || emotion === 'Revenge') return 'red';
  if (emotion === 'Fear' || emotion === 'Overconfident') return 'yellow';

  return 'neutral';
}

function getMistakeTone(
  mistake?: string
): 'green' | 'red' | 'yellow' | 'blue' | 'neutral' {
  if (!mistake) return 'neutral';
  if (mistake === 'None') return 'green';

  return 'red';
}

export default function TradesPage() {
  const { trades, getTodayTrades, deleteTrade, dailyPL } = useApp();

  const [showTradeModal, setShowTradeModal] = useState(false);
  const [editingTrade, setEditingTrade] = useState<Trade | null>(null);

  const todayTrades = getTodayTrades();

  const todayStats = useMemo(() => {
    return {
      total: todayTrades.length,
      buy: todayTrades.filter((trade) => trade.side === 'BUY').length,
      sell: todayTrades.filter((trade) => trade.side === 'SELL').length,
      withNotes: todayTrades.filter(
        (trade) => trade.setup || trade.emotion || trade.mistake || trade.notes
      ).length,
    };
  }, [todayTrades]);

  function buildCsvRows(inputTrades: typeof trades) {
    return inputTrades.map((trade) => {
      const pl = getTradePL(trade);
      const dateTime = formatCsvDateTime(trade.timestamp);

      return {
        Date: trade.date || dateTime.date,
        Time: dateTime.time,
        Symbol: trade.symbol,
        Side: trade.side,
        'Entry Price': trade.entryPrice,
        'Exit Price': trade.exitPrice,
        Quantity: trade.quantity,
        Brokerage: trade.brokerage,
        'P/L': Number(pl.toFixed(2)),
        Setup: trade.setup || '',
        Emotion: trade.emotion || '',
        Mistake: trade.mistake || '',
        Notes: trade.notes || '',
        Timestamp: trade.timestamp,
      };
    });
  }

  function handleExportTodayCsv() {
    if (todayTrades.length === 0) {
      alert('No trades available today to export.');
      return;
    }

    downloadCsv(
      getCsvFilename('intraday-trades-today'),
      buildCsvRows(todayTrades)
    );
  }

  function handleExportAllCsv() {
    if (trades.length === 0) {
      alert('No trades available to export.');
      return;
    }

    downloadCsv(getCsvFilename('intraday-trades-all'), buildCsvRows(trades));
  }

  function handleDeleteTrade(trade: Trade) {
    const confirmed = window.confirm(
      `Delete ${trade.symbol} ${trade.side} trade?`
    );

    if (!confirmed) return;

    deleteTrade(trade.id);
  }

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-end gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Trade Journal
          </h1>
          <p className="text-zinc-500">
            Today&apos;s activity • {todayTrades.length} trades
          </p>
        </div>

        <button
          onClick={() => setShowTradeModal(true)}
          className="bg-white text-black px-5 py-2.5 rounded-2xl flex items-center gap-2 text-sm font-medium active:scale-[0.985]"
        >
          <Plus className="w-4 h-4" /> NEW TRADE
        </button>
      </div>

      <div className="mt-5">
        <TradeRulesAlert />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={handleExportTodayCsv}
          disabled={todayTrades.length === 0}
          className="flex items-center justify-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Download className="h-4 w-4" />
          Export Today
        </button>

        <button
          onClick={handleExportAllCsv}
          disabled={trades.length === 0}
          className="flex items-center justify-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Download className="h-4 w-4" />
          Export All
        </button>
      </div>

      <div className="bg-zinc-900 rounded-3xl p-5 flex items-center justify-between border border-zinc-800">
        <div>
          <div className="text-xs text-zinc-400">NET P/L TODAY</div>
          <div
            className={`text-4xl font-semibold tabular-nums tracking-tighter mt-1 font-mono ${
              dailyPL >= 0 ? 'text-emerald-400' : 'text-red-400'
            }`}
          >
            {dailyPL >= 0 ? '+' : ''}
            {formatCurrency(dailyPL)}
          </div>
        </div>

        <div className="text-right text-xs text-zinc-500">
          {todayStats.total} ENTRIES
          <br />
          {todayStats.buy} BUY • {todayStats.sell} SELL
          <br />
          <span className="text-zinc-600">{trades.length} ALL SAVED</span>
          <br />
          <span className="text-zinc-600">
            {todayStats.withNotes} WITH JOURNAL DETAILS
          </span>
        </div>
      </div>

      {todayTrades.length > 0 ? (
        <div className="space-y-3">
          {todayTrades.map((trade) => {
            const pl = getTradePL(trade);

            const time = new Date(trade.timestamp).toLocaleTimeString(
              'en-IN',
              {
                hour: '2-digit',
                minute: '2-digit',
              }
            );

            const hasJournalDetails =
              trade.setup || trade.emotion || trade.mistake || trade.notes;

            return (
              <div
                key={trade.id}
                className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800 flex flex-col"
              >
                <div className="flex justify-between items-start gap-3">
                  <div className="flex items-center gap-3">
                    <div className="font-mono text-xl font-semibold text-white tracking-tight">
                      {trade.symbol}
                    </div>

                    <div
                      className={`text-xs px-2.5 py-px rounded font-medium self-start mt-1.5 ${
                        trade.side === 'BUY'
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-red-500/20 text-red-400'
                      }`}
                    >
                      {trade.side}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setEditingTrade(trade)}
                      className="rounded-full bg-zinc-800 p-2 text-zinc-300 hover:bg-zinc-700 hover:text-white"
                      aria-label={`Edit ${trade.symbol} trade`}
                    >
                      <Pencil className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => handleDeleteTrade(trade)}
                      className="rounded-full bg-red-500/10 p-2 text-red-400/80 hover:bg-red-500/20 hover:text-red-300"
                      aria-label={`Delete ${trade.symbol} trade`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <div className="text-[10px] text-zinc-500">ENTRY</div>
                    <div className="font-mono text-white">
                      ₹{formatPrice(trade.entryPrice)}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] text-zinc-500">EXIT</div>
                    <div className="font-mono text-white">
                      ₹{formatPrice(trade.exitPrice)}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] text-zinc-500">QTY × BROK</div>
                    <div className="font-mono text-white">
                      {trade.quantity} × ₹{trade.brokerage}
                    </div>
                  </div>
                </div>

                {hasJournalDetails && (
                  <div className="mt-4 rounded-2xl border border-zinc-800 bg-black/20 p-3">
                    <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      <StickyNote className="h-4 w-4" />
                      Journal Details
                    </div>

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <DetailPill
                        label="Setup"
                        value={trade.setup}
                        tone="blue"
                      />

                      <DetailPill
                        label="Emotion"
                        value={trade.emotion}
                        tone={getEmotionTone(trade.emotion)}
                      />

                      <DetailPill
                        label="Mistake"
                        value={trade.mistake}
                        tone={getMistakeTone(trade.mistake)}
                      />
                    </div>

                    {trade.notes && (
                      <div className="mt-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
                        <div className="text-[10px] uppercase tracking-wide text-zinc-500">
                          Notes
                        </div>

                        <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
                          {trade.notes}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                <div className="mt-4 pt-4 border-t border-zinc-800 flex justify-between items-center">
                  <div className="text-xs text-zinc-500">{time} IST</div>

                  <div
                    className={`font-mono text-lg font-semibold ${
                      pl >= 0 ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    {pl >= 0 ? '+' : ''}
                    {formatCurrency(pl)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-16 bg-zinc-900/50 rounded-3xl border border-dashed border-zinc-800">
          <div className="mx-auto w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center mb-6">
            <Plus className="w-8 h-8 text-zinc-400" />
          </div>

          <h3 className="text-xl font-medium text-white">
            No trades yet today
          </h3>

          <p className="text-zinc-500 mt-2 max-w-[240px] mx-auto">
            Start journaling your intraday moves to build better habits.
          </p>

          <button
            onClick={() => setShowTradeModal(true)}
            className="mt-8 bg-white text-black px-8 py-3 rounded-2xl font-medium flex items-center gap-2 mx-auto"
          >
            <Plus className="w-4 h-4" /> Record First Trade
          </button>
        </div>
      )}

      <TradeFormModal
        isOpen={showTradeModal}
        onClose={() => setShowTradeModal(false)}
      />

      <EditTradeModal
        trade={editingTrade}
        isOpen={Boolean(editingTrade)}
        onClose={() => setEditingTrade(null)}
      />
    </div>
  );
}
