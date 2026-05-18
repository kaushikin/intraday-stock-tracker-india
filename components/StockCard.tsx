'use client';

import { useApp } from '@/contexts/AppContext';
import { formatPrice } from '@/lib/utils';
import { X } from 'lucide-react';

interface StockCardProps {
  symbol: string;
  showRemove?: boolean;
  onQuickTrade?: (symbol: string) => void;
}

export default function StockCard({ symbol, showRemove = true, onQuickTrade }: StockCardProps) {
  const { prices, removeFromWatchlist } = useApp();
  const data = prices[symbol] || { price: 0, change: 0 };
  const isPositive = data.change >= 0;

  return (
    <div className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800 flex items-center justify-between group">
      <div 
        className="flex-1 cursor-pointer" 
        onClick={() => onQuickTrade && onQuickTrade(symbol)}
      >
        <div className="font-semibold text-lg text-white tracking-tight">{symbol}</div>
        <div className="text-2xl font-mono text-white mt-1">
          ₹{formatPrice(data.price)}
        </div>
      </div>

      <div className="flex flex-col items-end gap-1">
        <div className={`px-3 py-1 rounded-full text-sm font-medium flex items-center gap-1 ${
          isPositive 
            ? 'bg-emerald-500/10 text-emerald-400' 
            : 'bg-red-500/10 text-red-400'
        }`}>
          {isPositive ? '↑' : '↓'} {Math.abs(data.change)}%
        </div>
        
        {showRemove && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              removeFromWatchlist(symbol);
            }}
            className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-zinc-800 rounded-lg transition-all"
          >
            <X className="w-4 h-4 text-zinc-500" />
          </button>
        )}
      </div>
    </div>
  );
}