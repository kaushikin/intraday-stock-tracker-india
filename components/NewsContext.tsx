'use client';
import { useEffect, useState } from 'react';
import type { Headline, SentimentResult } from '@/lib/sentiment';
import type { OptionalFeeds } from './DataStatusPanel';

export default function NewsContext({
  symbol,
  onStatus,
}: {
  symbol: string;
  onStatus?: (status: OptionalFeeds) => void;
}) {
  const [items, setItems] = useState<
    (Headline & { sentiment?: SentimentResult; error?: string })[]
  >([]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    setItems([]);
    setError('');
  }, [symbol]);
  async function load() {
    setBusy(true);
    setError('');
    setItems([]);
    try {
      const response = await fetch(
        `/api/news?symbol=${encodeURIComponent(symbol)}`,
        { cache: 'no-store', signal: AbortSignal.timeout(15_000) }
      );
      const data = await response.json();
      if (!response.ok || !data.success)
        throw new Error(data.error || 'News unavailable.');
      const headlines: Headline[] = data.news.slice(0, 3);
      const classified: (Headline & {
        sentiment?: SentimentResult;
        error?: string;
      })[] = [];
      let blocked = '';
      for (const item of headlines) {
        if (blocked) {
          classified.push({ ...item, error: blocked });
          continue;
        }
        try {
          const r = await fetch('/api/hf/sentiment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: item.title }),
            signal: AbortSignal.timeout(15_000),
          });
          const d = await r.json();
          if (!r.ok || !d.success) {
            if (
              [401, 402, 403, 429].includes(d.providerStatus) ||
              r.status === 503
            )
              blocked = d.error || 'Sentiment unavailable.';
            throw new Error(d.error || 'Sentiment unavailable.');
          }
          classified.push({ ...item, sentiment: d.result });
        } catch (e) {
          classified.push({
            ...item,
            error: e instanceof Error ? e.message : 'Sentiment unavailable.',
          });
        }
      }
      const at = new Date().toISOString(),
        failure = classified.find((item) => item.error)?.error;
      onStatus?.({
        news: {
          state: 'OK',
          at,
          message: `${headlines.length} recent dated headlines received.`,
        },
        sentiment: {
          state: failure
            ? 'UNAVAILABLE'
            : headlines.length
              ? 'OK'
              : 'NOT_CHECKED',
          at,
          message:
            failure ||
            (!headlines.length
              ? 'No recent headline to classify.'
              : 'Headline classification responded; this is not a win probability.'),
        },
      });
      setItems(classified);
      if (!classified.length)
        setError(
          'No dated headlines from the last 24 hours. No sentiment inferred.'
        );
    } catch (e) {
      const message = e instanceof Error ? e.message : 'News unavailable.';
      setError(message);
      onStatus?.({
        news: { state: 'UNAVAILABLE', at: new Date().toISOString(), message },
        sentiment: {
          state: 'NOT_CHECKED',
          message: 'News failed; no classification requested.',
        },
      });
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <summary className="cursor-pointer font-semibold">
        News context · {symbol}
      </summary>
      <p className="my-3 text-sm text-slate-400">
        Angel One supplies market data. Hugging Face FinBERT labels headline
        sentiment only. Its confidence is not a trade win probability and never
        changes entry qualification.
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={load}
        className="rounded-xl bg-slate-700 px-4 py-2 disabled:opacity-40"
      >
        {busy ? 'Loading headlines…' : 'Check recent headlines'}
      </button>
      {error && (
        <p role="status" className="mt-3 text-sm text-amber-300">
          {error}
        </p>
      )}
      {items.map((item) => (
        <article
          key={item.link}
          className="mt-4 border-t border-slate-800 pt-3"
        >
          <a
            href={item.link}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-cyan-300 underline"
          >
            {item.title}
          </a>
          <p className="mt-1 text-xs text-slate-500">
            {item.source} ·{' '}
            {new Date(item.publishedAt).toLocaleString('en-IN', {
              timeZone: 'Asia/Kolkata',
            })}{' '}
            IST
          </p>
          <p className="mt-1 text-sm">
            {item.sentiment
              ? `${item.sentiment.label} · ${(item.sentiment.score * 100).toFixed(0)}% text confidence`
              : item.error}
          </p>
        </article>
      ))}
    </details>
  );
}
