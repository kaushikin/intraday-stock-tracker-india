'use client';

import { useEffect, useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { X } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface TradeFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultSymbol?: string;
}

type TradeOutcome = 'HIT_TARGET' | 'HIT_SL' | 'BREAKEVEN' | 'MANUAL_EXIT';

type TradeFormData = {
  symbol: string;
  side: 'BUY' | 'SELL';
  entryPrice: string;
  quantity: string;
  exitPrice: string;
  brokerage: string;
  stopLoss: string;
  target: string;
  outcome: '' | TradeOutcome;
  setup: string;
  emotion: string;
  mistake: string;
  notes: string;
};

const SETUP_OPTIONS = ['Breakout', 'Pullback', 'Reversal', 'Scalping', 'News', 'Other'];
const EMOTION_OPTIONS = ['Calm', 'FOMO', 'Revenge', 'Fear', 'Overconfident', 'Other'];
const MISTAKE_OPTIONS = ['None', 'Late Entry', 'Early Exit', 'No Stop Loss', 'Overtrading', 'Chased Entry', 'Other'];
const OUTCOME_OPTIONS: { value: '' | TradeOutcome; label: string }[] = [
  { value: '', label: 'Select outcome (optional)' },
  { value: 'HIT_TARGET', label: '✅ Hit Target' },
  { value: 'HIT_SL', label: '❌ Hit Stop Loss' },
  { value: 'BREAKEVEN', label: 'Breakeven' },
  { value: 'MANUAL_EXIT', label: 'Manual Exit' },
];

const INITIAL_FORM_DATA: TradeFormData = {
  symbol: '',
  side: 'BUY',
  entryPrice: '',
  quantity: '',
  exitPrice: '',
  brokerage: '20',
  stopLoss: '',
  target: '',
  outcome: '',
  setup: '',
  emotion: '',
  mistake: 'None',
  notes: '',
};

