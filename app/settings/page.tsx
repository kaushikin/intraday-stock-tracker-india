'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  RotateCcw,
  Save,
  Settings,
  ShieldAlert,
  Target,
  TrendingDown,
} from 'lucide-react';
import { useApp } from '@/contexts/AppContext';
import {
  DEFAULT_TRADE_RULES,
  evaluateTradeRules,
  loadTradeRuleSettings,
  resetTradeRuleSettings,
  saveTradeRuleSettings,
  type TradeRuleSettings,
} from '@/lib/tradeRules';

function Field({
  label,
  description,
  value,
  onChange,
  type = 'number',
}: {
  label: string;
  description: string;
  value: number;
  onChange: (value: number) => void;
  type?: string;
}) {
  return (
    <div className="rounded-3xl border border-slate-800 bg-[#15161b] p-5">
      <label className="text-sm font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </label>

      <p className="mt-1 text-sm text-slate-500">{description}</p>

      <input
        type={type}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-4 w-full rounded-2xl border border-slate-700 bg-black/30 px-4 py-3 text-xl font-bold text-white outline-none focus:border-emerald-500"
      />
    </div>
  );
}

function StatusCard({
  title,
  value,
  subtitle,
  tone = 'neutral',
}: {
  title: string;
  value: string;
  subtitle: string;
  tone?: 'green' | 'red' | 'yellow' | 'neutral';
}) {
  const toneClass =
    tone === 'green'
      ? 'text-green-400'
      : tone === 'red'
      ? 'text-red-400'
      : tone === 'yellow'
      ? 'text-yellow-400'
      : 'text-white';

  return (
    <div className="rounded-3xl border border-slate-800 bg-[#15161b] p-5">
      <p className="text-sm uppercase tracking-wide text-slate-500">{title}</p>
      <p className={`mt-2 text-3xl font-bold ${toneClass}`}>{value}</p>
      <p className="mt-2 text-sm text-slate-500">{subtitle}</p>
    </div>
  );
}

