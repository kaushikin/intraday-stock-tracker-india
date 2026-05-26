'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useApp, type Trade } from '@/contexts/AppContext';
import { formatCurrency } from '@/lib/utils';

type EditTradeModalProps = {
  trade: Trade | null;
  isOpen: boolean;
  onClose: () => void;
};

type TradeFormData = {
  symbol: string;
  side: 'BUY' | 'SELL';
  entryPrice: string;
  quantity: string;
  exitPrice: string;
  brokerage: string;
  setup: string;
  emotion: string;
  mistake: string;
  notes: string;
};

const SETUP_OPTIONS = [
  'Breakout',
  'Pullback',
  'Reversal',
  'Scalping',
  'News',
  'Other',
];

const EMOTION_OPTIONS = [
  'Calm',
  'FOMO',
  'Revenge',
  'Fear',
  'Overconfident',
  'Other',
];

const MISTAKE_OPTIONS = [
  'None',
  'Late Entry',
  'Early Exit',
  'No Stop Loss',
  'Overtrading',
  'Chased Entry',
  'Other',
];

const EMPTY_FORM: TradeFormData = {
  symbol: '',
  side: 'BUY',
  entryPrice: '',
  quantity: '',
  exitPrice: '',
  brokerage: '20',
  setup: '',
  emotion: '',
  mistake: 'None',
  notes: '',
};

function getInitialFormData(trade: Trade | null): TradeFormData {
  if (!trade) {
    return EMPTY_FORM;
  }

  return {
    symbol: trade.symbol || '',
    side: trade.side || 'BUY',
    entryPrice: String(trade.entryPrice ?? ''),
    quantity: String(trade.quantity ?? ''),
    exitPrice: String(trade.exitPrice ?? ''),
    brokerage: String(trade.brokerage ?? '20'),
    setup: trade.setup || '',
    emotion: trade.emotion || '',
    mistake: trade.mistake || 'None',
    notes: trade.notes || '',
  };
}

