'use client';

import { useEffect, useMemo, useState } from 'react';
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
      capital: '100000',
      riskAmount: '500',
    };
  }

  try {
    const saved = localStorage.getItem(CALCULATOR_SETTINGS_KEY);

    if (!saved) {
      return {
        capital: '100000',
        riskAmount: '500',
      };
    }

    const parsed = JSON.parse(saved);

    return {
      capital: String(parsed.capital || '100000'),
      riskAmount: String(parsed.riskAmount || '500'),
    };
  } catch {
    return {
      capital: '100000',
      riskAmount: '500',
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
  const [capital, setCapital] = useState('100000');
  const [riskAmount, setRiskAmount] = useState('500');
  const [entryPrice, setEntryPrice] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [targetPrice, setTargetPrice] = useState('');

  useEffect(() => {
    const saved = getDefaultSettings();

    setCapital(saved.capital);
    setRiskAmount(saved.riskAmount);
  }, []);

  useEffect(() => {
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
  }, [capital, riskAmount]);

  const result = useMemo(() => {
    const capitalValue = parseInput(capital);
    const riskValue = parseInput(riskAmount);
    const entry = parseInput(entryPrice);
    const sl = parseInput(stopLoss);
    const target = parseInput(targetPrice);

    const riskPerShare =
      side === 'BUY'
        ? entry > 0 && sl > 0
          ? entry - sl
          : 0
        : entry > 0 && sl > 0
        ? sl - entry
        : 0;

    const isStopLossValid = riskPerShare > 0;

    const quantity =
      isStopLossValid && riskValue > 0
        ? Math.floor(riskValue / riskPerShare)
        : 0;

    const capitalRequired = quantity * entry;
    const maxLoss = quantity * riskPerShare;

    const rewardPerShare =
      target > 0 && entry > 0
        ? side === 'BUY'
          ? target - entry
          : entry - target
        : 0;

    const targetProfit =
      rewardPerShare > 0 && quantity > 0 ? rewardPerShare * quantity : 0;

    const riskReward =
      riskPerShare > 0 && rewardPerShare > 0
        ? rewardPerShare / riskPerShare
        : 0;

    const riskPercent =
      capitalValue > 0 && maxLoss > 0 ? (maxLoss / capitalValue) * 100 : 0;

    const capitalUsagePercent =
      capitalValue > 0 && capitalRequired > 0
        ? (capitalRequired / capitalValue) * 100
        : 0;

    const warnings: string[] = [];

    if (entry > 0 && sl > 0 && !isStopLossValid) {
      warnings.push(
        side === 'BUY'
          ? 'For BUY trades, stop loss must be below entry price.'
          : 'For SELL trades, stop loss must be above entry price.'
      );
    }

    if (entry > 0 && sl > 0 && quantity <= 0 && isStopLossValid) {
      warnings.push(
        'Risk amount is too small for this entry/stop-loss distance. Quantity becomes 0.'
      );
    }

    if (capitalValue > 0 && capitalRequired > capitalValue) {
      warnings.push(
        'Capital required is higher than available capital. Reduce quantity or risk.'
      );
    }

    if (riskPercent > 2) {
      warnings.push(
        `Risk is ${riskPercent.toFixed(
          2
        )}% of capital. Many intraday traders keep risk near 0.5%–1%.`
      );
    }

    if (target > 0 && rewardPerShare <= 0) {
      warnings.push(
        side === 'BUY'
          ? 'For BUY trades, target should be above entry price.'
          : 'For SELL trades, target should be below entry price.'
      );
    }

    return {
      capitalValue,
      riskValue,
      entry,
      sl,
      target,
      riskPerShare,
      isStopLossValid,
      quantity,
      capitalRequired,
      maxLoss,
      rewardPerShare,
      targetProfit,
      riskReward,
      riskPercent,
      capitalUsagePercent,
      warnings,
    };
  }, [capital, riskAmount, entryPrice, stopLoss, targetPrice, side]);

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
        Educational risk calculator only. It does not place orders and does not
        recommend trades.
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
            placeholder="100000"
          />

          <Field
            label="Risk Per Trade ₹"
            value={riskAmount}
            onChange={setRiskAmount}
            placeholder="500"
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
            subtitle={`${formatNumber(
              result.capitalUsagePercent
            )}% of capital`}
            tone={
              result.capitalRequired > result.capitalValue ? 'red' : 'blue'
            }
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
              result.riskReward > 0
                ? `1:${result.riskReward.toFixed(2)}`
                : '--'
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
          <li>• This calculator excludes slippage, taxes, and brokerage impact.</li>
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
          <p className="mt-3 text-sm font-semibold text-red-300">
            Avoid
          </p>
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
