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

type TradeFormData = {
  symbol: string;
  side: 'BUY' | 'SELL';
  entryPrice: string;
  quantity: string;
  exitPrice: string;
  brokerage: string;
};

const INITIAL_FORM_DATA: TradeFormData = {
  symbol: '',
  side: 'BUY',
  entryPrice: '',
  quantity: '',
  exitPrice: '',
  brokerage: '20',
};

export default function TradeFormModal({
  isOpen,
  onClose,
  defaultSymbol = '',
}: TradeFormModalProps) {
  const { watchlist, addTrade } = useApp();

  const [formData, setFormData] = useState<TradeFormData>({
    ...INITIAL_FORM_DATA,
    symbol: defaultSymbol,
  });

  /**
   * Important:
   * React useState reads defaultSymbol only once during first render.
   * This effect makes quick-trade buttons work correctly by updating
   * the symbol every time the modal opens with a new defaultSymbol.
   */
  useEffect(() => {
    if (!isOpen) return;

    setFormData((prev) => ({
      ...prev,
      symbol: defaultSymbol,
    }));
  }, [isOpen, defaultSymbol]);

  const calculatePreview = () => {
    const entry = parseFloat(formData.entryPrice) || 0;
    const exit = parseFloat(formData.exitPrice) || 0;
    const qty = parseInt(formData.quantity) || 0;
    const brokerage = parseFloat(formData.brokerage) || 0;

    if (!entry || !exit || !qty) return 0;

    if (formData.side === 'BUY') {
      return (exit - entry) * qty - brokerage;
    }

    return (entry - exit) * qty - brokerage;
  };

  const handleChange = (field: keyof TradeFormData, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const resetForm = () => {
    setFormData({
      ...INITIAL_FORM_DATA,
      symbol: defaultSymbol,
    });
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    const entry = parseFloat(formData.entryPrice);
    const exit = parseFloat(formData.exitPrice);
    const quantity = parseInt(formData.quantity);
    const brokerage = parseFloat(formData.brokerage) || 0;
    const symbol = formData.symbol.toUpperCase().trim();

    if (!symbol || !entry || !exit || !quantity) {
      alert('Please fill all required fields');
      return;
    }

    addTrade({
      symbol,
      side: formData.side,
      entryPrice: entry,
      quantity,
      exitPrice: exit,
      brokerage,
    });

    setFormData({
      ...INITIAL_FORM_DATA,
      symbol: '',
    });

    onClose();
  };

  if (!isOpen) return null;

  const currentPL = calculatePreview();

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-zinc-950 w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl border border-zinc-800 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-800">
          <div>
            <h2 className="text-xl font-semibold text-white">
              New Trade Entry
            </h2>
            <p className="text-sm text-zinc-500">Record your intraday trade</p>
          </div>

          <button
            onClick={handleClose}
            className="p-2 hover:bg-zinc-900 rounded-full"
            aria-label="Close trade form"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Symbol */}
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1.5">
              Stock Symbol
            </label>

            <div className="flex gap-2">
              <input
                type="text"
                value={formData.symbol}
                onChange={(event) =>
                  handleChange('symbol', event.target.value.toUpperCase())
                }
                placeholder="RELIANCE"
                className="flex-1 bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3 text-white placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500 font-mono uppercase"
                required
              />

              <select
                onChange={(event) => handleChange('symbol', event.target.value)}
                className="bg-zinc-900 border border-zinc-800 rounded-2xl px-3 text-sm text-zinc-400"
                value=""
              >
                <option value="">Quick</option>
                {watchlist.slice(0, 6).map((symbol) => (
                  <option key={symbol} value={symbol}>
                    {symbol}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Side */}
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

          {/* Prices */}
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
                placeholder="2450.50"
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
                placeholder="2468.75"
                className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3 text-white font-mono focus:outline-none focus:border-emerald-500"
                required
              />
            </div>
          </div>

          {/* Quantity and Brokerage */}
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
                placeholder="25"
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

          {/* Live P/L Preview */}
          <div className="bg-zinc-900/70 rounded-2xl p-4 border border-zinc-800">
            <div className="flex justify-between items-center">
              <span className="text-sm text-zinc-400">Estimated P/L</span>

              <span
                className={`text-2xl font-mono font-semibold ${
                  currentPL >= 0 ? 'text-emerald-400' : 'text-red-400'
                }`}
              >
                {currentPL >= 0 ? '+' : ''}
                {formatCurrency(currentPL)}
              </span>
            </div>

            <div className="text-[10px] text-zinc-500 mt-1">
              Based on entered values
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            className="w-full py-4 bg-white text-black font-semibold rounded-2xl active:scale-[0.985] transition-transform flex items-center justify-center gap-2"
          >
            RECORD TRADE
          </button>

          <p className="text-center text-[10px] text-zinc-500">
            This is for journaling only. Trade responsibly.
          </p>
        </form>
      </div>
    </div>
  );
}
