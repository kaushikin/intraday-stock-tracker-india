'use client';

import { useEffect, useState } from 'react';
import { Ban, CheckCircle2, ShieldAlert, TriangleAlert } from 'lucide-react';
import { useApp } from '@/contexts/AppContext';
import {
  evaluateTradeRules,
  loadTradeRuleSettings,
  type TradeRuleSettings,
} from '@/lib/tradeRules';

export default function TradeRulesAlert() {
  const { trades } = useApp();
  const [settings, setSettings] = useState<TradeRuleSettings>(() =>
    loadTradeRuleSettings()
  );

  useEffect(() => {
    function refreshSettings() {
      setSettings(loadTradeRuleSettings());
    }

    window.addEventListener('tradeRulesUpdated', refreshSettings);
    window.addEventListener('storage', refreshSettings);

    return () => {
      window.removeEventListener('tradeRulesUpdated', refreshSettings);
      window.removeEventListener('storage', refreshSettings);
    };
  }, []);

  const status = evaluateTradeRules(trades, settings);

  if (!status.warnings.length) {
    return null;
  }

  const danger = status.dailyLossLimitHit || status.maxLossStreakHit;
  const successOnly =
    status.dailyTargetHit &&
    !status.dailyLossLimitHit &&
    !status.maxLossStreakHit;

  return (
    <div
      className={`rounded-3xl border p-5 ${
        danger
          ? 'border-red-500/30 bg-red-500/10'
          : successOnly
          ? 'border-green-500/30 bg-green-500/10'
          : 'border-yellow-500/30 bg-yellow-500/10'
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={
            danger
              ? 'text-red-400'
              : successOnly
              ? 'text-green-400'
              : 'text-yellow-300'
          }
        >
          {danger ? (
            <Ban className="h-6 w-6" />
          ) : successOnly ? (
            <CheckCircle2 className="h-6 w-6" />
          ) : (
            <TriangleAlert className="h-6 w-6" />
          )}
        </div>

        <div>
          <h3
            className={`font-bold ${
              danger
                ? 'text-red-300'
                : successOnly
                ? 'text-green-300'
                : 'text-yellow-200'
            }`}
          >
            {status.shouldStopTrading
              ? 'Trade Rules Triggered'
              : 'Trade Rule Warning'}
          </h3>

          <ul className="mt-2 space-y-2">
            {status.warnings.map((warning, index) => (
              <li key={index} className="text-sm text-slate-300">
                • {warning}
              </li>
            ))}
          </ul>

          <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-slate-400 sm:grid-cols-4">
            <div className="rounded-2xl bg-black/30 p-3">
              <p>Daily P/L</p>
              <p
                className={
                  status.dailyPL >= 0
                    ? 'font-bold text-green-400'
                    : 'font-bold text-red-400'
                }
              >
                ₹{status.dailyPL.toFixed(2)}
              </p>
            </div>

            <div className="rounded-2xl bg-black/30 p-3">
              <p>Trades</p>
              <p className="font-bold text-white">
                {status.todayTradesCount}/{status.rules.maxTradesPerDay}
              </p>
            </div>

            <div className="rounded-2xl bg-black/30 p-3">
              <p>Loss Streak</p>
              <p className="font-bold text-white">
                {status.lossStreak}/{status.rules.maxLossStreak}
              </p>
            </div>

            <div className="rounded-2xl bg-black/30 p-3">
              <p>Loss Limit</p>
              <p className="font-bold text-red-400">
                ₹{status.rules.dailyLossLimit}
              </p>
            </div>
          </div>

          {status.shouldStopTrading && (
            <div className="mt-4 flex items-center gap-2 rounded-2xl bg-black/30 p-3 text-sm text-slate-300">
              <ShieldAlert className="h-4 w-4" />
              Recommended action: Stop taking new trades and review your journal.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}