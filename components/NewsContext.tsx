'use client';
import { useEffect, useState } from 'react';
import type { Headline, SentimentResult } from '@/lib/sentiment';

export default function NewsContext({ symbol }: { symbol: string }) {
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
        { cache: 'no-store' }
      );
      const data = await response.json();
      if (!response.ok || !data.success)
        throw new Error(data.error || 'News unavailable.');
      const headlines: Headline[] = data.news.slice(0, 3);
      const classified = await Promise.all(
        headlines.map(async (item) => {
          try {
            const r = await fetch('/api/hf/sentiment', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: item.title }),
            });
            const d = await r.json();
            if (!r.ok || !d.success)
              throw new Error(d.error || 'Sentiment unavailable.');
            return { ...item, sentiment: d.result };
          } catch (e) {
            return {
              ...item,
              error: e instanceof Error ? e.message : 'Sentiment unavailable.',
            };
          }
        })
      );
      setItems(classified);
      if (!classified.length)
        setError(
          'No dated headlines from the last 24 hours. No sentiment inferred.'
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'News unavailable.');
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
