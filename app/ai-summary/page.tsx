'use client';

import { useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { formatCurrency } from '@/lib/utils';
import { Bot, RefreshCw, AlertTriangle } from 'lucide-react';

interface AISummary {
  summary: string;
  lessons: string;
  tips: string;
  encouragement: string;
}

export default function AISummaryPage() {
  const { getTodayTrades, dailyPL, watchlist } = useApp();
  const [summary, setSummary] = useState<AISummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const todayTrades = getTodayTrades();

  const generateSummary = async () => {
    if (todayTrades.length === 0) {
      setError("You haven't recorded any trades today. Add some trades first!");
      return;
    }

    setIsLoading(true);
    setError('');
    setSummary(null);

    try {
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trades: todayTrades,
          dailyPL,
          watchlist: watchlist.slice(0, 5),
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate AI summary');
      }

      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }

      setSummary(data);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Something went wrong. Please try again.');
      
      // Fallback mock summary for demo (when no API key)
      if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'sk-your-openai-api-key-here') {
        setSummary({
          summary: `Today you executed ${todayTrades.length} trades with a net P/L of ${formatCurrency(dailyPL)}. Your trading activity shows a mix of long and short positions across ${watchlist.length} symbols.`,
          lessons: "One key observation: Consider waiting for clearer setups instead of chasing small moves. Several trades were closed very quickly.",
          tips: "Remember the 1% rule — never risk more than 1% of your capital on a single trade. Also, always define your stop-loss before entering.",
          encouragement: "You're building great habits by journaling. Keep reviewing your trades daily and you'll see consistent improvement in discipline."
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-8 max-w-md mx-auto">
      <div className="text-center pt-4">
        <div className="mx-auto w-16 h-16 bg-gradient-to-br from-purple-500 to-violet-600 rounded-2xl flex items-center justify-center mb-4">
          <Bot className="w-9 h-9 text-white" />
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">AI Trading Coach</h1>
        <p className="text-zinc-400 mt-2">Personalized insights from your day&apos;s trades</p>
      </div>

      {!summary && !isLoading && (
        <div className="bg-zinc-900 rounded-3xl p-8 text-center border border-zinc-800">
          <div className="text-6xl mb-6">🧠</div>
          <h3 className="text-xl font-medium mb-3">Ready for your daily review?</h3>
          <p className="text-sm text-zinc-400 mb-8 max-w-[260px] mx-auto">
            Our AI coach will analyze your trades, highlight lessons, and give you actionable risk management tips.
          </p>
          
          <button
            onClick={generateSummary}
            disabled={todayTrades.length === 0}
            className="bg-white disabled:bg-zinc-700 disabled:text-zinc-400 text-black px-10 py-4 rounded-2xl font-semibold flex items-center justify-center gap-3 mx-auto active:scale-[0.985] transition-all"
          >
            <Bot className="w-5 h-5" />
            ANALYZE MY DAY
          </button>
          
          {todayTrades.length === 0 && (
            <p className="text-xs text-amber-400 mt-4">Add at least one trade to generate insights</p>
          )}
        </div>
      )}

      {isLoading && (
        <div className="bg-zinc-900 rounded-3xl p-10 text-center border border-zinc-800">
          <RefreshCw className="w-10 h-10 animate-spin mx-auto text-emerald-400 mb-6" />
          <div className="text-lg font-medium">Analyzing your trades...</div>
          <div className="text-sm text-zinc-500 mt-2">This usually takes 5–8 seconds</div>
        </div>
      )}

      {error && !summary && (
        <div className="bg-red-950/50 border border-red-900 rounded-3xl p-6 flex gap-4">
          <AlertTriangle className="w-6 h-6 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-red-400">Analysis Failed</div>
            <div className="text-sm text-red-400/80 mt-1">{error}</div>
          </div>
        </div>
      )}

      {summary && (
        <div className="space-y-6">
          <div className="bg-zinc-900 rounded-3xl p-6 border border-zinc-800">
            <div className="uppercase text-xs tracking-[2px] text-purple-400 mb-3">PERFORMANCE SUMMARY</div>
            <p className="text-zinc-200 leading-relaxed">{summary.summary}</p>
          </div>

          <div className="bg-zinc-900 rounded-3xl p-6 border border-zinc-800">
            <div className="uppercase text-xs tracking-[2px] text-amber-400 mb-3">KEY LESSONS</div>
            <p className="text-zinc-200 leading-relaxed">{summary.lessons}</p>
          </div>

          <div className="bg-zinc-900 rounded-3xl p-6 border border-zinc-800">
            <div className="uppercase text-xs tracking-[2px] text-emerald-400 mb-3">RISK MANAGEMENT TIPS</div>
            <p className="text-zinc-200 leading-relaxed">{summary.tips}</p>
          </div>

          <div className="bg-zinc-900 rounded-3xl p-6 border border-zinc-800">
            <div className="uppercase text-xs tracking-[2px] text-blue-400 mb-3">WORDS OF ENCOURAGEMENT</div>
            <p className="text-zinc-200 leading-relaxed italic">"{summary.encouragement}"</p>
          </div>

          <button
            onClick={generateSummary}
            className="w-full py-4 border border-zinc-700 hover:bg-zinc-900 transition-colors rounded-2xl flex items-center justify-center gap-2 text-sm"
          >
            <RefreshCw className="w-4 h-4" /> REGENERATE INSIGHTS
          </button>
        </div>
      )}

      <div className="text-center text-[10px] text-zinc-500 px-8 pt-4">
        Powered by OpenAI • Responses are educational only.<br />
        Never provides buy/sell recommendations.
      </div>
    </div>
  );
}