'use client';

import { useMemo, useState } from 'react';
import { useApp, type Trade } from '@/contexts/AppContext';
import TradeRulesAlert from '@/components/TradeRulesAlert';
import TradeFormModal from '@/components/TradeFormModal';
import EditTradeModal from '@/components/EditTradeModal';
import { formatCurrency, formatPrice } from '@/lib/utils';
import { downloadCsv } from '@/lib/exportCsv';
import {
  Download,
  Filter,
  Pencil,
  Plus,
  RotateCcw,
  StickyNote,
  Trash2,
} from 'lucide-react';

type DateScopeFilter = 'TODAY' | 'ALL';
type SideFilter = 'ALL' | 'BUY' | 'SELL';
type ResultFilter = 'ALL' | 'PROFIT' | 'LOSS';
type OutcomeFilter = 'ALL' | 'HIT_TARGET' | 'HIT_SL' | 'BREAKEVEN' | 'MANUAL_EXIT';

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

function uniqueValues(trades: Trade[], key: 'setup' | 'emotion' | 'mistake') {
  return Array.from(
    new Set(
      trades
        .map((trade) => trade[key])
        .filter((value): value is string => Boolean(value && value.trim()))
    )
  ).sort();
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

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1.5 text-[10px] uppercase tracking-wide text-zinc-500">
        {label}
      </div>

      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-3 py-3 text-sm text-white outline-none focus:border-emerald-500"
      >
        {children}
      </select>
    </label>
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

function getOutcomeLabel(outcome?: string) {
  if (!outcome) return null;
  if (outcome === 'HIT_TARGET') return '✅ Hit Target';
  if (outcome === 'HIT_SL') return '❌ Hit SL';
  if (outcome === 'BREAKEVEN') return 'Breakeven';
  if (outcome === 'MANUAL_EXIT') return 'Manual Exit';
  return outcome;
}

function getOutcomeTone(outcome?: string): 'green' | 'red' | 'yellow' | 'blue' | 'neutral' {
  if (!outcome) return 'neutral';
  if (outcome === 'HIT_TARGET') return 'green';
  if (outcome === 'HIT_SL') return 'red';
  if (outcome === 'BREAKEVEN') return 'yellow';
  return 'blue';
}

export default function TradesPage() {
  const { trades, getTodayTrades, deleteTrade, dailyPL } = useApp();

  const [showTradeModal, setShowTradeModal] = useState(false);
  const [editingTrade, setEditingTrade] = useState<Trade | null>(null);

  const [dateScope, setDateScope] = useState<DateScopeFilter>('TODAY');
  const [sideFilter, setSideFilter] = useState<SideFilter>('ALL');
  const [resultFilter, setResultFilter] = useState<ResultFilter>('ALL');
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>('ALL');
  const [setupFilter, setSetupFilter] = useState('ALL');
  const [emotionFilter, setEmotionFilter] = useState('ALL');
  const [mistakeFilter, setMistakeFilter] = useState('ALL');

  const todayTrades = getTodayTrades();

  const baseTrades = dateScope === 'TODAY' ? todayTrades : trades;

  const setupOptions = useMemo(() => uniqueValues(trades, 'setup'), [trades]);
  const emotionOptions = useMemo(() => uniqueValues(trades, 'emotion'), [trades]);
  const mistakeOptions = useMemo(() => uniqueValues(trades, 'mistake'), [trades]);

  const filteredTrades = useMemo(() => {
    return baseTrades.filter((trade) => {
      const pl = getTradePL(trade);

      if (sideFilter !== 'ALL' && trade.side !== sideFilter) return false;
      if (resultFilter === 'PROFIT' && pl <= 0) return false;
      if (resultFilter === 'LOSS' && pl >= 0) return false;
      if (outcomeFilter !== 'ALL' && trade.outcome !== outcomeFilter) return false;
      if (setupFilter !== 'ALL' && trade.setup !== setupFilter) return false;
      if (emotionFilter !== 'ALL' && trade.emotion !== emotionFilter) return false;
      if (mistakeFilter !== 'ALL' && trade.mistake !== mistakeFilter) return false;

      return true;
    });
  }, [
    baseTrades,
    sideFilter,
    resultFilter,
    outcomeFilter,
    setupFilter,
    emotionFilter,
    mistakeFilter,
  ]);

  const filteredPL = useMemo(() => {
    return filteredTrades.reduce((sum, trade) => sum + getTradePL(trade), 0);
  }, [filteredTrades]);

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

  const filterActive =
    dateScope !== 'TODAY' ||
    sideFilter !== 'ALL' ||
    resultFilter !== 'ALL' ||
    outcomeFilter !== 'ALL' ||
    setupFilter !== 'ALL' ||
    emotionFilter !== 'ALL' ||
    mistakeFilter !== 'ALL';

  function resetFilters() {
    setDateScope('TODAY');
    setSideFilter('ALL');
    setResultFilter('ALL');
    setOutcomeFilter('ALL');
    setSetupFilter('ALL');
    setEmotionFilter('ALL');
    setMistakeFilter('ALL');
  }

  function buildCsvRows(inputTrades: Trade[]) {
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
        'Stop Loss': trade.stopLoss || '',
        Target: trade.target || '',
        Outcome: trade.outcome || '',
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
    downloadCsv(getCsvFilename('intraday-trades-today'), buildCsvRows(todayTrades));
  }

  function handleExportAllCsv() {
    if (trades.length === 0) {
      alert('No trades available to export.');
      return;
    }
    downloadCsv(getCsvFilename('intraday-trades-all'), buildCsvRows(trades));
  }

  function handleExportFilteredCsv() {
    if (filteredTrades.length === 0) {
      alert('No filtered trades available to export.');
      return;
    }
    downloadCsv(getCsvFilename('intraday-trades-filtered'), buildCsvRows(filteredTrades));
  }

  function handleDeleteTrade(trade: Trade) {
    const confirmed = window.confirm(`Delete ${trade.symbol} ${trade.side} trade?`);
    if (!confirmed) return;
    deleteTrade(trade.id);
  }

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-end gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Trade Journal</h1>
          <p className="text-zinc-500">Today&apos;s activity • {todayTrades.length} trades</p>
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

      <div className="grid grid-cols-3 gap-3">
        <button onClick={handleExportTodayCsv} disabled={todayTrades.length === 0} className="flex items-center justify-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-900 px-3 py-3 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">
          <Download className="h-4 w-4" /> Today
        </button>
        <button onClick={handleExportAllCsv} disabled={trades.length === 0} className="flex items-center justify-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-900 px-3 py-3 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">
          <Download className="h-4 w-4" /> All
        </button>
        <button onClick={handleExportFilteredCsv} disabled={filteredTrades.length === 0} className="flex items-center justify-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-900 px-3 py-3 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">
          <Download className="h-4 w-4" /> Filtered
        </button>
      </div>

      {/* Filters */}
      <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Filter className="h-5 w-5 text-zinc-400" />
            <div>
              <h2 className="font-semibold text-white">Journal Filters</h2>
              <p className="text-xs text-zinc-500">Showing {filteredTrades.length} of {baseTrades.length} trades</p>
            </div>
          </div>
          <button onClick={resetFilters} disabled={!filterActive} className="flex items-center gap-1 rounded-full bg-zinc-800 px-3 py-2 text-xs font-semibold text-zinc-300 disabled:opacity-40">
            <RotateCcw className="h-3.5 w-3.5" /> Reset
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FilterSelect label="Date" value={dateScope} onChange={(v) => setDateScope(v as DateScopeFilter)}>
            <option value="TODAY">Today</option>
            <option value="ALL">All Trades</option>
          </FilterSelect>

          <FilterSelect label="Side" value={sideFilter} onChange={(v) => setSideFilter(v as SideFilter)}>
            <option value="ALL">All</option>
            <option value="BUY">BUY</option>
            <option value="SELL">SELL</option>
          </FilterSelect>

          <FilterSelect label="Result" value={resultFilter} onChange={(v) => setResultFilter(v as ResultFilter)}>
            <option value="ALL">All</option>
            <option value="PROFIT">Profit</option>
            <option value="LOSS">Loss</option>
          </FilterSelect>

          <FilterSelect label="Outcome" value={outcomeFilter} onChange={(v) => setOutcomeFilter(v as OutcomeFilter)}>
            <option value="ALL">All</option>
            <option value="HIT_TARGET">Hit Target</option>
            <option value="HIT_SL">Hit Stop Loss</option>
            <option value="BREAKEVEN">Breakeven</option>
            <option value="MANUAL_EXIT">Manual Exit</option>
          </FilterSelect>

          <FilterSelect label="Setup" value={setupFilter} onChange={setSetupFilter}>
            <option value="ALL">All</option>
            {setupOptions.map(s => <option key={s} value={s}>{s}</option>)}
          </FilterSelect>

          <FilterSelect label="Emotion" value={emotionFilter} onChange={setEmotionFilter}>
            <option value="ALL">All</option>
            {emotionOptions.map(e => <option key={e} value={e}>{e}</option>)}
          </FilterSelect>
        </div>
      </div>

      {/* P/L Summary */}
      <div className="bg-zinc-900 rounded-3xl p-5 flex items-center justify-between border border-zinc-800">
        <div>
          <div className="text-xs text-zinc-400">{filterActive ? 'FILTERED P/L' : 'NET P/L TODAY'}</div>
          <div className={`text-4xl font-semibold tabular-nums tracking-tighter mt-1 font-mono ${(filterActive ? filteredPL : dailyPL) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {(filterActive ? filteredPL : dailyPL) >= 0 ? '+' : ''}{formatCurrency(filterActive ? filteredPL : dailyPL)}
          </div>
        </div>
        <div className="text-right text-xs text-zinc-500">
          {filterActive ? filteredTrades.length : todayStats.total} SHOWN<br />
          {todayStats.buy} BUY • {todayStats.sell} SELL TODAY
        </div>
      </div>

      {/* Trade Cards */}
      {filteredTrades.length > 0 ? (
        <div className="space-y-3">
          {filteredTrades.map((trade) => {
            const pl = getTradePL(trade);
            const time = new Date(trade.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
            const date = new Date(trade.timestamp).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
            const hasJournalDetails = trade.setup || trade.emotion || trade.mistake || trade.notes;

            return (
              <div key={trade.id} className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800 flex flex-col">
                <div className="flex justify-between items-start gap-3">
                  <div className="flex items-center gap-3">
                    <div>
                      <div className="font-mono text-xl font-semibold text-white tracking-tight">{trade.symbol}</div>
                      {dateScope === 'ALL' && <div className="mt-0.5 text-xs text-zinc-500">{date}</div>}
                    </div>
                    <div className={`text-xs px-2.5 py-px rounded font-medium self-start mt-1.5 ${trade.side === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                      {trade.side}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button onClick={() => setEditingTrade(trade)} className="rounded-full bg-zinc-800 p-2 text-zinc-300 hover:bg-zinc-700 hover:text-white">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDeleteTrade(trade)} className="rounded-full bg-red-500/10 p-2 text-red-400/80 hover:bg-red-500/20 hover:text-red-300">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Entry / Exit / Qty */}
                <div className="mt-3 grid grid-cols-3 gap-4 text-sm">
                  <div><div className="text-[10px] text-zinc-500">ENTRY</div><div className="font-mono text-white">₹{formatPrice(trade.entryPrice)}</div></div>
                  <div><div className="text-[10px] text-zinc-500">EXIT</div><div className="font-mono text-white">₹{formatPrice(trade.exitPrice)}</div></div>
                  <div><div className="text-[10px] text-zinc-500">QTY × BROK</div><div className="font-mono text-white">{trade.quantity} × ₹{trade.brokerage}</div></div>
                </div>

                {/* Stop Loss & Target */}
                {(trade.stopLoss || trade.target) && (
                  <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                    {trade.stopLoss && (
                      <div className="rounded-2xl border border-amber-800/40 bg-amber-950/20 px-3 py-2">
                        <div className="text-[10px] text-amber-400">STOP LOSS</div>
                        <div className="font-mono text-amber-300">₹{formatPrice(trade.stopLoss)}</div>
                      </div>
                    )}
                    {trade.target && (
                      <div className="rounded-2xl border border-emerald-800/40 bg-emerald-950/20 px-3 py-2">
                        <div className="text-[10px] text-emerald-400">TARGET</div>
                        <div className="font-mono text-emerald-300">₹{formatPrice(trade.target)}</div>
                      </div>
                    )}
                  </div>
                )}

                {/* Outcome Badge */}
                {trade.outcome && (
                  <div className="mt-3">
                    <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${getOutcomeTone(trade.outcome) === 'green' ? 'bg-emerald-500/20 text-emerald-400' : getOutcomeTone(trade.outcome) === 'red' ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                      {getOutcomeLabel(trade.outcome)}
                    </span>
                  </div>
                )}

                {/* Journal Details */}
                {hasJournalDetails && (
                  <div className="mt-4 rounded-2xl border border-zinc-800 bg-black/20 p-3">
                    <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      <StickyNote className="h-4 w-4" /> Journal Details
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <DetailPill label="Setup" value={trade.setup} tone="blue" />
                      <DetailPill label="Emotion" value={trade.emotion} tone={getEmotionTone(trade.emotion)} />
                      <DetailPill label="Mistake" value={trade.mistake} tone={getMistakeTone(trade.mistake)} />
                    </div>
                    {trade.notes && (
                      <div className="mt-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
                        <div className="text-[10px] uppercase tracking-wide text-zinc-500">Notes</div>
                        <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">{trade.notes}</p>
                      </div>
                    )}
                  </div>
                )}

                <div className="mt-4 pt-4 border-t border-zinc-800 flex justify-between items-center">
                  <div className="text-xs text-zinc-500">{time} IST</div>
                  <div className={`font-mono text-lg font-semibold ${pl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {pl >= 0 ? '+' : ''}{formatCurrency(pl)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-16 bg-zinc-900/50 rounded-3xl border border-dashed border-zinc-800">
          <div className="mx-auto w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center mb-6">
            <Filter className="w-8 h-8 text-zinc-400" />
          </div>
          <h3 className="text-xl font-medium text-white">No trades found</h3>
          <p className="text-zinc-500 mt-2 max-w-[260px] mx-auto">Try changing filters or record a new trade.</p>
          <button onClick={resetFilters} className="mt-8 bg-white text-black px-8 py-3 rounded-2xl font-medium flex items-center gap-2 mx-auto">
            <RotateCcw className="w-4 h-4" /> Reset Filters
          </button>
        </div>
      )}

      <TradeFormModal isOpen={showTradeModal} onClose={() => setShowTradeModal(false)} />
      <EditTradeModal trade={editingTrade} isOpen={Boolean(editingTrade)} onClose={() => setEditingTrade(null)} />
    </div>
  );
}
