'use client';

import { useEffect, useMemo, useState } from 'react';
import { calculatePositionSizing } from '@/lib/positionSizing';
import {
  AlertTriangle,
  Calculator as CalculatorIcon,
  IndianRupee,
  RotateCcw,
  ShieldCheck,
  Target,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';

type TradeSide = 'BUY' | 'SELL';

const CALCULATOR_SETTINGS_KEY = 'position_size_calculator_v1';

type SavedCalculatorSettings = {
  capital: string;
  riskAmount: string;
};

function formatCurrency(value: number) {
  if (!Number.isFinite(value)) return '₹0.00';

  const sign = value < 0 ? '-' : '';

  return `${sign}₹${Math.abs(value).toFixed(2)}`;
}

function formatNumber(value: number) {
  if (!Number.isFinite(value)) return '0';
  return value.toFixed(2);
}

function parseInput(value: string) {
  return Number(value || 0);
}

function getDefaultSettings(): SavedCalculatorSettings {
  if (typeof window === 'undefined') {
    return {
      capital: '10000',
      riskAmount: '50',
    };
  }

  try {
    const saved = localStorage.getItem(CALCULATOR_SETTINGS_KEY);

    if (!saved) {
      return {
        capital: '10000',
        riskAmount: '50',
      };
    }

    const parsed = JSON.parse(saved);

    return {
      capital: String(parsed.capital || '10000'),
      riskAmount: String(parsed.riskAmount || '50'),
    };
  } catch {
    return {
      capital: '10000',
      riskAmount: '50',
    };
  }
}

function ResultCard({
  label,
  value,
  subtitle,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  subtitle?: string;
  tone?: 'green' | 'red' | 'yellow' | 'blue' | 'neutral';
}) {
  const toneClass =
    tone === 'green'
      ? 'text-emerald-400'
      : tone === 'red'
        ? 'text-red-400'
        : tone === 'yellow'
          ? 'text-yellow-400'
          : tone === 'blue'
            ? 'text-blue-400'
            : 'text-white';

  return (
    <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-2 text-3xl font-bold ${toneClass}`}>{value}</p>
      {subtitle && <p className="mt-2 text-sm text-zinc-500">{subtitle}</p>}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <div className="mb-1.5 text-sm font-medium text-zinc-400">{label}</div>

      <input
        type="number"
        step="0.05"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 font-mono text-white outline-none placeholder:text-zinc-600 focus:border-emerald-500"
      />
    </label>
  );
}

export default function PositionSizeCalculatorPage() {
  const [side, setSide] = useState<TradeSide>('BUY');
  const [capital, setCapital] = useState('10000');
  const [riskAmount, setRiskAmount] = useState('50');
  const [entryPrice, setEntryPrice] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [targetPrice, setTargetPrice] = useState('');
  const [costs, setCosts] = useState('16');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const saved = getDefaultSettings();

    setCapital(saved.capital);
    setRiskAmount(saved.riskAmount);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(
        CALCULATOR_SETTINGS_KEY,
        JSON.stringify({
          capital,
          riskAmount,
        })
      );
    } catch {
      // Ignore localStorage errors
    }
  }, [capital, riskAmount, hydrated]);

  const result = useMemo(() => {
    const capitalValue = parseInput(capital),
      riskValue = Math.max(
        0,
        Math.min(parseInput(riskAmount), 50, capitalValue * 0.005)
      );
    const entry = parseInput(entryPrice),
      sl = parseInput(stopLoss),
      target = parseInput(targetPrice);
    const sizing = calculatePositionSizing({
      side,
      entry,
      stopLoss: sl,
      target,
      maxRiskAmount: riskValue,
      estimatedCharges: parseInput(costs),
      availableCapital: capitalValue * 0.95,
    });
    const quantity = sizing.suggestedQuantity,
      capitalRequired = quantity * entry;
    return {
      capitalValue,
      riskValue,
      entry,
      sl,
      target,
      riskPerShare: sizing.riskPerShare,
      isStopLossValid: sizing.riskPerShare > 0,
      quantity,
      capitalRequired,
      maxLoss: sizing.netLossAtStop,
      rewardPerShare: sizing.rewardPerShare,
      targetProfit: sizing.netProfitAtTarget,
      riskReward: sizing.netRiskReward,
      riskPercent:
        capitalValue > 0 ? (sizing.netLossAtStop / capitalValue) * 100 : 0,
      capitalUsagePercent:
        capitalValue > 0 ? (capitalRequired / capitalValue) * 100 : 0,
      warnings: sizing.warnings,
    };
  }, [capital, riskAmount, entryPrice, stopLoss, targetPrice, side, costs]);

  function resetTradeInputs() {
    setEntryPrice('');
    setStopLoss('');
    setTargetPrice('');
  }

  function useExample() {
    setSide('BUY');
    setEntryPrice('2500');
    setStopLoss('2485');
    setTargetPrice('2530');
  }

  return (
    <div className="space-y-8 pb-8">
      <div className="flex items-start gap-3">
        <div className="rounded-2xl bg-zinc-900 p-3 text-emerald-400">
          <CalculatorIcon className="h-6 w-6" />
        </div>

        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Position Size
          </h1>
          <p className="mt-1 text-zinc-500">
            Calculate quantity from entry, stop loss, and risk.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-yellow-500/20 bg-yellow-500/10 p-4 text-sm text-yellow-200">
        Cash-equity study calculator. Risk capped at ₹50 or 0.5% of capital
        including the entered costs. Cash use capped at 95%; no leverage or
        derivative lots. Paper desk also checks remaining daily/weekly/monthly
        budgets.
      </div>

      <section className="rounded-3xl border border-zinc-800 bg-zinc-900/60 p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">
          Account Risk
        </h2>

        <div className="grid grid-cols-1 gap-4">
          <Field
            label="Trading Capital ₹"
            value={capital}
            onChange={setCapital}
            placeholder="10000"
          />

          <Field
            label="Risk Per Trade ₹"
            value={riskAmount}
            onChange={setRiskAmount}
            placeholder="50"
          />
        </div>

        <div className="mt-4">
          <Field
            label="Total estimated charges + slippage ₹"
            value={costs}
            onChange={setCosts}
          />
        </div>
        <div className="mt-4 rounded-2xl border border-zinc-800 bg-black/20 p-4 text-sm text-zinc-400">
          Current planned risk:{' '}
          <span className="font-mono text-white">
            {result.capitalValue > 0
              ? `${((result.riskValue / result.capitalValue) * 100).toFixed(
                  2
                )}%`
              : '0.00%'}
          </span>{' '}
          of capital.
        </div>
      </section>

      <section className="rounded-3xl border border-zinc-800 bg-zinc-900/60 p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">
          Trade Plan
        </h2>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-zinc-400">
            Trade Side
          </label>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setSide('BUY')}
              className={`flex-1 rounded-2xl py-3 font-semibold ${
                side === 'BUY'
                  ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                  : 'border border-zinc-800 bg-zinc-900 text-zinc-400'
              }`}
            >
              BUY Long
            </button>

            <button
              type="button"
              onClick={() => setSide('SELL')}
              className={`flex-1 rounded-2xl py-3 font-semibold ${
                side === 'SELL'
                  ? 'bg-red-500 text-white shadow-lg shadow-red-500/20'
                  : 'border border-zinc-800 bg-zinc-900 text-zinc-400'
              }`}
            >
              SELL Short
            </button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4">
          <Field
            label="Entry Price ₹"
            value={entryPrice}
            onChange={setEntryPrice}
            placeholder="2500"
          />

          <Field
            label="Stop Loss ₹"
            value={stopLoss}
            onChange={setStopLoss}
            placeholder={side === 'BUY' ? '2485' : '2515'}
          />

          <Field
            label="Target Price ₹ Optional"
            value={targetPrice}
            onChange={setTargetPrice}
            placeholder={side === 'BUY' ? '2530' : '2470'}
          />
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={useExample}
            className="rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm font-semibold text-zinc-300"
          >
            Use Example
          </button>

          <button
            type="button"
            onClick={resetTradeInputs}
            className="flex items-center justify-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm font-semibold text-zinc-300"
          >
            <RotateCcw className="h-4 w-4" />
            Reset Trade
          </button>
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-emerald-400" />
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">
            Calculation Result
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-4">
          <ResultCard
            label="Suggested Quantity"
            value={String(result.quantity)}
            subtitle={
              result.quantity > 0
                ? 'Based on your risk amount and stop loss distance'
                : 'Enter valid entry, stop loss, and risk'
            }
            tone={result.quantity > 0 ? 'green' : 'neutral'}
          />

          <ResultCard
            label="Risk Per Share"
            value={formatCurrency(result.riskPerShare)}
            subtitle={
              result.isStopLossValid
                ? 'Entry minus stop loss distance'
                : 'Invalid stop loss for selected side'
            }
            tone={result.isStopLossValid ? 'yellow' : 'red'}
          />

          <ResultCard
            label="Maximum Loss"
            value={formatCurrency(result.maxLoss)}
            subtitle={`${formatNumber(result.riskPercent)}% of capital`}
            tone={result.riskPercent > 2 ? 'red' : 'yellow'}
          />

          <ResultCard
            label="Capital Required"
            value={formatCurrency(result.capitalRequired)}
            subtitle={`${formatNumber(result.capitalUsagePercent)}% of capital`}
            tone={result.capitalRequired > result.capitalValue ? 'red' : 'blue'}
          />

          <ResultCard
            label="Target Profit"
            value={formatCurrency(result.targetProfit)}
            subtitle={
              result.target > 0
                ? `Reward per share ${formatCurrency(result.rewardPerShare)}`
                : 'Enter target price to calculate'
            }
            tone={result.targetProfit > 0 ? 'green' : 'neutral'}
          />

          <ResultCard
            label="Risk / Reward"
            value={
              result.riskReward > 0 ? `1:${result.riskReward.toFixed(2)}` : '--'
            }
            subtitle={
              result.riskReward >= 2
                ? 'Strong reward compared to risk'
                : result.riskReward >= 1
                  ? 'Reward is at least equal to risk'
                  : 'Enter valid target to calculate'
            }
            tone={
              result.riskReward >= 2
                ? 'green'
                : result.riskReward >= 1
                  ? 'yellow'
                  : 'neutral'
            }
          />
        </div>
      </section>

      {result.warnings.length > 0 && (
        <section className="rounded-3xl border border-red-500/30 bg-red-500/10 p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-red-400" />

            <div>
              <h2 className="font-bold text-red-300">Risk Warnings</h2>

              <ul className="mt-2 space-y-2 text-sm text-red-100/90">
                {result.warnings.map((warning, index) => (
                  <li key={index}>• {warning}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
        <div className="mb-3 flex items-center gap-2">
          <IndianRupee className="h-5 w-5 text-zinc-400" />
          <h2 className="font-bold text-white">How to use</h2>
        </div>

        <ul className="space-y-2 text-sm leading-relaxed text-zinc-400">
          <li>• Decide your risk amount before entering the trade.</li>
          <li>• Enter planned entry and stop loss.</li>
          <li>• Use suggested quantity instead of guessing position size.</li>
          <li>• If capital required is too high, reduce risk or skip trade.</li>
          <li>
            • Include all taxes, brokerage and slippage in the cost estimate;
            this is not an automatic broker fee quote.
          </li>
        </ul>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <div className="rounded-3xl border border-emerald-500/20 bg-emerald-500/10 p-4">
          <TrendingUp className="h-5 w-5 text-emerald-400" />
          <p className="mt-3 text-sm font-semibold text-emerald-300">
            Good habit
          </p>
          <p className="mt-1 text-xs text-zinc-400">
            Calculate quantity before entry.
          </p>
        </div>

        <div className="rounded-3xl border border-red-500/20 bg-red-500/10 p-4">
          <TrendingDown className="h-5 w-5 text-red-400" />
          <p className="mt-3 text-sm font-semibold text-red-300">Avoid</p>
          <p className="mt-1 text-xs text-zinc-400">
            Increasing quantity after loss.
          </p>
        </div>
      </section>

      <section className="rounded-3xl border border-blue-500/20 bg-blue-500/10 p-5">
        <div className="flex items-start gap-3">
          <Target className="mt-0.5 h-6 w-6 shrink-0 text-blue-400" />

          <div>
            <h2 className="font-bold text-blue-300">Rule of thumb</h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-300">
              For intraday trading, many traders keep risk per trade small,
              often around 0.5% to 1% of capital. The goal is survival and
              consistency, not maximum quantity.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
