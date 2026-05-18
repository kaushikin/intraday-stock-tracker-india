'use client';

import { useApp } from '@/contexts/AppContext';
import { formatCurrency } from '@/lib/utils';
import { Trash2, RefreshCw, ExternalLink } from 'lucide-react';

export default function SettingsPage() {
  const { dailyPL, trades, watchlist, addToWatchlist } = useApp();

  const resetAllData = () => {
    if (confirm('Reset all data? This will clear your watchlist and all trades.')) {
      localStorage.clear();
      window.location.reload();
    }
  };

  const resetTodayTrades = () => {
    if (confirm('Clear today\'s trades only?')) {
      const today = new Date().toISOString().split('T')[0];
      const savedTrades = localStorage.getItem('trades');
      if (savedTrades) {
        const parsed = JSON.parse(savedTrades);
        const filtered = parsed.filter((t: any) => t.date !== today);
        localStorage.setItem('trades', JSON.stringify(filtered));
        window.location.reload();
      }
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="text-zinc-500">Manage your tracker preferences</p>
      </div>

      {/* Account / Daily Stats */}
      <div className="bg-zinc-900 rounded-3xl p-6 border border-zinc-800">
        <div className="text-xs uppercase tracking-widest text-zinc-500 mb-4">TODAY&apos;S SNAPSHOT</div>
        
        <div className="space-y-4">
          <div className="flex justify-between">
            <span className="text-zinc-400">Net P/L</span>
            <span className={`font-mono font-semibold ${dailyPL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {dailyPL >= 0 ? '+' : ''}{formatCurrency(dailyPL)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-400">Trades Logged</span>
            <span className="font-mono">{trades.length}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-400">Watchlist Size</span>
            <span className="font-mono">{watchlist.length} stocks</span>
          </div>
        </div>
      </div>

      {/* Risk Limits */}
      <div className="bg-zinc-900 rounded-3xl p-6 border border-zinc-800">
        <div className="text-xs uppercase tracking-widest text-zinc-500 mb-4">DAILY RISK LIMITS</div>
        
        <div className="space-y-5">
          <div>
            <div className="flex justify-between text-sm mb-1.5">
              <span>Profit Target</span>
              <span className="font-medium text-emerald-400">+ ₹500</span>
            </div>
            <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
              <div className="h-2 w-[50%] bg-emerald-500 rounded-full" />
            </div>
          </div>
          
          <div>
            <div className="flex justify-between text-sm mb-1.5">
              <span>Loss Limit</span>
              <span className="font-medium text-red-400">- ₹500</span>
            </div>
            <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
              <div className="h-2 w-[50%] bg-red-500 rounded-full" />
            </div>
          </div>
        </div>
        
        <div className="mt-5 text-xs text-zinc-500">
          These limits are fixed for this demo. In a future version you will be able to customize them.
        </div>
      </div>

      {/* Data Management */}
      <div className="bg-zinc-900 rounded-3xl p-6 border border-zinc-800">
        <div className="text-xs uppercase tracking-widest text-zinc-500 mb-4">DATA MANAGEMENT</div>
        
        <div className="space-y-3">
          <button 
            onClick={resetTodayTrades}
            className="w-full flex items-center justify-between bg-zinc-950 hover:bg-zinc-800 transition-colors px-5 py-4 rounded-2xl text-left"
          >
            <div className="flex items-center gap-3">
              <RefreshCw className="w-5 h-5 text-amber-400" />
              <div>
                <div>Reset Today&apos;s Trades</div>
                <div className="text-xs text-zinc-500">Keeps watchlist intact</div>
              </div>
            </div>
            <div className="text-xs text-amber-400">CLEAR</div>
          </button>

          <button 
            onClick={resetAllData}
            className="w-full flex items-center justify-between bg-zinc-950 hover:bg-red-950/50 transition-colors px-5 py-4 rounded-2xl text-left border border-red-900/50"
          >
            <div className="flex items-center gap-3">
              <Trash2 className="w-5 h-5 text-red-400" />
              <div>
                <div className="text-red-400">Reset Everything</div>
                <div className="text-xs text-zinc-500">Watchlist + all trades</div>
              </div>
            </div>
            <div className="text-xs text-red-400">DELETE</div>
          </button>
        </div>
      </div>

      {/* About */}
      <div className="bg-zinc-900 rounded-3xl p-6 border border-zinc-800 text-sm">
        <div className="text-xs uppercase tracking-widest text-zinc-500 mb-4">ABOUT THIS APP</div>
        
        <div className="space-y-4 text-zinc-400">
          <p>
            Intraday Stock Tracker India is a free educational tool built to help retail traders develop better risk management habits.
          </p>
          
          <div className="pt-3 border-t border-zinc-800 text-xs">
            <div className="font-medium text-white mb-1">Future Roadmap</div>
            <ul className="list-disc list-inside space-y-1 text-zinc-500">
              <li>Real broker API integration (Zerodha, Upstox, etc.)</li>
              <li>Multi-day trade history &amp; analytics</li>
              <li>Export to CSV / PDF reports</li>
              <li>Custom risk limits per user</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="text-center text-[10px] text-zinc-500 pt-4">
        Made for learning • Not for real trading decisions<br />
        <a href="https://github.com" target="_blank" className="inline-flex items-center gap-1 text-emerald-400 hover:underline mt-1">
          View source on GitHub <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
}