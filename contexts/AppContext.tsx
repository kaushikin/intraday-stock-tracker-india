'use client';

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback,
  useRef,
} from 'react';
import { istDateKey } from '@/lib/marketHours';
import { INSTRUMENTS } from '@/lib/instruments';
import {
  DEFAULT_TRADE_RULES,
  loadTradeRuleSettings,
  type TradeRuleSettings,
} from '@/lib/tradeRules';
import { isIndianMarketOpen } from '@/lib/marketHours';
import {
  idleFeed,
  requestErrors,
  type FeedRequestState,
} from '@/lib/feedStatus';
import { PAPER_BOOK_KEY, parsePaperBook } from '@/lib/paperBook';

export interface PriceData {
  price: number;
  change: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  lastUpdated?: string;
  exchangeTime?: string;
  tradeTime?: string;
  bid?: number;
  ask?: number;
  askQuantity?: number;
  tickSize?: number;
  instrumentAsOf?: string;
}

export interface CandleData {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface CandleWarning {
  symbol: string;
  error?: string;
  warning?: string;
}

export interface Trade {
  id: string;
  date: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  entryPrice: number;
  quantity: number;
  exitPrice: number;
  brokerage: number;
  timestamp: string;

  // New fields for better accuracy
  stopLoss?: number;
  target?: number;
  outcome?: 'HIT_TARGET' | 'HIT_SL' | 'BREAKEVEN' | 'MANUAL_EXIT';