export default function EditTradeModal({
  trade,
  isOpen,
  onClose,
}: EditTradeModalProps) {
  const { updateTrade } = useApp();

  const [formData, setFormData] = useState<TradeFormData>(EMPTY_FORM);

  useEffect(() => {
    if (!isOpen) return;

    setFormData(getInitialFormData(trade));
  }, [isOpen, trade]);

  if (!isOpen || !trade) {
    return null;
  }

  const handleChange = (field: keyof TradeFormData, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const calculatePreview = () => {
    const entry = parseFloat(formData.entryPrice) || 0;
    const exit = parseFloat(formData.exitPrice) || 0;
    const quantity = parseInt(formData.quantity) || 0;
    const brokerage = parseFloat(formData.brokerage) || 0;

    if (!entry || !exit || !quantity) {
      return 0;
    }

    if (formData.side === 'BUY') {
      return (exit - entry) * quantity - brokerage;
    }

    return (entry - exit) * quantity - brokerage;
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    const symbol = formData.symbol.toUpperCase().trim();
    const entryPrice = parseFloat(formData.entryPrice);
    const exitPrice = parseFloat(formData.exitPrice);
    const quantity = parseInt(formData.quantity);
    const brokerage = parseFloat(formData.brokerage) || 0;

    if (!symbol || !entryPrice || !exitPrice || !quantity) {
      alert('Please fill all required trade fields');
      return;
    }

    updateTrade(trade.id, {
      symbol,
      side: formData.side,
      entryPrice,
      exitPrice,
      quantity,
      brokerage,
      setup: formData.setup || undefined,
      emotion: formData.emotion || undefined,
      mistake: formData.mistake || undefined,
      notes: formData.notes.trim() || undefined,
    });

    onClose();
  };

  const currentPL = calculatePreview();

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-zinc-950 w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl border border-zinc-800 overflow-hidden max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-5 border-b border-zinc-800 bg-zinc-950">
          <div>
            <h2 className="text-xl font-semibold text-white">Edit Trade</h2>
            <p className="text-sm text-zinc-500">
              Update trade details and journal notes
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-2 hover:bg-zinc-900 rounded-full"
            aria-label="Close edit trade form"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1.5">
              Stock Symbol
            </label>

            <input
              type="text"
              value={formData.symbol}
              onChange={(event) =>
                handleChange('symbol', event.target.value.toUpperCase())
              }
              placeholder="RELIANCE"
              className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3 text-white placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500 font-mono uppercase"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1.5">
              Trade Side
            </label>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => handleChange('side', 'BUY')}
                className={`flex-1 py-3 rounded-2xl font-semibold transition-all ${
                  formData.side === 'BUY'
                    ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30'
                    : 'bg-zinc-900 text-zinc-400 border border-zinc-800'
                }`}
              >
                BUY Long
              </button>

              <button
                type="button"
                onClick={() => handleChange('side', 'SELL')}
                className={`flex-1 py-3 rounded-2xl font-semibold transition-all ${
                  formData.side === 'SELL'
                    ? 'bg-red-500 text-white shadow-lg shadow-red-500/30'
                    : 'bg-zinc-900 text-zinc-400 border border-zinc-800'
                }`}
              >
                SELL Short
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1.5">
                Entry Price ₹
              </label>

              <input
                type="number"
                step="0.05"
                value={formData.entryPrice}
                onChange={(event) =>
                  handleChange('entryPrice', event.target.value)
                }
                className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3 text-white font-mono focus:outline-none focus:border-emerald-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1.5">
                Exit Price ₹
              </label>

              <input
                type="number"
                step="0.05"
                value={formData.exitPrice}
                onChange={(event) =>
                  handleChange('exitPrice', event.target.value)
                }
                className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3 text-white font-mono focus:outline-none focus:border-emerald-500"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1.5">
                Quantity
              </label>

              <input
                type="number"
                value={formData.quantity}
                onChange={(event) =>
                  handleChange('quantity', event.target.value)
                }
                className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3 text-white font-mono focus:outline-none focus:border-emerald-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1.5">
                Brokerage ₹
              </label>

              <input
                type="number"
                step="0.01"
                value={formData.brokerage}
                onChange={(event) =>
                  handleChange('brokerage', event.target.value)
                }
                className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3 text-white font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="rounded-3xl border border-zinc-800 bg-zinc-900/40 p-4 space-y-4">
            <div>
              <div className="text-sm font-semibold text-white">
                Journal Details
              </div>
              <p className="mt-1 text-xs text-zinc-500">
                Edit setup, emotion, mistake, and notes after reviewing.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1.5">
                Setup
              </label>

              <select
                value={formData.setup}
                onChange={(event) => handleChange('setup', event.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="">Select setup</option>
                {SETUP_OPTIONS.map((setup) => (
                  <option key={setup} value={setup}>
                    {setup}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1.5">
                Emotion
              </label>

              <select
                value={formData.emotion}
                onChange={(event) => handleChange('emotion', event.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="">Select emotion</option>
                {EMOTION_OPTIONS.map((emotion) => (
                  <option key={emotion} value={emotion}>
                    {emotion}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1.5">
                Mistake
              </label>

              <select
                value={formData.mistake}
                onChange={(event) => handleChange('mistake', event.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500"
              >
                {MISTAKE_OPTIONS.map((mistake) => (
                  <option key={mistake} value={mistake}>
                    {mistake}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1.5">
                Notes
              </label>

              <textarea
                value={formData.notes}
                onChange={(event) => handleChange('notes', event.target.value)}
                placeholder="What did you observe? Did you follow your plan?"
                rows={4}
                className="w-full resize-none bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="bg-zinc-900/70 rounded-2xl p-4 border border-zinc-800">
            <div className="flex justify-between items-center">
              <span className="text-sm text-zinc-400">Updated P/L</span>

              <span
                className={`text-2xl font-mono font-semibold ${
                  currentPL >= 0 ? 'text-emerald-400' : 'text-red-400'
                }`}
              >
                {currentPL >= 0 ? '+' : ''}
                {formatCurrency(currentPL)}
              </span>
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-4 bg-white text-black font-semibold rounded-2xl active:scale-[0.985] transition-transform"
          >
            SAVE CHANGES
          </button>
        </form>
      </div>
    </div>
  );
}
