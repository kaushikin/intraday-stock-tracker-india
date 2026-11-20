'use client';
import { useApp } from '@/contexts/AppContext';
import {
  describeCandles,
  describeQuote,
  type FeedRequestState,
} from '@/lib/feedStatus';
import { getIndianMarketStatus } from '@/lib/marketHours';
export type OptionalStatus = {
  state: 'NOT_CHECKED' | 'OK' | 'UNAVAILABLE';
  at?: string;
  message: string;
};
export type OptionalFeeds = { news: OptionalStatus; sentiment: OptionalStatus };
export const optionalFeedsInitial: OptionalFeeds = {
  news: { state: 'NOT_CHECKED', message: 'Use Check recent headlines below.' },
  sentiment: {
    state: 'NOT_CHECKED',
    message: 'Optional. Never used for entry qualification.',
  },
};
export function displayTime(value?: string) {
  const time = Date.parse(value || '');
  return Number.isFinite(time)
    ? new Date(time).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }) + ' IST'
    : 'Not received';
}
function RequestStatus({
  name,
  feed,
}: {
  name: string;
  feed: FeedRequestState;
}) {
  return (
    <div className="rounded-lg bg-slate-950 p-3 text-xs">
      <p className="font-semibold">
        {name} ·{' '}
        {feed.state === 'IDLE'
          ? 'Not checked'
          : feed.state.replaceAll('_', ' ')}
      </p>
      <p className="mt-1 text-slate-400">
        Last attempt: {displayTime(feed.attemptedAt)}
      </p>
      <p className="text-slate-400">
        Last successful response: {displayTime(feed.receivedAt)}
      </p>
      {feed.errors.map((e, i) => (
        <p className="mt-2 break-words text-amber-300" key={`${e.symbol}-${i}`}>
          {e.symbol}: {e.message}
        </p>
      ))}
    </div>
  );
}
export default function DataStatusPanel({
  symbols,
  now,
  optional,
}: {
  symbols: string[];
  now: Date | null;
  optional: OptionalFeeds;
}) {
  const { prices, candles, quoteFeed, candleFeed } = useApp();
  return (
    <section
      className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4"
      aria-label="Data status"
    >
      <h2 className="text-lg font-semibold">Data status</h2>
      <p className="mt-2 text-sm text-slate-400">
        {now
          ? getIndianMarketStatus(now).replaceAll('_', ' ')
          : 'Checking session…'}{' '}
        · Automatic refresh runs while the tab is visible and the regular
        session is open. Use Refresh data to inspect snapshots outside market
        hours.
      </p>
      <div className="mt-3 grid gap-3">
        <RequestStatus name="Angel quotes" feed={quoteFeed} />
        <RequestStatus name="Angel candles" feed={candleFeed} />
      </div>
      {now &&
        [...new Set([...symbols, 'NIFTY'])].map((symbol) => {
          const index = symbol === 'NIFTY',
            q = describeQuote(prices[symbol], now),
            c = describeCandles(candles[symbol] || [], now);
          return (
            <details
              key={symbol}
              className="mt-3 border-t border-slate-800 pt-3"
            >
              <summary className="cursor-pointer text-sm font-semibold">
                {symbol} ·{' '}
                {index
                  ? `candles ${c.label}`
                  : `quote ${q.label} · candles ${c.label}`}{' '}
                · {c.bars.length} completed bars
              </summary>
              {!index && (
                <>
                  <p className="mt-2 text-xs text-slate-400">
                    Quote: {q.detail}
                  </p>
                  <p className="mt-1 text-xs">
                    Exchange: {displayTime(prices[symbol]?.exchangeTime)}
                  </p>
                  <p className="text-xs text-slate-400">
                    Received: {displayTime(prices[symbol]?.lastUpdated)}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Bid {prices[symbol]?.bid || '—'} · Ask{' '}
                    {prices[symbol]?.ask || '—'} · Ask quantity{' '}
                    {prices[symbol]?.askQuantity || '—'}
                  </p>
                </>
              )}
              <p className="mt-2 text-xs">
                Last completed candle start: {displayTime(c.bars.at(-1)?.time)}
              </p>
              <p className="mt-1 text-xs text-slate-400">{c.detail}</p>
            </details>
          );
        })}
      <div className="mt-4 border-t border-slate-800 pt-3 text-xs">
        {(['news', 'sentiment'] as const).map((key) => (
          <div key={key} className="mt-2">
            <p className="font-semibold">
              {key === 'news' ? 'News' : 'Hugging Face / FinBERT'} ·{' '}
              {optional[key].state.replaceAll('_', ' ')}
            </p>
            <p className="text-slate-400">{optional[key].message}</p>
            {optional[key].at && (
              <p className="text-slate-500">{displayTime(optional[key].at)}</p>
            )}
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-slate-500">
        A successful connection is not a broker-terminal comparison. Complete
        the supervised check before paper entries.
      </p>
    </section>
  );
}
