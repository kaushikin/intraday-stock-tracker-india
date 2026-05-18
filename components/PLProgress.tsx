'use client';

import { useApp } from '@/contexts/AppContext';
import { formatCurrency } from '@/lib/utils';

export default function PLProgress() {
  const { dailyPL, isTargetReached, isLossLimitReached } = useApp();
  
  const target = 500;
  const lossLimit = -500;
  const range = target - lossLimit; // 1000
  const progress = Math.max(0, Math.min(100, ((dailyPL - lossLimit) / range) * 100));

  const getStatusColor = () => {
    if (isTargetReached) return 'emerald';
    if (isLossLimitReached) return 'red';
    if (dailyPL > 0) return 'emerald';
    if (dailyPL < 0) return 'red';
    return 'zinc';
  };

  const statusColor = getStatusColor();

  return (
    <div className="bg-zinc-900 rounded-3xl p-6 border border-zinc-800">
      <div className="flex justify-between items-start mb-6">
        <div>
          <div className="text-sm text-zinc-400">TODAY&apos;S P/L</div>
          <div className={`text-5xl font-semibold tabular-nums tracking-tighter mt-1 font-mono ${dailyPL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {dailyPL >= 0 ? '+' : ''}{formatCurrency(dailyPL)}
          </div>
        </div>
        
        <div className="text-right">
          <div className="text-xs text-zinc-500">TARGET</div>
          <div className="text-emerald-400 font-medium">+₹500</div>
          <div className="text-xs text-zinc-500 mt-1">LOSS LIMIT</div>
          <div className="text-red-400 font-medium">-₹500</div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="relative h-3 bg-zinc-800 rounded-full overflow-hidden mb-2">
        <div 
          className={`absolute top-0 left-0 h-full rounded-full transition-all duration-500 ${
            statusColor === 'emerald' ? 'bg-emerald-500' : 
            statusColor === 'red' ? 'bg-red-500' : 'bg-zinc-400'
          }`}
          style={{ width: `${progress}%` }}
        />
        
        {/* Center marker */}
        <div className="absolute top-1/2 left-1/2 w-0.5 h-5 bg-white/30 -translate-y-1/2" />
      </div>

      <div className="flex justify-between text-xs text-zinc-500 px-1">
        <div>-₹500</div>
        <div className="text-center">0</div>
        <div>+₹500</div>
      </div>

      {/* Status Messages */}
      {isTargetReached && (
        <div className="mt-4 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-emerald-400 text-sm flex items-start gap-3">
          <div className="text-xl mt-0.5">🎯</div>
          <div>
            <div className="font-semibold">Target Reached!</div>
            <div className="text-xs opacity-80 mt-0.5">Excellent discipline. Consider stopping for today.</div>
          </div>
        </div>
      )}

      {isLossLimitReached && (
        <div className="mt-4 p-4 bg-red-500/10 border border-red-500/30 rounded-2xl text-red-400 text-sm flex items-start gap-3">
          <div className="text-xl mt-0.5">⚠️</div>
          <div>
            <div className="font-semibold">Loss Limit Reached</div>
            <div className="text-xs opacity-80 mt-0.5">Step back. Review your trades and protect capital.</div>
          </div>
        </div>
      )}
    </div>
  );
}