  setup?: string;
  emotion?: string;
  mistake?: string;
  notes?: string;
}

interface AppContextType {
  watchlist: string[];
  prices: Record<string, PriceData>;
  candles: Record<string, CandleData[]>;
  candleWarnings: CandleWarning[];
  quoteFeed: FeedRequestState;
  candleFeed: FeedRequestState;
  trades: Trade[];
  dailyPL: number;
  tradeRuleSettings: TradeRuleSettings;
  addToWatchlist: (symbol: string) => void;
  removeFromWatchlist: (symbol: string) => void;
  addTrade: (trade: Omit<Trade, 'id' | 'date' | 'timestamp'>) => void;
  updateTrade: (
    id: string,
    updates: Partial<Omit<Trade, 'id' | 'date' | 'timestamp'>>
  ) => void;
  deleteTrade: (id: string) => void;
  getTodayTrades: () => Trade[];
  getTodayPL: () => number;
  isTargetReached: boolean;
  isLossLimitReached: boolean;
  updatePrices: () => Promise<void>;
  updateCandles: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const INITIAL_PRICES: Record<string, PriceData> = {
  RELIANCE: { price: 0, change: 0 },
  TCS: { price: 0, change: 0 },
  INFY: { price: 0, change: 0 },
  HDFCBANK: { price: 0, change: 0 },
  ICICIBANK: { price: 0, change: 0 },
  SBIN: { price: 0, change: 0 },
  BHARTIARTL: { price: 0, change: 0 },
  LT: { price: 0, change: 0 },
  TATAMOTORS: { price: 0, change: 0 },
  ADANIENT: { price: 0, change: 0 },
};

function calculateTradePL(trade: Trade) {
  const gross =
    trade.side === 'BUY'
      ? (trade.exitPrice - trade.entryPrice) * trade.quantity
      : (trade.entryPrice - trade.exitPrice) * trade.quantity;

  return gross - trade.brokerage;
}

export function AppProvider({
  children,
  autoRefresh = true,
}: {
  children: ReactNode;
  autoRefresh?: boolean;
}) {
  const [watchlist, setWatchlist] = useState<string[]>([
    'RELIANCE',
    'TCS',
    'HDFCBANK',
  ]);

  const [studySymbols, setStudySymbols] = useState<string[]>([]);
  useEffect(() => {
    const refresh = () => {
      try {
        const symbols =
          parsePaperBook(localStorage.getItem(PAPER_BOOK_KEY)).research
            ?.symbols || [];
        setStudySymbols((prev) =>
          JSON.stringify(prev) === JSON.stringify(symbols) ? prev : symbols
        );
      } catch {
        setStudySymbols([]);
      }
    };
    refresh();
    window.addEventListener('paperBookUpdated', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('paperBookUpdated', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const [prices, setPrices] =
    useState<Record<string, PriceData>>(INITIAL_PRICES);
  const [candles, setCandles] = useState<Record<string, CandleData[]>>({});
  const [candleWarnings, setCandleWarnings] = useState<CandleWarning[]>([]);
  const [quoteFeed, setQuoteFeed] = useState<FeedRequestState>(idleFeed);
  const [candleFeed, setCandleFeed] = useState<FeedRequestState>(idleFeed);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [dailyPL, setDailyPL] = useState(0);
  const [isTargetReached, setIsTargetReached] = useState(false);
  const [isLossLimitReached, setIsLossLimitReached] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const [tradeRuleSettings, setTradeRuleSettings] =
    useState<TradeRuleSettings>(DEFAULT_TRADE_RULES);

  const [today, setToday] = useState(istDateKey());
  const quoteBusy = useRef(false);
  const candleBusy = useRef(false);

  useEffect(() => {
    const savedWatchlist = localStorage.getItem('watchlist');
    if (savedWatchlist) {
      setWatchlist(JSON.parse(savedWatchlist));
    }

    const savedTrades = localStorage.getItem('trades');
    if (savedTrades) {
      setTrades(JSON.parse(savedTrades));
    }

    setTradeRuleSettings(loadTradeRuleSettings());

    setHydrated(true);
  }, []);

  useEffect(() => {
    function refreshTradeRules() {
      setTradeRuleSettings(loadTradeRuleSettings());
    }

    window.addEventListener('tradeRulesUpdated', refreshTradeRules);
    window.addEventListener('storage', refreshTradeRules);

    return () => {
      window.removeEventListener('tradeRulesUpdated', refreshTradeRules);
      window.removeEventListener('storage', refreshTradeRules);
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem('watchlist', JSON.stringify(watchlist));
  }, [watchlist, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem('trades', JSON.stringify(trades));
  }, [trades, hydrated]);

  const calculateDailyPL = useCallback(
    (currentTrades: Trade[]) => {
      const todayTrades = currentTrades.filter((trade) => trade.date === today);

      return todayTrades.reduce((sum, trade) => {
        return sum + calculateTradePL(trade);
      }, 0);
    },
    [today]
  );

  useEffect(() => {
    const pl = calculateDailyPL(trades);

    setDailyPL(pl);
    setIsTargetReached(
      tradeRuleSettings.dailyTarget > 0 && pl >= tradeRuleSettings.dailyTarget
    );
    setIsLossLimitReached(pl <= tradeRuleSettings.dailyLossLimit);
  }, [trades, calculateDailyPL, tradeRuleSettings]);

  const updatePrices = useCallback(async () => {
    if ((!watchlist.length && !studySymbols.length) || quoteBusy.current)
      return;

    const validSymbols = [...new Set([...studySymbols, ...watchlist])]
      .filter((symbol) => INSTRUMENTS[symbol]?.exchange === 'NSE')
      .slice(0, 18);

    if (!validSymbols.length) {
      console.warn('No valid Angel instruments found in watchlist');
      return;
    }

    quoteBusy.current = true;
    setQuoteFeed((prev) => ({
      ...prev,
      state: 'LOADING',
      attemptedAt: new Date().toISOString(),
      errors: [],
    }));
    try {
      const response = await fetch('/api/market/quote', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(35_000),
        body: JSON.stringify({
          items: validSymbols.map((symbol) => {
            const instrument = INSTRUMENTS[symbol];

            return {
              symbol: instrument.symbol,
              exchange: instrument.exchange,
              token: instrument.token,
            };
          }),
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setPrices({});
        setQuoteFeed((prev) => ({
          ...prev,
          state: 'ERROR',
          errors: [
            {
              symbol: 'ALL',
              message: String(
                data.error || `Quote request failed (HTTP ${response.status}).`
              ).slice(0, 250),
            },
            ...requestErrors(data, [], []),
          ],
        }));
        return;
      }

      const returned = (Array.isArray(data.quotes) ? data.quotes : []).filter(
        (q: any) => validSymbols.includes(q.symbol)
      );
      const failures = requestErrors(
        data,
        validSymbols,
        returned.map((q: any) => q.symbol)
      );
      setQuoteFeed((prev) => ({
        ...prev,
        state: failures.length ? 'PARTIAL' : 'OK',
        receivedAt: new Date().toISOString(),
        errors: failures,
      }));
      setPrices((prev) => {
        const updated = { ...prev };
        validSymbols.forEach((symbol) => {
          delete updated[symbol];
        });

        returned.forEach((quote: any) => {
          updated[quote.symbol] = {
            price: Number(quote.price || 0),
            change: Number(quote.changePercent || 0),
            open: Number(quote.open || 0),
            high: Number(quote.high || 0),
            low: Number(quote.low || 0),
            close: Number(quote.close || 0),
            lastUpdated: quote.lastUpdated,
            exchangeTime: quote.exchangeTime,
            tickSize: Number(quote.tickSize || 0),
            instrumentAsOf: quote.instrumentAsOf,
            tradeTime: quote.tradeTime,
            bid: Number(quote.bid || 0),
            ask: Number(quote.ask || 0),
            askQuantity: Number(quote.askQuantity || 0),
          };
        });

        return updated;
      });
    } catch (error) {
      setPrices({});
      setQuoteFeed((prev) => ({
        ...prev,
        state: 'ERROR',
        errors: [
          {
            symbol: 'ALL',
            message:
              'Quote request failed or timed out. Refresh and check the connection.',
          },
        ],
      }));
      console.error('Live price update failed:', error);
    } finally {
      quoteBusy.current = false;
    }
  }, [watchlist, studySymbols]);

  const updateCandles = useCallback(async () => {
    if ((!watchlist.length && !studySymbols.length) || candleBusy.current)
      return;

    const validSymbols = [...new Set([...studySymbols, ...watchlist])]
      .filter((symbol) => INSTRUMENTS[symbol]?.exchange === 'NSE')
      .slice(0, 18);

    if (!validSymbols.length) return;

    const indexSymbols = ['NIFTY', 'BANKNIFTY'].filter(
      (symbol) => INSTRUMENTS[symbol]
    );

    const candleSymbols = Array.from(
      new Set([...validSymbols, ...indexSymbols])
    );

    candleBusy.current = true;
    setCandleFeed((prev) => ({
      ...prev,
      state: 'LOADING',
      attemptedAt: new Date().toISOString(),
      errors: [],
    }));
    try {
      const response = await fetch('/api/market/candles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(55_000),
        body: JSON.stringify({
          symbols: candleSymbols,
          interval: 'FIVE_MINUTE',
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setCandles({});
        setCandleFeed((prev) => ({
          ...prev,
          state: 'ERROR',
          errors: [
            {
              symbol: 'ALL',
              message: String(
                data.error || `Candle request failed (HTTP ${response.status}).`
              ).slice(0, 250),
            },
          ],
        }));
        setCandleWarnings([
          { symbol: 'ALL', error: data.error || 'Candle feed unavailable' },
        ]);
        return;
      }

      const failures = requestErrors(
        data,
        candleSymbols,
        Object.keys(data.candles || {}).filter(
          (symbol) =>
            Array.isArray(data.candles[symbol]) &&
            data.candles[symbol].length > 0
        )
      );
      setCandleFeed((prev) => ({
        ...prev,
        state: failures.length ? 'PARTIAL' : 'OK',
        receivedAt: new Date().toISOString(),
        errors: failures,
      }));
      setCandles(data.candles || {});
      setCandleWarnings(data.errors || []);
    } catch (error) {
      setCandles({});
      setCandleWarnings([{ symbol: 'ALL', error: 'Candle feed unavailable' }]);
      setCandleFeed((prev) => ({
        ...prev,
        state: 'ERROR',
        errors: [
          {
            symbol: 'ALL',
            message:
              'Candle request failed or timed out. Refresh and check the connection.',
          },
        ],
      }));
      console.error('Candle update failed:', error);
    } finally {
      candleBusy.current = false;
    }
  }, [watchlist, studySymbols]);

  useEffect(() => {
    if (!hydrated || !autoRefresh) return;
    let lastCandleFetch = 0;
    const refresh = () => {
      setToday(istDateKey());
      if (document.hidden || !isIndianMarketOpen()) return;
      if (!quoteBusy.current) {
        void updatePrices();
      }
      if (!candleBusy.current && Date.now() - lastCandleFetch >= 30_000) {
        lastCandleFetch = Date.now();
        void updateCandles();
      }
    };
    // Timer remains mounted before open. Resuming a tab immediately checks freshness.
    refresh();
    const timer = window.setInterval(refresh, 10_000);
    const resume = () => {
      if (!document.hidden) {
        lastCandleFetch = 0;
        refresh();
      }
    };
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [hydrated, autoRefresh, updatePrices, updateCandles]);

  const addToWatchlist = (symbol: string) => {
    const upperSymbol = symbol.toUpperCase().trim();

    if (!upperSymbol || watchlist.includes(upperSymbol)) return;

    if (!INSTRUMENTS[upperSymbol]) {
      alert(
        `${upperSymbol} is not available yet. Add its Angel token in lib/instruments.ts first.`
      );
      return;
    }

    setWatchlist((prev) => [...prev, upperSymbol]);

    if (!prices[upperSymbol]) {
      setPrices((prev) => ({
        ...prev,
        [upperSymbol]: {
          price: 0,
          change: 0,
        },
      }));
    }
  };

  const removeFromWatchlist = (symbol: string) => {
    setWatchlist((prev) => prev.filter((s) => s !== symbol));
  };

  const addTrade = (tradeData: Omit<Trade, 'id' | 'date' | 'timestamp'>) => {
    const newTrade: Trade = {
      ...tradeData,
      id: Date.now().toString(36) + Math.random().toString(36).substr(2),
      date: today,
      timestamp: new Date().toISOString(),
    };

    setTrades((prev) => [newTrade, ...prev]);
  };

  const updateTrade = (
    id: string,
    updates: Partial<Omit<Trade, 'id' | 'date' | 'timestamp'>>
  ) => {
    setTrades((prev) =>
      prev.map((trade) =>
        trade.id === id
          ? {
              ...trade,
              ...updates,
            }
          : trade
      )
    );
  };

  const deleteTrade = (id: string) => {
    setTrades((prev) => prev.filter((trade) => trade.id !== id));
  };

  const getTodayTrades = () => {
    return trades.filter((trade) => trade.date === today);
  };

  const getTodayPL = () => {
    return dailyPL;
  };

  return (
    <AppContext.Provider
      value={{
        watchlist,
        prices,
        candles,
        candleWarnings,
        quoteFeed,
        candleFeed,
        trades,
        dailyPL,
        tradeRuleSettings,
        addToWatchlist,
        removeFromWatchlist,
        addTrade,
        updateTrade,
        deleteTrade,
        getTodayTrades,
        getTodayPL,
        isTargetReached,
        isLossLimitReached,
        updatePrices,
        updateCandles,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => {
  const context = useContext(AppContext);

  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }

  return context;
};
