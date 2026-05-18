'use client';

import { useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import StockCard from '@/components/StockCard';
import TradeFormModal from '@/components/TradeFormModal';
import { Plus, Search } from 'lucide-react';

export default function WatchlistPage() {
  const { watchlist, addToWatchlist, prices } = useApp();
  const [newSymbol, setNewSymbol] = useState('');
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState('');

  const handleAddStock = (e: React.FormEvent) => {
    e.preventDefault();
    if (newSymbol.trim()) {
      addToWatchlist(newSymbol.trim());
      setNewSymbol('');
    }
  };

  const handleQuickTrade = (symbol: string) => {
    setSelectedSymbol(symbol);
    setShowTradeModal(true);
  };

  const popularSuggestions = ['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'SBIN', 'ICICIBANK'].filter(
    s => !watchlist.includes(s)
  );

  return (
    <div className="space-y-8 pb-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Watchlist</h1>
        <p className="text-zinc-500">Track live prices • Tap any stock to trade</p>
      </div>

      {/* Add Stock Form */}
      <form onSubmit={handleAddStock} className="flex gap-3">
        <div className="flex-1 relative">
          <input
            type="text"
            value={newSymbol}
            onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
            placeholder="Enter NSE symbol (e.g. RELIANCE)"
            className="w-full bg-zinc-900 border border-zinc-800 pl-11 py-3.5 rounded-2xl text-white placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500 font-mono"
          />
          <Search className="absolute left-4 top-4 text-zinc-500 w-5 h-5" />
        </div>
        <button 
          type="submit"
          className="bg-emerald-500 hover:bg-emerald-600 transition-colors px-6 rounded-2xl font-medium flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> ADD
        </button>
      </form>

      {/* Popular Suggestions */}
      {popularSuggestions.length > 0 && (
        <div>
          <div className="text-xs uppercase tracking-widest text-zinc-500 mb-3 px-1">SUGGESTED STOCKS</div>
          <div className="flex flex-wrap gap-2">
            {popularSuggestions.slice(0, 6).map((sym) => (
              <button
                key={sym}
                onClick={() => addToWatchlist(sym)}
                className="px-4 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-2xl text-sm text-zinc-300 transition-colors active:scale-[0.97]"
              >
                + {sym}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Watchlist */}
      <div>
        <div className="flex items-center justify-between mb-4 px-1">
          <div className="text-sm text-zinc-400">YOUR WATCHLIST ({watchlist.length})</div>
          <div className="text-xs text-emerald-400">Prices update live</div>
        </div>

        {watchlist.length > 0 ? (
          <div className="space-y-3">
            {watchlist.map((symbol) => (
              <StockCard 
                key={symbol} 
                symbol={symbol} 
                onQuickTrade={handleQuickTrade}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-12 bg-zinc-900/50 rounded-3xl border border-dashed border-zinc-800">
            <div className="text-5xl mb-4">📊</div>
            <p className="text-lg text-zinc-400">Your watchlist is empty</p>
            <p className="text-sm text-zinc-500 mt-1">Add stocks above to start tracking</p>
          </div>
        )}
      </div>

      <div className="text-center text-[10px] text-zinc-500 pt-4">
        Prices are simulated for educational purposes.<br />
        Connect real broker API in production.
      </div>

      <TradeFormModal 
        isOpen={showTradeModal} 
        onClose={() => {
          setShowTradeModal(false);
          setSelectedSymbol('');
        }} 
        defaultSymbol={selectedSymbol}
      />
    </div>
  );
}