export default function SettingsPage() {
  const { trades } = useApp();

  const [settings, setSettings] = useState<TradeRuleSettings>(
    DEFAULT_TRADE_RULES
  );

  const [savedMessage, setSavedMessage] = useState('');

  useEffect(() => {
    setSettings(loadTradeRuleSettings());
  }, []);

  const status = useMemo(() => {
    return evaluateTradeRules(trades, settings);
  }, [trades, settings]);

  function updateField(key: keyof TradeRuleSettings, value: number) {
    setSavedMessage('');

    setSettings((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  function handleSave() {
    saveTradeRuleSettings(settings);
    setSettings(loadTradeRuleSettings());
    setSavedMessage('Trade rules saved successfully.');
  }

  function handleReset() {
    resetTradeRuleSettings();
    setSettings(loadTradeRuleSettings());
    setSavedMessage('Trade rules reset to default.');
  }

  return (
    <main className="min-h-screen bg-[#050608] px-5 pb-28 pt-8 text-white">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-slate-900 p-3 text-slate-400">
            <Settings className="h-6 w-6" />
          </div>

          <div>
            <h1 className="text-4xl font-bold">Settings</h1>
            <p className="mt-2 text-slate-400">
              Configure risk rules and discipline limits for intraday trading.
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-yellow-500/20 bg-yellow-500/10 p-4 text-sm text-yellow-200">
          These rules are local to this browser. They are for discipline and
          journaling only, not financial advice.
        </div>

        <section className="mt-8">
          <h2 className="mb-4 text-sm uppercase tracking-[0.25em] text-slate-500">
            Trade Rule Settings
          </h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="Daily Target"
              description="When today's net P/L reaches this amount, app suggests stopping."
              value={settings.dailyTarget}
              onChange={(value) => updateField('dailyTarget', value)}
            />

            <Field
              label="Daily Loss Limit"
              description="Use a negative value. Example: -500."
              value={settings.dailyLossLimit}
              onChange={(value) => updateField('dailyLossLimit', value)}
            />

            <Field
              label="Max Trades Per Day"
              description="Warns when you reach this many trades in one day."
              value={settings.maxTradesPerDay}
              onChange={(value) => updateField('maxTradesPerDay', value)}
            />

            <Field
              label="Max Loss Streak"
              description="Warns after this many consecutive losing trades."
              value={settings.maxLossStreak}
              onChange={(value) => updateField('maxLossStreak', value)}
            />
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <button
              onClick={handleSave}
              className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-4 font-bold text-white"
            >
              <Save className="h-5 w-5" />
              Save Rules
            </button>

            <button
              onClick={handleReset}
              className="flex items-center justify-center gap-2 rounded-2xl bg-slate-800 px-5 py-4 font-bold text-slate-300"
            >
              <RotateCcw className="h-5 w-5" />
              Reset Defaults
            </button>
          </div>

          {savedMessage && (
            <div className="mt-4 rounded-2xl border border-green-500/20 bg-green-500/10 p-4 text-sm text-green-300">
              {savedMessage}
            </div>
          )}
        </section>

        <section className="mt-10">
          <h2 className="mb-4 text-sm uppercase tracking-[0.25em] text-slate-500">
            Current Rule Status
          </h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <StatusCard
              title="Today P/L"
              value={`₹${status.dailyPL.toFixed(2)}`}
              subtitle={`Target ₹${settings.dailyTarget} • Loss limit ₹${settings.dailyLossLimit}`}
              tone={
                status.dailyTargetHit
                  ? 'green'
                  : status.dailyLossLimitHit
                  ? 'red'
                  : 'neutral'
              }
            />

            <StatusCard
              title="Trades Today"
              value={`${status.todayTradesCount}/${settings.maxTradesPerDay}`}
              subtitle={
                status.maxTradesHit
                  ? 'Max trades reached'
                  : 'Within trade limit'
              }
              tone={status.maxTradesHit ? 'yellow' : 'neutral'}
            />

            <StatusCard
              title="Loss Streak"
              value={`${status.lossStreak}/${settings.maxLossStreak}`}
              subtitle={
                status.maxLossStreakHit
                  ? 'Loss streak limit reached'
                  : 'Loss streak under control'
              }
              tone={status.maxLossStreakHit ? 'red' : 'neutral'}
            />

            <StatusCard
              title="Trading Status"
              value={status.shouldStopTrading ? 'Stop' : 'Allowed'}
              subtitle={
                status.shouldStopTrading
                  ? 'Rules suggest no more new trades today'
                  : 'No rule limits hit yet'
              }
              tone={status.shouldStopTrading ? 'red' : 'green'}
            />
          </div>
        </section>

        {status.warnings.length > 0 && (
          <section className="mt-8 rounded-3xl border border-red-500/30 bg-red-500/10 p-5">
            <div className="flex items-start gap-3">
              <ShieldAlert className="h-6 w-6 text-red-400" />

              <div>
                <h3 className="font-bold text-red-300">Active Warnings</h3>

                <ul className="mt-2 space-y-2">
                  {status.warnings.map((warning, index) => (
                    <li key={index} className="text-sm text-slate-300">
                      • {warning}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        )}

        <section className="mt-8 rounded-3xl border border-slate-800 bg-[#15161b] p-5">
          <div className="flex items-start gap-3">
            <Target className="h-6 w-6 text-emerald-400" />

            <div>
              <h3 className="font-bold text-white">Recommended Discipline</h3>

              <ul className="mt-3 space-y-2 text-sm text-slate-400">
                <li>• Stop after daily target is hit.</li>
                <li>• Stop immediately after daily loss limit is hit.</li>
                <li>• Avoid overtrading after max trades are reached.</li>
                <li>• Take a break after loss streak warning.</li>
                <li>• Review Analytics and Trade Journal before next session.</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-3xl border border-slate-800 bg-[#15161b] p-5">
          <div className="flex items-start gap-3">
            <TrendingDown className="h-6 w-6 text-red-400" />

            <div>
              <h3 className="font-bold text-white">Default Rule Values</h3>

              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-2xl bg-black/30 p-3">
                  <p className="text-slate-500">Daily Target</p>
                  <p className="font-bold text-green-400">
                    ₹{DEFAULT_TRADE_RULES.dailyTarget}
                  </p>
                </div>

                <div className="rounded-2xl bg-black/30 p-3">
                  <p className="text-slate-500">Daily Loss</p>
                  <p className="font-bold text-red-400">
                    ₹{DEFAULT_TRADE_RULES.dailyLossLimit}
                  </p>
                </div>

                <div className="rounded-2xl bg-black/30 p-3">
                  <p className="text-slate-500">Max Trades</p>
                  <p className="font-bold text-white">
                    {DEFAULT_TRADE_RULES.maxTradesPerDay}
                  </p>
                </div>

                <div className="rounded-2xl bg-black/30 p-3">
                  <p className="text-slate-500">Loss Streak</p>
                  <p className="font-bold text-white">
                    {DEFAULT_TRADE_RULES.maxLossStreak}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}