export default function TradeFormModal({ isOpen, onClose, defaultSymbol = '' }: TradeFormModalProps) {
  const { watchlist, addTrade } = useApp();

  const [formData, setFormData] = useState<TradeFormData>({
    ...INITIAL_FORM_DATA,
    symbol: defaultSymbol,
  });

  useEffect(() => {
    if (!isOpen) return;
    setFormData({ ...INITIAL_FORM_DATA, symbol: defaultSymbol });
  }, [isOpen, defaultSymbol]);

  const calculatePreview = () => {
    const entry = parseFloat(formData.entryPrice) || 0;
    const exit = parseFloat(formData.exitPrice) || 0;
    const qty = parseInt(formData.quantity) || 0;
    const brok = parseFloat(formData.brokerage) || 0;
    const sl = parseFloat(formData.stopLoss) || 0;
    const tgt = parseFloat(formData.target) || 0;

    if (!entry || !exit || !qty) {
      return { pl: 0, risk: 0, reward: 0, rr: '0' };
    }

    const pl = formData.side === 'BUY'
      ? (exit - entry) * qty - brok
      : (entry - exit) * qty - brok;

    let risk = 0;
    if (sl > 0) {
      risk = formData.side === 'BUY' 
        ? (entry - sl) * qty + brok 
        : (sl - entry) * qty + brok;
    }

    let reward = 0;
    if (tgt > 0) {
      reward = formData.side === 'BUY' 
        ? (tgt - entry) * qty - brok 
        : (entry - tgt) * qty - brok;
    }

    const rr = risk > 0 && reward > 0 ? (reward / risk).toFixed(2) : '0';

    return { pl, risk, reward, rr };
  };

  const preview = calculatePreview();

  const handleChange = (field: keyof TradeFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const entry = parseFloat(formData.entryPrice);
    const exit = parseFloat(formData.exitPrice);
    const qty = parseInt(formData.quantity);
    const brok = parseFloat(formData.brokerage) || 0;
    const symbol = formData.symbol.toUpperCase().trim();

    if (!symbol || !entry || !exit || !qty) {
      alert('Please fill Symbol, Entry, Exit and Quantity');
      return;
    }

    addTrade({
      symbol,
      side: formData.side,
      entryPrice: entry,
      quantity: qty,
      exitPrice: exit,
      brokerage: brok,
      stopLoss: formData.stopLoss ? parseFloat(formData.stopLoss) : undefined,
      target: formData.target ? parseFloat(formData.target) : undefined,
      outcome: formData.outcome === '' ? undefined : formData.outcome,
      setup: formData.setup || undefined,
      emotion: formData.emotion || undefined,
      mistake: formData.mistake || undefined,
      notes: formData.notes.trim() || undefined,
    });

    setFormData({ ...INITIAL_FORM_DATA, symbol: '' });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-zinc-950 w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl border border-zinc-800 overflow-hidden max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-5 border-b border-zinc-800 bg-zinc-950">
          <div>
            <h2 className="text-xl font-semibold text-white">New Trade Entry</h2>
            <p className="text-sm text-zinc-500">Record trade + planned SL/Target + psychology</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-zinc-900 rounded-full"><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Symbol */}
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1.5">Stock Symbol</label>
            <div className="flex gap-2">
              <input type="text" value={formData.symbol} onChange={(e) => handleChange('symbol', e.target.value.toUpperCase())} placeholder="RELIANCE" className="flex-1 bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3 text-white placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500 font-mono uppercase" required />
              <select onChange={(e) => handleChange('symbol', e.target.value)} className="bg-zinc-900 border border-zinc-800 rounded-2xl px-3 text-sm text-zinc-400" value="">
                <option value="">Quick</option>
                {watchlist.slice(0, 6).map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* Side */}
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1.5">Trade Side</label>
            <div className="flex gap-3">
              <button type="button" onClick={() => handleChange('side', 'BUY')} className={`flex-1 py-3 rounded-2xl font-semibold transition-all ${formData.side === 'BUY' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30' : 'bg-zinc-900 text-zinc-400 border border-zinc-800'}`}>BUY Long</button>
              <button type="button" onClick={() => handleChange('side', 'SELL')} className={`flex-1 py-3 rounded-2xl font-semibold transition-all ${formData.side === 'SELL' ? 'bg-red-500 text-white shadow-lg shadow-red-500/30' : 'bg-zinc-900 text-zinc-400 border border-zinc-800'}`}>SELL Short</button>
            </div>
          </div>

          {/* Entry + Exit */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1.5">Entry Price ₹</label>
              <input type="number" step="0.05" value={formData.entryPrice} onChange={(e) => handleChange('entryPrice', e.target.value)} placeholder="2450.50" className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3 text-white font-mono focus:outline-none focus:border-emerald-500" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1.5">Exit Price ₹</label>
              <input type="number" step="0.05" value={formData.exitPrice} onChange={(e) => handleChange('exitPrice', e.target.value)} placeholder="2468.75" className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3 text-white font-mono focus:outline-none focus:border-emerald-500" required />
            </div>
          </div>

          {/* Stop Loss + Target */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-amber-400 mb-1.5">Stop Loss ₹</label>
              <input type="number" step="0.05" value={formData.stopLoss} onChange={(e) => handleChange('stopLoss', e.target.value)} placeholder="2435.00" className="w-full bg-zinc-900 border border-amber-800/50 rounded-2xl px-4 py-3 text-white font-mono focus:border-amber-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-emerald-400 mb-1.5">Target ₹</label>
              <input type="number" step="0.05" value={formData.target} onChange={(e) => handleChange('target', e.target.value)} placeholder="2485.00" className="w-full bg-zinc-900 border border-emerald-800/50 rounded-2xl px-4 py-3 text-white font-mono focus:border-emerald-500" />
            </div>
          </div>

          {/* Risk : Reward Preview */}
          {(preview.risk > 0 || preview.reward > 0) && (
            <div className="bg-zinc-900/70 rounded-2xl p-4 border border-zinc-800">
              <div className="text-xs text-zinc-400 mb-2">TRADE PLAN (Risk : Reward)</div>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-xs text-amber-400">RISK (if SL hits)</div>
                  <div className="text-lg font-mono font-semibold text-amber-400">₹{preview.risk.toFixed(0)}</div>
                </div>
                <div>
                  <div className="text-xs text-emerald-400">REWARD (if Target hits)</div>
                  <div className="text-lg font-mono font-semibold text-emerald-400">₹{preview.reward.toFixed(0)}</div>
                </div>
                <div>
                  <div className="text-xs text-white">R:R RATIO</div>
                  <div className="text-xl font-mono font-bold text-white">{preview.rr}:1</div>
                </div>
              </div>
            </div>
          )}

          {/* Quantity + Brokerage */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1.5">Quantity</label>
              <input type="number" value={formData.quantity} onChange={(e) => handleChange('quantity', e.target.value)} placeholder="25" className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3 text-white font-mono focus:outline-none focus:border-emerald-500" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1.5">Brokerage ₹</label>
              <input type="number" step="0.01" value={formData.brokerage} onChange={(e) => handleChange('brokerage', e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3 text-white font-mono focus:outline-none focus:border-emerald-500" />
            </div>
          </div>

          {/* Outcome */}
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1.5">Trade Outcome</label>
            <select value={formData.outcome} onChange={(e) => handleChange('outcome', e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500">
              {OUTCOME_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Journal Details */}
          <div className="rounded-3xl border border-zinc-800 bg-zinc-900/40 p-4 space-y-4">
            <div>
              <div className="text-sm font-semibold text-white">Journal Details</div>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1.5">Setup</label>
              <select value={formData.setup} onChange={(e) => handleChange('setup', e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500">
                <option value="">Select setup</option>
                {SETUP_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1.5">Emotion</label>
              <select value={formData.emotion} onChange={(e) => handleChange('emotion', e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500">
                <option value="">Select emotion</option>
                {EMOTION_OPTIONS.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1.5">Mistake</label>
              <select value={formData.mistake} onChange={(e) => handleChange('mistake', e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500">
                {MISTAKE_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1.5">Notes</label>
              <textarea value={formData.notes} onChange={(e) => handleChange('notes', e.target.value)} placeholder="Why did you take this trade?" rows={3} className="w-full resize-none bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500" />
            </div>
          </div>

          {/* P/L Preview */}
          <div className="bg-zinc-900/70 rounded-2xl p-4 border border-zinc-800">
            <div className="flex justify-between items-center">
              <span className="text-sm text-zinc-400">Estimated P/L</span>
              <span className={`text-2xl font-mono font-semibold ${preview.pl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {preview.pl >= 0 ? '+' : ''}{formatCurrency(preview.pl)}
              </span>
            </div>
          </div>

          <button type="submit" className="w-full py-4 bg-white text-black font-semibold rounded-2xl active:scale-[0.985]">
            RECORD TRADE
          </button>
        </form>
      </div>
    </div>
  );
}
