'use client';

import { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { formatCurrency } from '@/lib/utils';
import {
  DEFAULT_TRADE_RULES,
  loadTradeRuleSettings,
  type TradeRuleSettings,
} from '@/lib/tradeRules';

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatLimit(value: number) {
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}₹${Math.abs(value).toFixed(0)}`;
}

export default function PLProgress() {
  const { dailyPL } = useApp();

  /**
   * Important:
   * Do NOT read localStorage inside the initial useState value.
   * Next.js server render cannot access localStorage, so the server would render
   * default values while the client immediately renders saved values.
   * That causes hydration mismatch.
   */
  const [settings, setSettings] =
    useState<TradeRuleSettings>(DEFAULT_TRADE_RULES);

  useEffect(() => {
    function refreshSettings() {
      setSettings(loadTradeRuleSettings());
    }

    refreshSettings();

    window.addEventListener('tradeRulesUpdated', refreshSettings);
    window.addEventListener('storage', refreshSettings);

    return () => {
      window.removeEventListener('tradeRulesUpdated', refreshSettings);
      window.removeEventListener('storage', refreshSettings);
    };
  }, []);

  const progress = useMemo(() => {
    const min = settings.dailyLossLimit;
    const max = settings.dailyTarget;
    const range = max - min;

    if (range <= 0) return 50;

    return clamp(((dailyPL - min) / range) * 100, 0, 100);
  }, [dailyPL, settings]);

  const zeroMarker = useMemo(() => {
    const min = settings.dailyLossLimit;
    const max = settings.dailyTarget;
    const range = max - min;

    if (range <= 0) return 50;

    return clamp(((0 - min) / range) * 100, 0, 100);
  }, [settings]);

  const isProfit = dailyPL >= 0;
  const targetHit = dailyPL >= settings.dailyTarget;
  const lossLimitHit = dailyPL <= settings.dailyLossLimit;

  const barColor = targetHit
    ? 'bg-emerald-400'
    : lossLimitHit
    ? 'bg-red-500'
    : isProfit
    ? 'bg-emerald-500'
    : 'bg-red-500';

  return (
    <div className="bg-zinc-900 rounded-[2rem] p-6 border border-zinc-800 shadow-lg">
      <div className="flex items-start justify-between gap-6">
        <div>
          <div className="text-xs sm:text-sm text-zinc-400 uppercase tracking-wide">
            Today&apos;s P/L
          </div>

          <div
            className={`mt-3 font-mono text-6xl sm:text-7xl font-bold tracking-tighter ${
              isProfit ? 'text-emerald-400' : 'text-red-400'
            }`}
          >
            {dailyPL >= 0 ? '+' : ''}
            {formatCurrency(dailyPL)}
          </div>
        </div>

        <div className="text-right shrink-0">
          <div className="text-xs sm:text-sm text-zinc-400 uppercase tracking-wide">
            Target
          </div>
          <div className="mt-1 font-mono text-2xl sm:text-3xl text-emerald-400">
            {formatLimit(settings.dailyTarget)}
          </div>

          <div className="mt-5 text-xs sm:text-sm text-zinc-400 uppercase tracking-wide">
            Loss Limit
          </div>
          <div className="mt-1 font-mono text-2xl sm:text-3xl text-red-400">
            {formatLimit(settings.dailyLossLimit)}
          </div>
        </div>
      </div>

      <div className="mt-8">
        <div className="relative h-3 rounded-full bg-zinc-800 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
            style={{ width: `${progress}%` }}
          />

          <div
            className="absolute top-0 h-full w-0.5 bg-zinc-500"
            style={{ left: `${zeroMarker}%` }}
          />
        </div>

        <div className="mt-4 flex justify-between text-sm font-mono text-zinc-500">
          <span>{formatLimit(settings.dailyLossLimit)}</span>
          <span>0</span>
          <span>{formatLimit(settings.dailyTarget)}</span>
        </div>
      </div>

      {targetHit && (
        <div className="mt-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">
          🎯 Daily target reached. Consider stopping for the day.
        </div>
      )}

      {lossLimitHit && (
        <div className="mt-5 rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          🛑 Daily loss limit hit. Stop trading and protect capital.
        </div>
      )}
    </div>
  );
}
