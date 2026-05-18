'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { format } from 'date-fns';

interface PriceData {
  price: number;
  change: number; // percentage
}

interface Trade {
  id: string;
  date: string; // YYYY-MM-DD
  symbol: string;
  side: 'BUY' | 'SELL';
  entryPrice: number;
  quantity: number;
  exitPrice: number;
  brokerage: number;
  timestamp: string;
}

interface AppContextType {
  watchlist: string[];
  prices: Record<string, PriceData>;
  trades: Trade[];
  dailyPL: number;
  addToWatchlist: (symbol: string) => void;
  removeFromWatchlist: (symbol: string) => void;
  addTrade: (trade: Omit<Trade, 'id' | 'date' | 'timestamp'>) => void;
  deleteTrade: (id: string) => void;
  getTodayTrades: () => Trade[];
  getTodayPL: () => number;
  isTargetReached: boolean;
  isLossLimitReached: boolean;
  updatePrices: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const POPULAR_STOCKS = ['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK', 'SBIN', 'BHARTIARTL', 'LT', 'TATAMOTORS', 'ADANIENT'];

const INITIAL_PRICES: Record<string, PriceData> = {
  'RELIANCE': { price: 2456.75, change: 0.45 },
  'TCS': { price: 3890.20, change: -0.12 },
  'INFY': { price: 1523.40, change: 0.78 },
  'HDFCBANK': { price: 1678.90, change: -0.34 },
  'ICICIBANK': { price: 1123.55, change: 1.12 },
  'SBIN': { price: 812.30, change: 0.56 },
  'BHARTIARTL': { price: 1345.80, change: -0.89 },
  'LT': { price: 3456.25, change: 0.23 },
  'TATAMOTORS': { price: 756.40, change: 2.15 },
  'ADANIENT': { price: 2890.15, change: -1.45 },
};

export function AppProvider({ children }: { children: ReactNode }) {
  const [watchlist, setWatchlist] = useState<string[]>(['RELIANCE', 'TCS', 'HDFCBANK']);
  const [prices, setPrices] = useState<Record<string, PriceData>>(INITIAL_PRICES);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [dailyPL, setDailyPL] = useState(0);
  const [isTargetReached, setIsTargetReached] = useState(false);
  const [isLossLimitReached, setIsLossLimitReached] = useState(false);

  const today = format(new Date(), 'yyyy-MM-dd');

  // Load from localStorage
  useEffect(() => {
    const savedWatchlist = localStorage.getItem('watchlist');
    if (savedWatchlist) {
      setWatchlist(JSON.parse(savedWatchlist));
    }

    const savedTrades = localStorage.getItem('trades');
    if (savedTrades) {
      setTrades(JSON.parse(savedTrades));
    }

    // Initialize prices for any new symbols
    const currentPrices = { ...INITIAL_PRICES };
    if (savedWatchlist) {
      const parsed = JSON.parse(savedWatchlist);
      parsed.forEach((sym: string) => {
        if (!currentPrices[sym]) {
          currentPrices[sym] = { price: 1000 + Math.random() * 2000, change: (Math.random() - 0.5) * 2 };
        }
      });
    }
    setPrices(currentPrices);
  }, []);

  // Save to localStorage
  useEffect(() => {
    localStorage.setItem('watchlist', JSON.stringify(watchlist));
  }, [watchlist]);

  useEffect(() => {
    localStorage.setItem('trades', JSON.stringify(trades));
  }, [trades]);

  // Calculate daily P/L
  const calculateDailyPL = (currentTrades: Trade[]) => {
    const todayTrades = currentTrades.filter(t => t.date === today);
    const pl = todayTrades.reduce((sum, trade) => {
      const plValue = trade.side === 'BUY' 
        ? (trade.exitPrice - trade.entryPrice) * trade.quantity - trade.brokerage
        : (trade.entryPrice - trade.exitPrice) * trade.quantity - trade.brokerage;
      return sum + plValue;
    }, 0);
    return pl;
  };

  // Update daily PL and risk status
  useEffect(() => {
    const pl = calculateDailyPL(trades);
    setDailyPL(pl);
    
    const targetReached = pl >= 500;
    const lossReached = pl <= -500;
    
    setIsTargetReached(targetReached);
    setIsLossLimitReached(lossReached);
  }, [trades, today]);

  // Live price simulation
  useEffect(() => {
    const interval = setInterval(() => {
      updatePrices();
    }, 3000); // Update every 3 seconds

    return () => clearInterval(interval);
  }, [watchlist]);

  const updatePrices = () => {
    setPrices(prev => {
      const updated = { ...prev };
      
      watchlist.forEach(symbol => {
        if (updated[symbol]) {
          const current = updated[symbol].price;
          const volatility = 0.004; // 0.4% max change per tick
          const changePercent = (Math.random() - 0.5) * volatility * 2;
          const newPrice = Math.max(50, current * (1 + changePercent));
          const newChange = ((newPrice - current) / current) * 100;
          
          updated[symbol] = {
            price: parseFloat(newPrice.toFixed(2)),
            change: parseFloat(newChange.toFixed(2))
          };
        } else {
          // New symbol
          updated[symbol] = {
            price: 800 + Math.random() * 3000,
            change: (Math.random() - 0.5) * 3
          };
        }
      });
      
      return updated;
    });
  };

  const addToWatchlist = (symbol: string) => {
    const upperSymbol = symbol.toUpperCase().trim();
    if (!upperSymbol || watchlist.includes(upperSymbol)) return;
    
    setWatchlist(prev => [...prev, upperSymbol]);
    
    // Add initial price if not exists
    if (!prices[upperSymbol]) {
      setPrices(prev => ({
        ...prev,
        [upperSymbol]: {
          price: 1000 + Math.random() * 2500,
          change: (Math.random() - 0.5) * 2.5
        }
      }));
    }
  };

  const removeFromWatchlist = (symbol: string) => {
    setWatchlist(prev => prev.filter(s => s !== symbol));
  };

  const addTrade = (tradeData: Omit<Trade, 'id' | 'date' | 'timestamp'>) => {
    const newTrade: Trade = {
      ...tradeData,
      id: Date.now().toString(36) + Math.random().toString(36).substr(2),
      date: today,
      timestamp: new Date().toISOString(),
    };
    
    setTrades(prev => [newTrade, ...prev]);
  };

  const deleteTrade = (id: string) => {
    setTrades(prev => prev.filter(t => t.id !== id));
  };

  const getTodayTrades = () => {
    return trades.filter(t => t.date === today);
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