'use client';

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback,
} from 'react';
import { format } from 'date-fns';
import { INSTRUMENTS } from '@/lib/instruments';
import {
  DEFAULT_TRADE_RULES,
  loadTradeRuleSettings,
  type TradeRuleSettings,
} from '@/lib/tradeRules';

export interface PriceData {
  price: number;
  change: number; // percentage change
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  lastUpdated?: string;
}

export interface Trade {
  id: string;
  date: string; // YYYY-MM-DD
  symbol: string;
  side: 'BUY' | 'SELL';
  entryPrice: number;
  quantity: number;
  exitPrice: number;
  brokerage: number;
  timestamp: string;

  // Optional journal quality fields
  setup?: string;
  emotion?: string;
  mistake?: string;
  notes?: string;
}

interface AppContextType {
  watchlist: string[];
  prices: Record<string, PriceData>;
  trades: Trade[];
  dailyPL: number;
  tradeRuleSettings: TradeRuleSettings;
  addToWatchlist: (symbol: string) => void;
  removeFromWatchlist: (symbol: string) => void;
  addTrade: (trade: Omit<Trade, 'id' | 'date' | 'timestamp'>) => void;
  deleteTrade: (id: string) => void;
  getTodayTrades: () => Trade[];
  getTodayPL: () => number;
  isTargetReached: boolean;
  isLossLimitReached: boolean;
  updatePrices: () => Promise<void>;
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

export function AppProvider({ children }: { children: ReactNode }) {
  const [watchlist, setWatchlist] = useState<string[]>([
    'RELIANCE',
    'TCS',
    'HDFCBANK',
  ]);

  const [prices, setPrices] = useState<Record<string, PriceData>>(INITIAL_PRICES);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [dailyPL, setDailyPL] = useState(0);
  const [isTargetReached, setIsTargetReached] = useState(false);
  const [isLossLimitReached, setIsLossLimitReached] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const [tradeRuleSettings, setTradeRuleSettings] =
    useState<TradeRuleSettings>(DEFAULT_TRADE_RULES);

  const today = format(new Date(), 'yyyy-MM-dd');

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
    setIsTargetReached(pl >= tradeRuleSettings.dailyTarget);
    setIsLossLimitReached(pl <= tradeRuleSettings.dailyLossLimit);
  }, [trades, calculateDailyPL, tradeRuleSettings]);

  const updatePrices = useCallback(async () => {
    if (!watchlist.length) return;

    const validSymbols = watchlist.filter((symbol) => INSTRUMENTS[symbol]);

    if (!validSymbols.length) {
      console.warn('No valid Angel instruments found in watchlist');
      return;
    }

    try {
      const response = await fetch('/api/market/quote', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
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
        console.error('Failed to fetch live prices:', data);
        return;
      }

      setPrices((prev) => {
        const updated = { ...prev };

        data.quotes.forEach((quote: any) => {
          updated[quote.symbol] = {
            price: Number(quote.price || 0),
            change: Number(quote.changePercent || 0),
            open: Number(quote.open || 0),
            high: Number(quote.high || 0),
            low: Number(quote.low || 0),
            close: Number(quote.close || 0),
            lastUpdated: quote.lastUpdated,
          };
        });

        return updated;
      });
    } catch (error) {
      console.error('Live price update failed:', error);
    }
  }, [watchlist]);

  useEffect(() => {
    if (!hydrated) return;

    updatePrices();

    const interval = setInterval(() => {
      updatePrices();
    }, 10000);

    return () => clearInterval(interval);
  }, [hydrated, updatePrices]);

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
        trades,
        dailyPL,
        tradeRuleSettings,
        addToWatchlist,
        removeFromWatchlist,
        addTrade,
        deleteTrade,
        getTodayTrades,
        getTodayPL,
        isTargetReached,
        isLossLimitReached,
        updatePrices,
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
