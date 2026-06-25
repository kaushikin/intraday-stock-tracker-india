'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Gem,
  RefreshCw,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import {
  INSTRUMENTS,
  NIFTY50_SYMBOLS,
  NATURAL_RESOURCES_SYMBOLS,
} from '@/lib/instruments';
import { generateSignalForStock } from '@/lib/signalEngine';
import type { CandleData, PriceData } from '@/contexts/AppContext';

type MarketQuote = PriceData & {
  symbol: string;
  exchange: 'NSE' | 'BSE' | 'MCX';
  tradingSymbol?: string;
  name?: string;
};

type MarketQuoteError = {
  exchange?: string;
  symbol?: string;
  token?: string;
  chunk?: number;
  symbols?: string[];
  tokens?: string[];
  error?: string;
};

type MarketQuoteSummary = {
  requested: number;
  fetched: number;
  errors: number;
  chunkSize: number;
} | null;

function formatPrice(value: number) {
  if (!value) return '--';
  return `₹${value.toFixed(2)}`;
}

function formatChange(value: number) {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function isNearHigh(quote: MarketQuote) {
  if (!quote.price || !quote.high || !quote.low) return false;

  const range = quote.high - quote.low;

  if (range <= 0) return false;

  return quote.price >= quote.high - range * 0.2;
}

function isNearLow(quote: MarketQuote) {
  if (!quote.price || !quote.high || !quote.low) return false;

  const range = quote.high - quote.low;

  if (range <= 0) return false;

  return quote.price <= quote.low + range * 0.2;
}

function getSignalCandidateSymbols(quotes: Record<string, MarketQuote>) {
  const quoteList = Object.values(quotes).filter((quote) => {
    return (
      quote.exchange === 'NSE' &&
      quote.price > 0 &&
      Boolean(quote.open && quote.high && quote.low) &&
      quote.symbol !== 'NIFTY' &&
      quote.symbol !== 'BANKNIFTY'
    );
  });

  const buyCandidates = quoteList
    .filter((quote) => {
      if (!quote.open || !quote.high || !quote.low) return false;

      const range = quote.high - quote.low;
      if (range <= 0) return false;

      const positionInRange = (quote.price - quote.low) / range;

      return (
        quote.price > quote.open &&
        quote.change > 0 &&
        positionInRange >= 0.45
      );
    })
    .sort((a, b) => b.change - a.change)
    .slice(0, 6)
    .map((quote) => quote.symbol);

  const sellCandidates = quoteList
    .filter((quote) => {
      if (!quote.open || !quote.high || !quote.low) return false;

      const range = quote.high - quote.low;
      if (range <= 0) return false;

      const positionInRange = (quote.price - quote.low) / range;

      return (
        quote.price < quote.open &&
        quote.change < 0 &&
        positionInRange <= 0.55
      );
    })
    .sort((a, b) => a.change - b.change)
    .slice(0, 6)
    .map((quote) => quote.symbol);

  return Array.from(
    new Set([...buyCandidates, ...sellCandidates, 'NIFTY', 'BANKNIFTY'])
  ).filter((symbol) => INSTRUMENTS[symbol]);
}

function MarketCard({ quote }: { quote: MarketQuote }) {
  const positive = quote.change >= 0;

  return (
    <div className="rounded-3xl border border-slate-800 bg-[#15161b] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-xl font-bold text-white">{quote.symbol}</h3>
          <p className="mt-1 text-sm text-slate-500">
            {quote.name || quote.tradingSymbol || quote.exchange}
          </p>
        </div>

        <span
          className={`rounded-full px-3 py-1 text-sm font-bold ${
            positive
              ? 'bg-green-500/15 text-green-400'
              : 'bg-red-500/15 text-red-400'
          }`}
        >
          {formatChange(quote.change)}
        </span>
      </div>

      <p className="mt-4 text-3xl font-bold text-white">
        {formatPrice(quote.price)}
      </p>

      <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
        <div className="rounded-2xl bg-black/30 p-3">
          <p className="text-slate-500">Open</p>
          <p className="font-semibold text-white">{formatPrice(quote.open || 0)}</p>
        </div>

        <div className="rounded-2xl bg-black/30 p-3">
          <p className="text-slate-500">High</p>
          <p className="font-semibold text-green-400">
            {formatPrice(quote.high || 0)}
          </p>
        </div>

        <div className="rounded-2xl bg-black/30 p-3">
          <p className="text-slate-500">Low</p>
          <p className="font-semibold text-red-400">
            {formatPrice(quote.low || 0)}
          </p>
        </div>
      </div>
    </div>
  );
}

function CompactRow({ quote }: { quote: MarketQuote }) {
  const positive = quote.change >= 0;

  return (
    <div className="flex items-center justify-between rounded-2xl border border-slate-800 bg-[#15161b] p-4">
      <div>
        <p className="font-bold text-white">{quote.symbol}</p>
        <p className="text-xs text-slate-500">{quote.name || quote.exchange}</p>
      </div>

      <div className="text-right">
        <p className="font-bold text-white">{formatPrice(quote.price)}</p>
        <p className={positive ? 'text-sm text-green-400' : 'text-sm text-red-400'}>
          {formatChange(quote.change)}
        </p>
      </div>
    </div>
  );
}

function Section({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <div className="mb-4 flex items-center gap-3">
        <div className="rounded-2xl bg-slate-900 p-3 text-slate-400">{icon}</div>
        <div>
          <h2 className="text-sm uppercase tracking-[0.25em] text-slate-500">
            {title}
          </h2>
          {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
        </div>
      </div>

      {children}
    </section>
  );
}

export default function MarketPage() {
  const [quotes, setQuotes] = useState<Record<string, MarketQuote>>({});
  const [marketCandles, setMarketCandles] = useState<Record<string, CandleData[]>>({});
  const [loading, setLoading] = useState(false);
  const [scanMode, setScanMode] = useState<'WATCH' | 'NIFTY50' | 'ALL'>('NIFTY50');
  const [quoteErrors, setQuoteErrors] = useState<MarketQuoteError[]>([]);
  const [quoteSummary, setQuoteSummary] = useState<MarketQuoteSummary>(null);

  const symbolsToScan = useMemo(() => {
    if (scanMode === 'NIFTY50') {
      return NIFTY50_SYMBOLS;
    }

    if (scanMode === 'ALL') {
      return [...NIFTY50_SYMBOLS, ...NATURAL_RESOURCES_SYMBOLS];
    }

    return ['RELIANCE', 'TCS', 'HDFCBANK', 'SBIN', 'BEL'];
  }, [scanMode]);

  const fetchMarketQuotes = useCallback(async () => {
    setLoading(true);
    setQuoteErrors([]);

    try {
      const validSymbols = symbolsToScan.filter((symbol) => INSTRUMENTS[symbol]);

      const response = await fetch('/api/market/quote', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
        body: JSON.stringify({
          items: validSymbols.map((symbol) => {
            const instrument = INSTRUMENTS[symbol];

            return {
              symbol: instrument.symbol,
              exchange: instrument.exchange,
              token: instrument.token,
            };
          }),
        }),
      });

      const data = await response.json();

      setQuoteErrors(Array.isArray(data.errors) ? data.errors : []);
      setQuoteSummary(data.summary || null);

      if (!response.ok || !data.success) {
        console.error('Market overview quote error:', data);
        return;
      }

      const nextQuotes: Record<string, MarketQuote> = {};

      data.quotes.forEach((quote: any) => {
        const instrument = INSTRUMENTS[quote.symbol];

        nextQuotes[quote.symbol] = {
          symbol: quote.symbol,
          exchange: quote.exchange,
          tradingSymbol: quote.tradingSymbol,
          name: instrument?.name,
          price: Number(quote.price || 0),
          change: Number(quote.changePercent || 0),
          open: Number(quote.open || 0),
          high: Number(quote.high || 0),
          low: Number(quote.low || 0),
          close: Number(quote.close || 0),
          lastUpdated: quote.lastUpdated,
        };
      });

      setQuotes(nextQuotes);

      const signalCandidateSymbols =
        scanMode === 'WATCH'
          ? Array.from(new Set([...validSymbols, 'NIFTY', 'BANKNIFTY'])).filter(
              (symbol) => INSTRUMENTS[symbol]
            )
          : getSignalCandidateSymbols(nextQuotes);

      if (signalCandidateSymbols.length > 0) {
        try {
          const candleResponse = await fetch('/api/market/candles', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            cache: 'no-store',
            body: JSON.stringify({
              symbols: signalCandidateSymbols,
              interval: 'FIVE_MINUTE',
            }),
          });

          const candleData = await candleResponse.json();

          if (candleResponse.ok && candleData.success) {
            setMarketCandles((prev) => ({
              ...prev,
              ...(candleData.candles || {}),
            }));
          } else {
            console.error('Market signal candle fetch failed:', candleData);
          }
        } catch (error) {
          console.error('Market signal candle fetch error:', error);
        }
      }
    } catch (error: any) {
      console.error('Market overview fetch failed:', error);

      setQuoteErrors([
        {
          exchange: 'UNKNOWN',
          error: error?.message || 'Market overview fetch failed',
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, [scanMode, symbolsToScan]);

  useEffect(() => {
    fetchMarketQuotes();
  }, [fetchMarketQuotes]);

  const quoteList = useMemo(() => {
    return Object.values(quotes).filter((quote) => quote.price > 0);
  }, [quotes]);

  const topGainers = useMemo(() => {
    return [...quoteList].sort((a, b) => b.change - a.change).slice(0, 5);
  }, [quoteList]);

  const topLosers = useMemo(() => {
    return [...quoteList].sort((a, b) => a.change - b.change).slice(0, 5);
  }, [quoteList]);

  const nearHigh = useMemo(() => {
    return quoteList.filter(isNearHigh).sort((a, b) => b.change - a.change).slice(0, 6);
  }, [quoteList]);

  const nearLow = useMemo(() => {
    return quoteList.filter(isNearLow).sort((a, b) => a.change - b.change).slice(0, 6);
  }, [quoteList]);

  const naturalResources = useMemo(() => {
    return NATURAL_RESOURCES_SYMBOLS.map((symbol) => quotes[symbol]).filter(Boolean);
  }, [quotes]);

  const signals = useMemo(() => {
    return quoteList.map((quote) =>
      generateSignalForStock(
        quote.symbol,
        {
          price: quote.price,
          change: quote.change,
          open: quote.open,
          high: quote.high,
          low: quote.low,
          close: quote.close,
          lastUpdated: quote.lastUpdated,
        },
        marketCandles[quote.symbol] || [],
        marketCandles
      )
    );
  }, [quoteList, marketCandles]);

  const buySignals = signals.filter((signal) => signal.side === 'BUY').slice(0, 5);
  const sellSignals = signals.filter((signal) => signal.side === 'SELL').slice(0, 5);

  const nearSignals = signals
    .filter((signal) => signal.side === 'NEUTRAL')
    .filter((signal) => {
      return signal.reasons.some((reason) => {
        return (
          reason.includes('BUY score') ||
          reason.includes('SELL score') ||
          reason.includes('Waiting for enough') ||
          reason.includes('No clean high-probability setup')
        );
      });
    })
    .slice(0, 8);

  return (
    <main className="min-h-screen bg-[#050608] px-5 pb-28 pt-8 text-white">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold">Market</h1>
            <p className="mt-2 text-slate-400">
              Nifty 50 and Natural Resources market scanner.
            </p>
          </div>

          <button
            onClick={fetchMarketQuotes}
            disabled={loading}
            className="flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 font-semibold text-white disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        <div className="mt-5 flex gap-2 overflow-x-auto">
          {[
            { id: 'WATCH', label: 'Quick Watch' },
            { id: 'NIFTY50', label: 'Nifty 50' },
            { id: 'ALL', label: 'All + Resources' },
          ].map((mode) => (
            <button
              key={mode.id}
              onClick={() => setScanMode(mode.id as any)}
              className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold ${
                scanMode === mode.id
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-900 text-slate-400'
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>

        <div className="mt-5 rounded-2xl border border-yellow-500/20 bg-yellow-500/10 p-4 text-sm text-yellow-200">
          Market scanner is for education and tracking only. Not financial advice.
        </div>

        {quoteSummary && (
          <div
            className={`mt-4 rounded-2xl border p-4 text-sm ${
              quoteErrors.length > 0
                ? 'border-orange-500/30 bg-orange-500/10 text-orange-200'
                : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
            }`}
          >
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />

              <div>
                <p className="font-bold">
                  Loaded {quoteSummary.fetched} / {quoteSummary.requested} instruments
                </p>

                <p className="mt-1 text-xs opacity-80">
                  Angel requests are grouped by exchange and chunked in batches of{' '}
                  {quoteSummary.chunkSize}.
                </p>

                {quoteErrors.length > 0 && (
                  <div className="mt-3">
                    <p className="font-semibold">Some quote chunks failed:</p>

                    <ul className="mt-2 space-y-1">
                      {quoteErrors.slice(0, 4).map((item, index) => (
                        <li key={index}>
                          • {item.exchange || 'UNKNOWN'}
                          {item.symbol ? ` / ${item.symbol}` : ''}
                          {item.chunk ? ` chunk ${item.chunk}` : ''}:{' '}
                          {item.error || 'Unknown error'}
                        </li>
                      ))}
                    </ul>

                    {quoteErrors.length > 4 && (
                      <p className="mt-2 text-xs opacity-80">
                        +{quoteErrors.length - 4} more quote errors hidden.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <Section
          title="Market Snapshot"
          subtitle={
            quoteSummary
              ? `${quoteSummary.fetched}/${quoteSummary.requested} instruments loaded`
              : `${quoteList.length} instruments loaded`
          }
          icon={<BarChart3 className="h-5 w-5" />}
        >
          {loading && quoteList.length === 0 ? (
            <div className="rounded-3xl border border-slate-800 bg-[#15161b] p-6 text-slate-400">
              Loading market data...
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-3xl border border-slate-800 bg-[#15161b] p-5">
                <p className="text-sm text-slate-500">Advancing</p>
                <p className="mt-1 text-3xl font-bold text-green-400">
                  {quoteList.filter((q) => q.change > 0).length}
                </p>
              </div>

              <div className="rounded-3xl border border-slate-800 bg-[#15161b] p-5">
                <p className="text-sm text-slate-500">Declining</p>
                <p className="mt-1 text-3xl font-bold text-red-400">
                  {quoteList.filter((q) => q.change < 0).length}
                </p>
              </div>
            </div>
          )}
        </Section>

        <Section
          title="Top Gainers"
          icon={<ArrowUpRight className="h-5 w-5" />}
        >
          <div className="space-y-3">
            {topGainers.map((quote) => (
              <CompactRow key={quote.symbol} quote={quote} />
            ))}
          </div>
        </Section>

        <Section
          title="Top Losers"
          icon={<ArrowDownRight className="h-5 w-5" />}
        >
          <div className="space-y-3">
            {topLosers.map((quote) => (
              <CompactRow key={quote.symbol} quote={quote} />
            ))}
          </div>
        </Section>

        {naturalResources.length > 0 && (
          <Section
            title="Natural Resources"
            subtitle="MCX commodities"
            icon={<Gem className="h-5 w-5" />}
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {naturalResources.map((quote) => (
                <MarketCard key={quote.symbol} quote={quote} />
              ))}
            </div>
          </Section>
        )}

        <Section
          title="Near Day High"
          subtitle="Possible momentum watchlist"
          icon={<TrendingUp className="h-5 w-5" />}
        >
          {nearHigh.length === 0 ? (
            <div className="rounded-3xl border border-slate-800 bg-[#15161b] p-6 text-slate-400">
              No instruments near day high right now.
            </div>
          ) : (
            <div className="space-y-3">
              {nearHigh.map((quote) => (
                <CompactRow key={quote.symbol} quote={quote} />
              ))}
            </div>
          )}
        </Section>

        <Section
          title="Near Day Low"
          subtitle="Possible weakness watchlist"
          icon={<TrendingDown className="h-5 w-5" />}
        >
          {nearLow.length === 0 ? (
            <div className="rounded-3xl border border-slate-800 bg-[#15161b] p-6 text-slate-400">
              No instruments near day low right now.
            </div>
          ) : (
            <div className="space-y-3">
              {nearLow.map((quote) => (
                <CompactRow key={quote.symbol} quote={quote} />
              ))}
            </div>
          )}
        </Section>

        <Section
          title="Near Signal Setups"
          subtitle="Diagnostics for symbols that did not qualify yet"
          icon={<BarChart3 className="h-5 w-5" />}
        >
          {nearSignals.length === 0 ? (
            <div className="rounded-3xl border border-slate-800 bg-[#15161b] p-6 text-slate-400">
              No near setups to show right now.
            </div>
          ) : (
            <div className="space-y-3">
              {nearSignals.map((signal) => (
                <div
                  key={signal.symbol}
                  className="rounded-3xl border border-slate-800 bg-[#15161b] p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-xl font-bold text-white">
                        {signal.symbol}
                      </h3>
                      <p className="mt-1 text-sm text-slate-400">
                        {signal.status.replaceAll('_', ' ')}
                      </p>
                    </div>

                    <span className="rounded-full bg-slate-700 px-3 py-1 text-sm font-bold text-slate-300">
                      NO TRADE
                    </span>
                  </div>

                  <ul className="mt-4 space-y-2 text-sm text-slate-400">
                    {signal.reasons.slice(0, 6).map((reason, index) => (
                      <li key={index}>• {reason}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section
          title="BUY Watch Signals"
          icon={<TrendingUp className="h-5 w-5" />}
        >
          {buySignals.length === 0 ? (
            <div className="rounded-3xl border border-slate-800 bg-[#15161b] p-6 text-slate-400">
              No BUY watch signals right now.
            </div>
          ) : (
            <div className="space-y-3">
              {buySignals.map((signal) => (
                <div
                  key={signal.symbol}
                  className="rounded-3xl border border-green-500/20 bg-green-500/10 p-5"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xl font-bold text-white">
                        {signal.symbol}
                      </h3>
                      <p className="mt-1 text-sm text-green-300">
                        Entry {formatPrice(signal.entry)} • SL{' '}
                        {formatPrice(signal.stopLoss)} • T1{' '}
                        {formatPrice(signal.target1)}
                      </p>
                    </div>

                    <span className="rounded-full bg-green-500/20 px-3 py-1 text-sm font-bold text-green-400">
                      BUY
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section
          title="SELL Watch Signals"
          icon={<ShieldAlert className="h-5 w-5" />}
        >
          {sellSignals.length === 0 ? (
            <div className="rounded-3xl border border-slate-800 bg-[#15161b] p-6 text-slate-400">
              No SELL watch signals right now.
            </div>
          ) : (
            <div className="space-y-3">
              {sellSignals.map((signal) => (
                <div
                  key={signal.symbol}
                  className="rounded-3xl border border-red-500/20 bg-red-500/10 p-5"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xl font-bold text-white">
                        {signal.symbol}
                      </h3>
                      <p className="mt-1 text-sm text-red-300">
                        Entry {formatPrice(signal.entry)} • SL{' '}
                        {formatPrice(signal.stopLoss)} • T1{' '}
                        {formatPrice(signal.target1)}
                      </p>
                    </div>

                    <span className="rounded-full bg-red-500/20 px-3 py-1 text-sm font-bold text-red-400">
                      SELL
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>
    </main>
  );
}