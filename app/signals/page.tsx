'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Brain,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Radar,
  Trash2,
  CheckCircle2,
} from 'lucide-react';
import { useApp } from '@/contexts/AppContext';
import { generateSignals, TradeSignal } from '@/lib/signalEngine';
import { useAlerts } from '@/contexts/AlertContext';
import {
  isFreshSignalWindowOpenIST,
  isMarketCloseSquareOffTimeIST,
  minutesSinceISO,
} from '@/lib/marketHours';
import { calculatePositionSizing } from '@/lib/positionSizing';
import {
  analyzeTargetExit,
  getTargetExitActionLabel,
} from '@/lib/targetExitAssistant';


const NEWS_SENTIMENT_CLIENT_CACHE_TTL_MS = 10 * 60 * 1000;

type CachedClientFetchPayload = {
  body: string;
  status: number;
  statusText: string;
  headers: [string, string][];
};

type CachedClientFetchEntry = {
  expiresAt: number;
  payload?: CachedClientFetchPayload;
  promise?: Promise<CachedClientFetchPayload>;
};

const newsSentimentClientCache = new Map<string, CachedClientFetchEntry>();

function buildCachedResponse(payload: CachedClientFetchPayload): Response {
  const body = [204, 205, 304].includes(payload.status) ? null : payload.body;

  return new Response(body, {
    status: payload.status,
    statusText: payload.statusText,
    headers: payload.headers,
  });
}

async function cachedClientFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;

  const method = (init?.method || 'GET').toUpperCase();
  const shouldDedupe =
    url.includes('/api/news') || url.includes('/api/hf/sentiment');

  if (!shouldDedupe) {
    return fetch(input, init);
  }

  const bodyKey =
    typeof init?.body === 'string'
      ? init.body
      : init?.body
        ? '[non-string-body]'
        : '';

  const cacheKey = `${method}:${url}:${bodyKey}`;
  const now = Date.now();
  const cached = newsSentimentClientCache.get(cacheKey);

  if (cached && cached.expiresAt > now) {
    if (cached.payload) {
      return buildCachedResponse(cached.payload);
    }

    if (cached.promise) {
      return buildCachedResponse(await cached.promise);
    }
  }

  const promise = fetch(input, init)
    .then(async (response) => {
      const payload: CachedClientFetchPayload = {
        body: await response.clone().text(),
        status: response.status,
        statusText: response.statusText,
        headers: Array.from(response.headers.entries()),
      };

      if (response.ok) {
        newsSentimentClientCache.set(cacheKey, {
          expiresAt: Date.now() + NEWS_SENTIMENT_CLIENT_CACHE_TTL_MS,
          payload,
        });
      } else {
        newsSentimentClientCache.delete(cacheKey);
      }

      return payload;
    })
    .catch((error) => {
      newsSentimentClientCache.delete(cacheKey);
      throw error;
    });

  newsSentimentClientCache.set(cacheKey, {
    expiresAt: now + NEWS_SENTIMENT_CLIENT_CACHE_TTL_MS,
    promise,
  });

  return buildCachedResponse(await promise);
}

type AISentiment = {
  label: 'positive' | 'negative' | 'neutral';
  confidence: number;
  signalScore: number;
};

type NewsItem = {
  title: string;
  link: string;
  source?: string;
  publishedAt?: string;
};

type SignalLifecycleStatus =
  | 'WAITING'
  | 'TRIGGERED'
  | 'BREAKEVEN_SUGGESTED'
  | 'TRAIL_SL_SUGGESTED'
  | 'TIME_EXIT_SUGGESTED'
  | 'TARGET_1_HIT'
  | 'TARGET_2_HIT'
  | 'STOP_LOSS_HIT'
  | 'MANUAL_EXIT'
  | 'EXPIRED';

type TrackedSignal = TradeSignal & {
  id: string;
  createdAt: string;
  lifecycleStatus: SignalLifecycleStatus;
  lastCheckedAt?: string;
  sentiment?: AISentiment;
  news?: NewsItem[];
  savedToJournal?: boolean;
};

const TRACKED_SIGNALS_KEY = 'tracked_signals_v1';
const SIGNAL_EXPIRY_MINUTES = 20;
const DEFAULT_MAX_RISK_PER_TRADE = 500;
const DEFAULT_ESTIMATED_CHARGES = 50;

function formatPrice(value: number) {
  if (!value) return '--';
  return `₹${value.toFixed(2)}`;
}

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

function formatMoneyValue(value: number) {
  const sign = value < 0 ? '-' : '';
  return `${sign}₹${Math.abs(value).toFixed(2)}`;
}

function createId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function isTerminalStatus(status: SignalLifecycleStatus) {
  return (
    status === 'TARGET_2_HIT' ||
    status === 'STOP_LOSS_HIT' ||
    status === 'MANUAL_EXIT' ||
    status === 'EXPIRED'
  );
}

function getStatusLabel(status: SignalLifecycleStatus) {
  const labels: Record<SignalLifecycleStatus, string> = {
    WAITING: 'Waiting',
    TRIGGERED: 'Triggered',
    BREAKEVEN_SUGGESTED: 'Move SL to Cost',
    TRAIL_SL_SUGGESTED: 'Trail SL Suggested',
    TIME_EXIT_SUGGESTED: 'Time Exit Suggested',
    TARGET_1_HIT: 'Target 1 Hit',
    TARGET_2_HIT: 'Target 2 Hit',
    STOP_LOSS_HIT: 'Stop Loss Hit',
    MANUAL_EXIT: 'Manual Exit',
    EXPIRED: 'Expired',
  };

  return labels[status];
}

function getStatusClass(status: SignalLifecycleStatus) {
  if (status === 'TARGET_1_HIT' || status === 'TARGET_2_HIT') {
    return 'bg-green-500/15 text-green-400 border-green-500/30';
  }

  if (status === 'STOP_LOSS_HIT') {
    return 'bg-red-500/15 text-red-400 border-red-500/30';
  }

  if (status === 'TRIGGERED') {
    return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
  }

  if (
    status === 'BREAKEVEN_SUGGESTED' ||
    status === 'TRAIL_SL_SUGGESTED'
  ) {
    return 'bg-purple-500/15 text-purple-300 border-purple-500/30';
  }

  if (status === 'TIME_EXIT_SUGGESTED') {
    return 'bg-orange-500/15 text-orange-300 border-orange-500/30';
  }

  if (status === 'MANUAL_EXIT') {
    return 'bg-slate-600 text-slate-200 border-slate-500';
  }

  if (status === 'WAITING') {
    return 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30';
  }

  return 'bg-slate-700 text-slate-300 border-slate-600';
}

function canSaveStatusToJournal(status: SignalLifecycleStatus) {
  return (
    status === 'TARGET_2_HIT' ||
    status === 'STOP_LOSS_HIT'
  );
}

function getExitPriceForJournal(signal: TrackedSignal) {
  if (signal.lifecycleStatus === 'TARGET_1_HIT') {
    return signal.target1;
  }

  if (signal.lifecycleStatus === 'TARGET_2_HIT') {
    return signal.target2;
  }

  if (signal.lifecycleStatus === 'STOP_LOSS_HIT') {
    return signal.stopLoss;
  }

  return null;
}

function calculateLifecycleStatus(
  signal: TrackedSignal,
  currentPrice: number
): SignalLifecycleStatus {
  if (isTerminalStatus(signal.lifecycleStatus)) {
    return signal.lifecycleStatus;
  }

  /**
   * Important:
   * EXPIRED should only apply before entry is triggered.
   * Once a trade is triggered, it must be managed by SL/targets/manual exit,
   * not by signal expiry.
   */
  const wasTriggered =
    signal.lifecycleStatus === 'TRIGGERED' ||
    signal.lifecycleStatus === 'TARGET_1_HIT';

  /**
   * Only WAITING signals can expire.
   * If entry was not triggered within expiry time, do not take the trade.
   */
  if (
    signal.lifecycleStatus === 'WAITING' &&
    (minutesSinceISO(signal.createdAt) >= SIGNAL_EXPIRY_MINUTES ||
      isMarketCloseSquareOffTimeIST())
  ) {
    return 'EXPIRED';
  }

  if (!currentPrice) {
    return signal.lifecycleStatus;
  }

  if (signal.side === 'BUY') {
    if (currentPrice >= signal.target2) {
      return 'TARGET_2_HIT';
    }

    if (currentPrice >= signal.target1) {
      return 'TARGET_1_HIT';
    }

    if (currentPrice <= signal.stopLoss) {
      return 'STOP_LOSS_HIT';
    }

    if (currentPrice >= signal.entry) {
      return 'TRIGGERED';
    }

    /**
     * If trade was already triggered and price comes back below entry,
     * keep it as TRIGGERED until SL/target/manual exit.
     */
    if (wasTriggered) {
      return 'TRIGGERED';
    }

    return 'WAITING';
  }

  if (signal.side === 'SELL') {
    if (currentPrice <= signal.target2) {
      return 'TARGET_2_HIT';
    }

    if (currentPrice <= signal.target1) {
      return 'TARGET_1_HIT';
    }

    if (currentPrice >= signal.stopLoss) {
      return 'STOP_LOSS_HIT';
    }

    if (currentPrice <= signal.entry) {
      return 'TRIGGERED';
    }

    /**
     * If trade was already triggered and price comes back above entry,
     * keep it as TRIGGERED until SL/target/manual exit.
     */
    if (wasTriggered) {
      return 'TRIGGERED';
    }

    return 'WAITING';
  }

  return 'WAITING';
}

function getFallbackSentiment(signal: TradeSignal): AISentiment {
  if (signal.side === 'BUY') {
    return {
      label: 'positive',
      confidence: 70,
      signalScore: signal.strength === 'STRONG' ? 78 : 65,
    };
  }

  if (signal.side === 'SELL') {
    return {
      label: 'negative',
      confidence: 70,
      signalScore: signal.strength === 'STRONG' ? 78 : 65,
    };
  }

  return {
    label: 'neutral',
    confidence: 60,
    signalScore: 45,
  };
}

function buildSentimentText(signal: TradeSignal) {
  const reasons = signal.reasons.join('. ');

  if (signal.side === 'BUY') {
    return `${signal.symbol} shows a positive intraday technical setup. ${reasons}. Price action appears bullish with possible upside momentum.`;
  }

  if (signal.side === 'SELL') {
    return `${signal.symbol} shows a negative intraday technical setup. ${reasons}. Price action appears bearish with possible downside pressure.`;
  }

  return `${signal.symbol} has no clear intraday trading setup currently. ${reasons}. Market signal is neutral and uncertain.`;
}

function buildNewsSentimentText(signal: TradeSignal, news: NewsItem[]) {
  if (!news.length) {
    return buildSentimentText(signal);
  }

  const headlines = news.map((item) => item.title).join('. ');

  return `
Stock: ${signal.symbol}
Technical Signal: ${signal.side}
Signal Strength: ${signal.strength}
Signal Reasons: ${signal.reasons.join('. ')}

Latest News Headlines:
${headlines}

Analyze the financial sentiment of these headlines for intraday stock tracking.
`;
}

function calculateSignalScore(
  signal: TradeSignal,
  label: string,
  confidence: number
) {
  let baseScore = 40;

  if (signal.side === 'BUY' || signal.side === 'SELL') {
    baseScore = signal.strength === 'STRONG' ? 70 : 60;
  }

  if (signal.side === 'BUY' && label === 'positive') {
    baseScore += 15;
  }

  if (signal.side === 'SELL' && label === 'negative') {
    baseScore += 15;
  }

  if (label === 'neutral') {
    baseScore -= 5;
  }

  if (signal.riskReward >= 1) {
    baseScore += 5;
  }

  if (confidence >= 90) {
    baseScore += 5;
  }

  return Math.max(0, Math.min(100, Math.round(baseScore)));
}

function SentimentBox({
  sentiment,
  loading,
}: {
  sentiment?: AISentiment;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="mt-4 rounded-2xl border border-purple-500/20 bg-purple-500/10 p-4">
        <div className="flex items-center gap-2 text-purple-300">
          <Brain className="h-4 w-4 animate-pulse" />
          <span className="text-sm font-semibold">AI is analyzing news...</span>
        </div>
      </div>
    );
  }

  if (!sentiment) {
    return null;
  }

  const isPositive = sentiment.label === 'positive';
  const isNegative = sentiment.label === 'negative';

  const sentimentClass = isPositive
    ? 'text-green-400'
    : isNegative
    ? 'text-red-400'
    : 'text-slate-300';

  const scoreClass =
    sentiment.signalScore >= 75
      ? 'text-green-400'
      : sentiment.signalScore >= 55
      ? 'text-yellow-400'
      : 'text-red-400';

  return (
    <div className="mt-4 rounded-2xl border border-purple-500/20 bg-purple-500/10 p-4">
      <div className="mb-3 flex items-center gap-2 text-purple-300">
        <Sparkles className="h-4 w-4" />
        <span className="text-sm font-semibold">Hugging Face AI Analysis</span>
      </div>

      <div className="grid grid-cols-3 gap-3 text-sm">
        <div>
          <p className="text-slate-500">News Sentiment</p>
          <p className={`font-bold capitalize ${sentimentClass}`}>
            {sentiment.label}
          </p>
        </div>

        <div>
          <p className="text-slate-500">AI Confidence</p>
          <p className="font-bold text-white">
            {formatPercent(sentiment.confidence)}
          </p>
        </div>

        <div>
          <p className="text-slate-500">Signal Score</p>
          <p className={`font-bold ${scoreClass}`}>
            {sentiment.signalScore}/100
          </p>
        </div>
      </div>
    </div>
  );
}

function NewsBox({ news }: { news: NewsItem[] }) {
  if (!news.length) {
    return (
      <div className="mt-4 rounded-2xl border border-slate-700 bg-black/30 p-4">
        <p className="text-sm text-slate-400">
          No latest news headlines found for this stock.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-2xl border border-slate-700 bg-black/30 p-4">
      <p className="mb-3 text-sm font-semibold text-slate-300">
        Latest News Headlines
      </p>

      <ul className="space-y-2">
        {news.slice(0, 3).map((item, index) => (
          <li key={index} className="text-sm text-slate-400">
            • {item.title}
            {item.source && (
              <span className="ml-1 text-xs text-slate-600">
                — {item.source}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function PositionSizingBox({ signal }: { signal: TradeSignal }) {
  if (signal.side !== 'BUY' && signal.side !== 'SELL') {
    return null;
  }

  const sizing = calculatePositionSizing({
    side: signal.side,
    entry: signal.entry,
    stopLoss: signal.stopLoss,
    target: signal.target1,
    maxRiskAmount: DEFAULT_MAX_RISK_PER_TRADE,
    estimatedCharges: DEFAULT_ESTIMATED_CHARGES,
  });

  const qualityClass =
    sizing.quality === 'GOOD'
      ? 'text-green-400'
      : sizing.quality === 'ACCEPTABLE'
      ? 'text-yellow-300'
      : sizing.quality === 'WEAK'
      ? 'text-orange-300'
      : 'text-red-400';

  return (
    <div className="mt-4 rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-4">
      <div className="mb-3 flex items-center gap-2 text-cyan-300">
        <Target className="h-4 w-4" />
        <span className="text-sm font-semibold">
          Position Size & Net R:R Assistant
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-slate-500">Max Risk</p>
          <p className="font-bold text-white">
            {formatMoneyValue(DEFAULT_MAX_RISK_PER_TRADE)}
          </p>
        </div>

        <div>
          <p className="text-slate-500">Suggested Qty</p>
          <p className="font-bold text-white">{sizing.suggestedQuantity}</p>
        </div>

        <div>
          <p className="text-slate-500">Gross Target Profit</p>
          <p className="font-bold text-green-400">
            {formatMoneyValue(sizing.grossProfitAtTarget)}
          </p>
        </div>

        <div>
          <p className="text-slate-500">Gross SL Loss</p>
          <p className="font-bold text-red-400">
            {formatMoneyValue(sizing.grossLossAtStop)}
          </p>
        </div>

        <div>
          <p className="text-slate-500">Est. Charges</p>
          <p className="font-bold text-yellow-300">
            {formatMoneyValue(sizing.estimatedCharges)}
          </p>
        </div>

        <div>
          <p className="text-slate-500">Net R:R</p>
          <p className={`font-bold ${qualityClass}`}>
            1:{sizing.netRiskReward}
          </p>
        </div>

        <div>
          <p className="text-slate-500">Net Target Profit</p>
          <p className="font-bold text-green-400">
            {formatMoneyValue(sizing.netProfitAtTarget)}
          </p>
        </div>

        <div>
          <p className="text-slate-500">Net SL Loss</p>
          <p className="font-bold text-red-400">
            {formatMoneyValue(sizing.netLossAtStop)}
          </p>
        </div>
      </div>

      <div className="mt-3 rounded-xl bg-black/20 p-3">
        <p className={`text-sm font-bold ${qualityClass}`}>
          Quality: {sizing.quality}
        </p>

        {sizing.warnings.length > 0 && (
          <ul className="mt-2 space-y-1 text-xs text-yellow-200">
            {sizing.warnings.slice(0, 3).map((warning, index) => (
              <li key={index}>• {warning}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function TradeExitAssistantBox({
  signal,
  currentPrice,
  lifecycleStatus,
}: {
  signal: TradeSignal;
  currentPrice: number;
  lifecycleStatus?: SignalLifecycleStatus;
}) {
  const { candles } = useApp();

  if (signal.side !== 'BUY' && signal.side !== 'SELL') {
    return null;
  }

  if (!currentPrice) {
    return null;
  }

  const risk =
    signal.riskPerShare ||
    Math.abs(Number(signal.entry || 0) - Number(signal.stopLoss || 0));

  if (!risk) {
    return null;
  }

  const profitPerShare =
    signal.side === 'BUY'
      ? currentPrice - signal.entry
      : signal.entry - currentPrice;

  const currentR = profitPerShare / risk;

  const targetExit = analyzeTargetExit({
    signal,
    currentPrice,
    candles: candles[signal.symbol] || [],
  });

  let message = 'Manage trade using stop loss, target, and manual exit rules.';
  let messageClass = 'text-slate-300';

  if (lifecycleStatus === 'WAITING') {
    message = 'Entry not triggered yet. Do not enter if signal expires.';
    messageClass = 'text-yellow-300';
  } else if (lifecycleStatus === 'EXPIRED') {
    message = 'Signal expired before entry. Avoid fresh entry.';
    messageClass = 'text-red-300';
  } else if (currentR < 0) {
    message =
      'Trade is below entry. Do not average. Respect SL or consider manual exit if setup weakens.';
    messageClass = 'text-red-300';
  } else if (targetExit?.suggestedAction === 'EXIT_REMAINING') {
    message =
      'High reversal risk near/after Target 1. Consider exiting remaining quantity.';
    messageClass = 'text-red-300';
  } else if (targetExit?.suggestedAction === 'BOOK_PARTIAL') {
    message =
      'Price is near Target 1 with reversal risk. Consider booking partial profit.';
    messageClass = 'text-yellow-300';
  } else if (targetExit?.suggestedAction === 'TRAIL_SL') {
    message =
      'Target 1 is hit with continuation support. Trail SL and hold remaining only while trend holds.';
    messageClass = 'text-purple-300';
  } else if (currentR >= 1) {
    message =
      'Trade has reached 1R+ zone. Consider trailing SL or booking partial profit.';
    messageClass = 'text-purple-300';
  } else if (currentR >= 0.7) {
    message =
      'Trade has reached 0.7R zone. Consider moving SL near breakeven.';
    messageClass = 'text-cyan-300';
  }

  const reversalClass =
    targetExit?.reversalRisk === 'HIGH'
      ? 'text-red-300'
      : targetExit?.reversalRisk === 'MEDIUM'
        ? 'text-yellow-300'
        : 'text-green-300';

  const confidenceClass =
    targetExit?.holdToTarget2Confidence === 'HIGH'
      ? 'text-green-300'
      : targetExit?.holdToTarget2Confidence === 'MEDIUM'
        ? 'text-yellow-300'
        : 'text-red-300';

  const actionClass =
    targetExit?.suggestedAction === 'EXIT_REMAINING'
      ? 'border-red-500/30 bg-red-500/15 text-red-200'
      : targetExit?.suggestedAction === 'BOOK_PARTIAL'
        ? 'border-yellow-500/30 bg-yellow-500/15 text-yellow-200'
        : targetExit?.suggestedAction === 'TRAIL_SL'
          ? 'border-purple-500/30 bg-purple-500/15 text-purple-200'
          : targetExit?.suggestedAction === 'MOVE_SL_TO_COST'
            ? 'border-cyan-500/30 bg-cyan-500/15 text-cyan-200'
            : 'border-green-500/30 bg-green-500/15 text-green-200';

  return (
    <div className="mt-4 rounded-2xl border border-orange-500/20 bg-orange-500/10 p-4">
      <p className="text-sm font-semibold text-orange-300">
        Trade Exit Assistant
      </p>

      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-slate-500">Current R</p>
          <p className={currentR >= 0 ? 'font-bold text-green-400' : 'font-bold text-red-400'}>
            {currentR.toFixed(2)}R
          </p>
        </div>

        <div>
          <p className="text-slate-500">Current P/L per share</p>
          <p className={profitPerShare >= 0 ? 'font-bold text-green-400' : 'font-bold text-red-400'}>
            {formatMoneyValue(profitPerShare)}
          </p>
        </div>
      </div>

      <p className={`mt-3 text-sm ${messageClass}`}>{message}</p>

      {targetExit && (
        <div className="mt-4 rounded-2xl border border-slate-700 bg-black/30 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-orange-200">
                Target Exit Assistant
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Helps decide whether to book, trail, or hold for Target 2.
              </p>
            </div>

            <span className={`rounded-full border px-3 py-1 text-xs font-bold ${actionClass}`}>
              {getTargetExitActionLabel(targetExit.suggestedAction)}
            </span>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
            <div>
              <p className="text-slate-500">Progress to T1</p>
              <p className="font-bold text-white">
                {targetExit.targetProgressPercent.toFixed(0)}%
              </p>
            </div>

            <div>
              <p className="text-slate-500">Reversal Risk</p>
              <p className={`font-bold ${reversalClass}`}>
                {targetExit.reversalRisk}
              </p>
            </div>

            <div>
              <p className="text-slate-500">Hold to T2</p>
              <p className={`font-bold ${confidenceClass}`}>
                {targetExit.holdToTarget2Confidence}
              </p>
            </div>
          </div>

          {targetExit.reasons.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-slate-300">
              {targetExit.reasons.map((reason, index) => (
                <li key={index}>• {reason}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function TrackingBox({
  status,
  currentPrice,
  lastCheckedAt,
}: {
  status: SignalLifecycleStatus;
  currentPrice: number;
  lastCheckedAt?: string;
}) {
  return (
    <div className="mt-4 rounded-2xl border border-slate-700 bg-black/30 p-4">
      <div className="mb-3 flex items-center gap-2 text-slate-300">
        <Radar className="h-4 w-4" />
        <span className="text-sm font-semibold">Tracking Status</span>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-slate-500">Current Status</p>
          <p
            className={`mt-1 inline-flex rounded-full border px-3 py-1 text-xs font-bold ${getStatusClass(
              status
            )}`}
          >
            {getStatusLabel(status)}
          </p>
        </div>

        <div>
          <p className="text-slate-500">Current Price</p>
          <p className="font-bold text-white">{formatPrice(currentPrice)}</p>
        </div>
      </div>

      {lastCheckedAt && (
        <p className="mt-3 text-xs text-slate-500">
          Last checked: {new Date(lastCheckedAt).toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}

function SignalCard({
  signal,
  sentiment,
  loadingSentiment,
  news,
  onTrack,
  isTracked,
  lifecycleStatus,
  currentPrice,
  lastCheckedAt,
  onRemoveTracked,
  onSaveToJournal,
  onManualExit,
  savedToJournal,
  canSaveToJournal,
  canManualExit,
}: {
  signal: TradeSignal;
  sentiment?: AISentiment;
  loadingSentiment: boolean;
  news: NewsItem[];
  onTrack?: () => void;
  isTracked?: boolean;
  lifecycleStatus?: SignalLifecycleStatus;
  currentPrice?: number;
  lastCheckedAt?: string;
  onRemoveTracked?: () => void;
  onSaveToJournal?: () => void;
  onManualExit?: () => void;
  savedToJournal?: boolean;
  canSaveToJournal?: boolean;
  canManualExit?: boolean;
}) {
  const isBuy = signal.side === 'BUY';
  const isSell = signal.side === 'SELL';
  const isNeutral = signal.side === 'NEUTRAL';

  const cardBorder = isBuy
    ? 'border-green-500/30'
    : isSell
    ? 'border-red-500/30'
    : 'border-slate-700';

  const badgeClass = isBuy
    ? 'bg-green-500/15 text-green-400'
    : isSell
    ? 'bg-red-500/15 text-red-400'
    : 'bg-slate-700 text-slate-300';

  return (
    <div
      className={`rounded-3xl border ${cardBorder} bg-[#15161b] p-5 shadow-lg`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-white">{signal.symbol}</h2>
          <p className="mt-1 text-sm text-slate-400">
            Strategy: Intraday Price Action
          </p>
        </div>

        <div
          className={`rounded-full px-4 py-2 text-sm font-semibold ${badgeClass}`}
        >
          {signal.status.replaceAll('_', ' ')}
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3">
        {isBuy && <TrendingUp className="h-6 w-6 text-green-400" />}
        {isSell && <TrendingDown className="h-6 w-6 text-red-400" />}
        {isNeutral && <ShieldAlert className="h-6 w-6 text-slate-400" />}

        <div>
          <p className="text-sm text-slate-400">Signal</p>
          <p
            className={
              isBuy
                ? 'text-xl font-bold text-green-400'
                : isSell
                ? 'text-xl font-bold text-red-400'
                : 'text-xl font-bold text-slate-300'
            }
          >
            {signal.side}
          </p>
        </div>

        <div className="ml-auto text-right">
          <p className="text-sm text-slate-400">Strength</p>
          <p className="text-lg font-semibold text-white">{signal.strength}</p>
        </div>
      </div>

      {lifecycleStatus && (
        <TrackingBox
          status={lifecycleStatus}
          currentPrice={currentPrice || 0}
          lastCheckedAt={lastCheckedAt}
        />
      )}

      <SentimentBox sentiment={sentiment} loading={loadingSentiment} />

      <NewsBox news={news} />

      {!isNeutral && (
        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-black/30 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">
              Entry
            </p>
            <p className="mt-1 text-lg font-bold text-white">
              {formatPrice(signal.entry)}
            </p>
          </div>

          <div className="rounded-2xl bg-black/30 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">
              Stop Loss
            </p>
            <p className="mt-1 text-lg font-bold text-red-400">
              {formatPrice(signal.stopLoss)}
            </p>
          </div>

          <div className="rounded-2xl bg-black/30 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">
              Target 1
            </p>
            <p className="mt-1 text-lg font-bold text-green-400">
              {formatPrice(signal.target1)}
            </p>
          </div>

          <div className="rounded-2xl bg-black/30 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">
              Target 2
            </p>
            <p className="mt-1 text-lg font-bold text-green-400">
              {formatPrice(signal.target2)}
            </p>
          </div>
        </div>
      )}

      {!isNeutral && (
        <div className="mt-4 rounded-2xl bg-black/30 p-4">
          <div className="flex items-center gap-2 text-slate-300">
            <Target className="h-4 w-4" />
            <span className="text-sm font-medium">Risk Details</span>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
            <div>
              <p className="text-slate-500">Risk/share</p>
              <p className="font-semibold text-white">
                {formatPrice(signal.riskPerShare)}
              </p>
            </div>

            <div>
              <p className="text-slate-500">Reward/share</p>
              <p className="font-semibold text-white">
                {formatPrice(signal.rewardPerShare)}
              </p>
            </div>

            <div>
              <p className="text-slate-500">R:R</p>
              <p className="font-semibold text-white">1:{signal.riskReward}</p>
            </div>
          </div>
        </div>
      )}

      {!isNeutral && <PositionSizingBox signal={signal} />}

      {!isNeutral && (
        <TradeExitAssistantBox
          signal={signal}
          currentPrice={currentPrice || signal.entry}
          lifecycleStatus={lifecycleStatus}
        />
      )}

      <div className="mt-5">
        <p className="mb-2 text-sm font-semibold text-slate-300">Reasons</p>
        <ul className="space-y-2">
          {signal.reasons.map((reason, index) => (
            <li key={index} className="text-sm text-slate-400">
              • {reason}
            </li>
          ))}
        </ul>
      </div>

      {!isNeutral && onTrack && (
        <button
          onClick={onTrack}
          disabled={isTracked}
          className={`mt-5 flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 font-semibold ${
            isTracked
              ? 'cursor-not-allowed bg-slate-700 text-slate-400'
              : 'bg-blue-600 text-white'
          }`}
        >
          <Radar className="h-4 w-4" />
          {isTracked ? 'Already Tracking' : 'Track Signal'}
        </button>
      )}

      {canSaveToJournal && onSaveToJournal && (
        <button
          onClick={onSaveToJournal}
          disabled={savedToJournal}
          className={`mt-5 flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 font-semibold ${
            savedToJournal
              ? 'cursor-not-allowed bg-green-600/20 text-green-400'
              : 'bg-green-600 text-white'
          }`}
        >
          <CheckCircle2 className="h-4 w-4" />
          {savedToJournal ? 'Saved to Journal' : 'Save to Journal'}
        </button>
      )}

      {canManualExit && onManualExit && (
        <button
          onClick={onManualExit}
          disabled={savedToJournal}
          className={`mt-5 flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 font-semibold ${
            savedToJournal
              ? 'cursor-not-allowed bg-green-600/20 text-green-400'
              : 'bg-orange-600 text-white'
          }`}
        >
          <CheckCircle2 className="h-4 w-4" />
          {savedToJournal ? 'Saved to Journal' : 'Save Manual Exit'}
        </button>
      )}

      {onRemoveTracked && (
        <button
          onClick={onRemoveTracked}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-red-600/20 px-4 py-3 font-semibold text-red-400"
        >
          <Trash2 className="h-4 w-4" />
          Remove Tracking
        </button>
      )}
    </div>
  );
}

export default function SignalsPage() {
  const { watchlist, prices, candles, updatePrices, updateCandles, addTrade } =
    useApp();
  const { addAlert, requestBrowserPermission, browserPermission } = useAlerts();
  const previousSignalStatusesRef = useRef<Record<string, string>>({});

  const [mounted, setMounted] = useState(false);
  const [sentiments, setSentiments] = useState<Record<string, AISentiment>>({});
  const [loadingSentiment, setLoadingSentiment] = useState(false);
  const [newsBySymbol, setNewsBySymbol] = useState<Record<string, NewsItem[]>>(
    {}
  );
  const [trackedSignals, setTrackedSignals] = useState<TrackedSignal[]>([]);
  const [hydratedTracking, setHydratedTracking] = useState(false);

  const signals = useMemo(() => {
    return generateSignals(watchlist, prices, candles);
  }, [watchlist, prices, candles]);

  const activeSignals = signals.filter((s) => s.side !== 'NEUTRAL');
  const neutralSignals = signals.filter((s) => s.side === 'NEUTRAL');

  const activeTrackedSignals = trackedSignals.filter(
    (signal) => !isTerminalStatus(signal.lifecycleStatus)
  );

  const completedTrackedSignals = trackedSignals.filter((signal) =>
    isTerminalStatus(signal.lifecycleStatus)
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(TRACKED_SIGNALS_KEY);

      if (saved) {
        setTrackedSignals(JSON.parse(saved));
      }
    } catch {
      setTrackedSignals([]);
    }

    setHydratedTracking(true);
  }, []);

  useEffect(() => {
    if (!hydratedTracking) return;

    localStorage.setItem(TRACKED_SIGNALS_KEY, JSON.stringify(trackedSignals));
  }, [trackedSignals, hydratedTracking]);

  useEffect(() => {
    if (!hydratedTracking || trackedSignals.length === 0) return;

    setTrackedSignals((prev) =>
      prev.map((signal) => {
        const currentPrice = prices[signal.symbol]?.price || 0;
        const nextStatus = calculateLifecycleStatus(signal, currentPrice);

        if (nextStatus === signal.lifecycleStatus) {
          return {
            ...signal,
            lastCheckedAt: new Date().toISOString(),
          };
        }

        return {
          ...signal,
          lifecycleStatus: nextStatus,
          lastCheckedAt: new Date().toISOString(),
        };
      })
    );
  }, [prices, hydratedTracking, trackedSignals.length]);

  async function fetchNewsForSymbol(symbol: string): Promise<NewsItem[]> {
    try {
      const response = await cachedClientFetch(`/api/news?symbol=${symbol}`, {
        cache: 'no-store',
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        return [];
      }

      return data.news || [];
    } catch {
      return [];
    }
  }

  async function analyzeSentiments() {
    if (!signals.length) return;

    setLoadingSentiment(true);

    const nextSentiments: Record<string, AISentiment> = {};
    const nextNewsBySymbol: Record<string, NewsItem[]> = {};

    for (const signal of signals) {
      try {
        const stockNews = await fetchNewsForSymbol(signal.symbol);
        nextNewsBySymbol[signal.symbol] = stockNews;

        const response = await cachedClientFetch('/api/hf/sentiment', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text: buildNewsSentimentText(signal, stockNews),
          }),
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          nextSentiments[signal.symbol] = getFallbackSentiment(signal);
          continue;
        }

        const result = data.result?.[0] || [];

        const top = result.reduce((best: any, item: any) => {
          if (!best || item.score > best.score) return item;
          return best;
        }, null);

        const label = (top?.label || 'neutral').toLowerCase() as
          | 'positive'
          | 'negative'
          | 'neutral';

        const confidence = Math.round((top?.score || 0.6) * 100);

        nextSentiments[signal.symbol] = {
          label,
          confidence,
          signalScore: calculateSignalScore(signal, label, confidence),
        };
      } catch {
        nextNewsBySymbol[signal.symbol] = [];
        nextSentiments[signal.symbol] = getFallbackSentiment(signal);
      }
    }

    setSentiments(nextSentiments);
    setNewsBySymbol(nextNewsBySymbol);
    setLoadingSentiment(false);
  }

  function isSignalAlreadyTracked(signal: TradeSignal) {
    return trackedSignals.some(
      (tracked) =>
        tracked.symbol === signal.symbol &&
        tracked.side === signal.side &&
        !isTerminalStatus(tracked.lifecycleStatus)
    );
  }

  function trackSignal(signal: TradeSignal) {
    if (!isFreshSignalWindowOpenIST()) {
      alert('Fresh intraday signals can be tracked only between 09:30 and 14:45 IST.');
      return;
    }

    if (signal.side === 'NEUTRAL') {
      alert('Neutral signals cannot be tracked.');
      return;
    }

    if (isSignalAlreadyTracked(signal)) {
      alert(`${signal.symbol} ${signal.side} signal is already being tracked.`);
      return;
    }

    const currentPrice = prices[signal.symbol]?.price || signal.entry;

    const trackedSignal: TrackedSignal = {
      ...signal,
      id: createId(),
      createdAt: new Date().toISOString(),
      lastCheckedAt: new Date().toISOString(),
      lifecycleStatus: calculateLifecycleStatus(
        {
          ...signal,
          id: 'temp',
          createdAt: new Date().toISOString(),
          lifecycleStatus: 'WAITING',
        },
        currentPrice
      ),
      sentiment: sentiments[signal.symbol],
      news: newsBySymbol[signal.symbol] || [],
    };

    setTrackedSignals((prev) => [trackedSignal, ...prev]);
  }

  function removeTrackedSignal(id: string) {
    setTrackedSignals((prev) => prev.filter((signal) => signal.id !== id));
  }

  function clearCompletedSignals() {
    setTrackedSignals((prev) =>
      prev.filter((signal) => !isTerminalStatus(signal.lifecycleStatus))
    );
  }

  function canSaveTrackedSignalToJournal(signal: TrackedSignal) {
    return (
      signal.side !== 'NEUTRAL' &&
      canSaveStatusToJournal(signal.lifecycleStatus)
    );
  }

  function saveTrackedSignalToJournal(signal: TrackedSignal) {
    if (signal.savedToJournal) {
      alert('This signal is already saved to the journal.');
      return;
    }

    if (!canSaveTrackedSignalToJournal(signal)) {
      alert('Only target hit or stop loss hit signals can be saved.');
      return;
    }

    if (signal.side !== 'BUY' && signal.side !== 'SELL') {
      alert('Only BUY or SELL signals can be saved.');
      return;
    }

    const exitPrice = getExitPriceForJournal(signal);

    if (!exitPrice) {
      alert('Could not calculate exit price.');
      return;
    }

    const quantityText = window.prompt(
      `Enter quantity for ${signal.symbol}`,
      '1'
    );

    if (quantityText === null) return;

    const quantity = Number(quantityText);

    if (!quantity || quantity <= 0) {
      alert('Enter a valid quantity.');
      return;
    }

    const brokerageText = window.prompt('Enter brokerage/charges', '0');

    if (brokerageText === null) return;

    const brokerage = Number(brokerageText || 0);

    if (brokerage < 0) {
      alert('Brokerage cannot be negative.');
      return;
    }

    addTrade({
      symbol: signal.symbol,
      side: signal.side,
      entryPrice: signal.entry,
      exitPrice,
      quantity,
      brokerage,
    });

    setTrackedSignals((prev) =>
      prev.map((item) =>
        item.id === signal.id
          ? {
              ...item,
              savedToJournal: true,
            }
          : item
      )
    );

    alert(`${signal.symbol} trade saved to journal.`);
  }

  function canManualExitTrackedSignal(signal: TrackedSignal) {
    return (
      signal.side !== 'NEUTRAL' &&
      signal.lifecycleStatus !== 'WAITING' &&
      !isTerminalStatus(signal.lifecycleStatus)
    );
  }

  function saveManualExitToJournal(signal: TrackedSignal) {
    if (signal.savedToJournal) {
      alert('This signal is already saved to the journal.');
      return;
    }

    if (!canManualExitTrackedSignal(signal)) {
      alert('Only triggered/open trades can be manually exited.');
      return;
    }

    if (signal.side !== 'BUY' && signal.side !== 'SELL') {
      alert('Only BUY or SELL signals can be saved.');
      return;
    }

    const currentPrice = prices[signal.symbol]?.price || signal.entry;

    const exitPriceText = window.prompt(
      `Enter manual exit price for ${signal.symbol}`,
      String(currentPrice || signal.entry)
    );

    if (exitPriceText === null) return;

    const exitPrice = Number(exitPriceText);

    if (!exitPrice || exitPrice <= 0) {
      alert('Enter a valid exit price.');
      return;
    }

    const quantityText = window.prompt(
      `Enter quantity for ${signal.symbol}`,
      '1'
    );

    if (quantityText === null) return;

    const quantity = Number(quantityText);

    if (!quantity || quantity <= 0) {
      alert('Enter a valid quantity.');
      return;
    }

    const brokerageText = window.prompt('Enter brokerage/charges', '0');

    if (brokerageText === null) return;

    const brokerage = Number(brokerageText || 0);

    if (brokerage < 0) {
      alert('Brokerage cannot be negative.');
      return;
    }

    addTrade({
      symbol: signal.symbol,
      side: signal.side,
      entryPrice: signal.entry,
      exitPrice,
      quantity,
      brokerage,
      stopLoss: signal.stopLoss,
      target: signal.target1,
      outcome: 'MANUAL_EXIT',
    });

    setTrackedSignals((prev) =>
      prev.map((item) =>
        item.id === signal.id
          ? {
              ...item,
              lifecycleStatus: 'MANUAL_EXIT',
              savedToJournal: true,
              lastCheckedAt: new Date().toISOString(),
            }
          : item
      )
    );

    alert(`${signal.symbol} manual exit saved to journal.`);
  }

  function notifySignalStatusChange(signal: TrackedSignal) {
    const status = signal.lifecycleStatus;

    if (status === 'TRIGGERED') {
      addAlert({
        title: `${signal.symbol} Entry Triggered`,
        message: `${signal.side} signal triggered at ${signal.entry.toFixed(
          2
        )}. Watch targets and stop loss.`,
        type: 'info',
      });
      return;
    }

    if (status === 'BREAKEVEN_SUGGESTED') {
      addAlert({
        title: `${signal.symbol} Move SL to Cost`,
        message: `${signal.side} trade reached profit protection zone. Consider moving stop loss near entry.`,
        type: 'info',
      });
      return;
    }

    if (status === 'TRAIL_SL_SUGGESTED') {
      addAlert({
        title: `${signal.symbol} Trail SL Suggested`,
        message: `${signal.side} trade has moved in your favor. Consider trailing stop loss.`,
        type: 'info',
      });
      return;
    }

    if (status === 'TIME_EXIT_SUGGESTED') {
      addAlert({
        title: `${signal.symbol} Time Exit Suggested`,
        message: `Intraday time exit zone reached. Consider manual exit or tight trailing stop.`,
        type: 'warning',
      });
      return;
    }

    if (status === 'TARGET_1_HIT') {
      addAlert({
        title: `${signal.symbol} Target 1 Hit`,
        message: `${signal.side} signal reached Target 1 at ${signal.target1.toFixed(
          2
        )}.`,
        type: 'success',
      });
      return;
    }

    if (status === 'TARGET_2_HIT') {
      addAlert({
        title: `${signal.symbol} Target 2 Hit`,
        message: `${signal.side} signal reached Target 2 at ${signal.target2.toFixed(
          2
        )}.`,
        type: 'success',
      });
      return;
    }

    if (status === 'STOP_LOSS_HIT') {
      addAlert({
        title: `${signal.symbol} Stop Loss Hit`,
        message: `${signal.side} signal hit stop loss at ${signal.stopLoss.toFixed(
          2
        )}.`,
        type: 'danger',
      });
      return;
    }
  }

  useEffect(() => {
    if (!hydratedTracking) return;

    const previousStatuses = previousSignalStatusesRef.current;
    const nextStatuses: Record<string, string> = {};

    trackedSignals.forEach((signal) => {
      nextStatuses[signal.id] = signal.lifecycleStatus;

      const previousStatus = previousStatuses[signal.id];

      // First time loading existing signal: don't alert
      if (!previousStatus) return;

      // Alert only when status actually changes
      if (previousStatus === signal.lifecycleStatus) return;

      if (
        signal.lifecycleStatus === 'TRIGGERED' ||
        signal.lifecycleStatus === 'BREAKEVEN_SUGGESTED' ||
        signal.lifecycleStatus === 'TRAIL_SL_SUGGESTED' ||
        signal.lifecycleStatus === 'TIME_EXIT_SUGGESTED' ||
        signal.lifecycleStatus === 'TARGET_1_HIT' ||
        signal.lifecycleStatus === 'TARGET_2_HIT' ||
        signal.lifecycleStatus === 'STOP_LOSS_HIT'
      ) {
        notifySignalStatusChange(signal);
      }
    });

    previousSignalStatusesRef.current = nextStatuses;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackedSignals, hydratedTracking]);

  useEffect(() => {
    if (!signals.length) return;

    analyzeSentiments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signals.length]);

  return (
    <main className="min-h-screen bg-[#050608] px-5 pb-28 pt-8 text-white">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold">Signals</h1>
            <p className="mt-2 text-slate-400">
              Rule-based intraday watch signals with tracking and news sentiment.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <button
              onClick={() => {
                updatePrices();
                updateCandles();
              }}
              className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 font-semibold text-white"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>

            <button
              onClick={analyzeSentiments}
              className="flex items-center justify-center gap-2 rounded-2xl bg-purple-600 px-4 py-3 font-semibold text-white"
            >
              <Brain className="h-4 w-4" />
              AI Check
            </button>

            <button
              onClick={requestBrowserPermission}
              className="flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 font-semibold text-white"
            >
              Enable Alerts
            </button>

            <p className="text-center text-xs text-slate-500">
              {mounted && browserPermission === 'granted'
                ? 'Browser alerts enabled'
                : 'In-app alerts active'}
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-yellow-500/20 bg-yellow-500/10 p-4 text-sm text-yellow-200">
          Educational signal tracker only. Not financial advice. Signals are
          generated using simple rules, Angel One market data, Google News RSS,
          and Hugging Face sentiment analysis.
        </div>

        <section className="mt-8">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-sm uppercase tracking-[0.25em] text-slate-500">
              Tracked Signals ({trackedSignals.length})
            </h2>

            {completedTrackedSignals.length > 0 && (
              <button
                onClick={clearCompletedSignals}
                className="flex items-center gap-2 rounded-xl bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-300"
              >
                <CheckCircle2 className="h-4 w-4" />
                Clear Completed
              </button>
            )}
          </div>

          {trackedSignals.length === 0 ? (
            <div className="rounded-3xl border border-slate-800 bg-[#15161b] p-6 text-slate-400">
              No tracked signals yet. Tap “Track Signal” on any active signal.
            </div>
          ) : (
            <div className="space-y-5">
              {activeTrackedSignals.map((signal) => (
                <SignalCard
                  key={signal.id}
                  signal={signal}
                  sentiment={signal.sentiment}
                  loadingSentiment={false}
                  news={signal.news || []}
                  lifecycleStatus={signal.lifecycleStatus}
                  currentPrice={prices[signal.symbol]?.price || 0}
                  lastCheckedAt={signal.lastCheckedAt}
                  onRemoveTracked={() => removeTrackedSignal(signal.id)}
                  canSaveToJournal={canSaveTrackedSignalToJournal(signal)}
                  savedToJournal={signal.savedToJournal}
                  onSaveToJournal={() => saveTrackedSignalToJournal(signal)}
                  canManualExit={canManualExitTrackedSignal(signal)}
                  onManualExit={() => saveManualExitToJournal(signal)}
                />
              ))}

              {completedTrackedSignals.map((signal) => (
                <SignalCard
                  key={signal.id}
                  signal={signal}
                  sentiment={signal.sentiment}
                  loadingSentiment={false}
                  news={signal.news || []}
                  lifecycleStatus={signal.lifecycleStatus}
                  currentPrice={prices[signal.symbol]?.price || 0}
                  lastCheckedAt={signal.lastCheckedAt}
                  onRemoveTracked={() => removeTrackedSignal(signal.id)}
                  canSaveToJournal={canSaveTrackedSignalToJournal(signal)}
                  savedToJournal={signal.savedToJournal}
                  onSaveToJournal={() => saveTrackedSignalToJournal(signal)}
                />
              ))}
            </div>
          )}
        </section>

        <section className="mt-8">
          <h2 className="mb-4 text-sm uppercase tracking-[0.25em] text-slate-500">
            Active Watch Signals ({activeSignals.length})
          </h2>

          {activeSignals.length === 0 ? (
            <div className="rounded-3xl border border-slate-800 bg-[#15161b] p-6 text-slate-400">
              No active buy/sell watch signals right now. Wait for cleaner setup.
            </div>
          ) : (
            <div className="space-y-5">
              {activeSignals.map((signal) => (
                <SignalCard
                  key={signal.symbol}
                  signal={signal}
                  sentiment={sentiments[signal.symbol]}
                  loadingSentiment={loadingSentiment}
                  news={newsBySymbol[signal.symbol] || []}
                  onTrack={() => trackSignal(signal)}
                  isTracked={isSignalAlreadyTracked(signal)}
                />
              ))}
            </div>
          )}
        </section>

        <section className="mt-8">
          <h2 className="mb-4 text-sm uppercase tracking-[0.25em] text-slate-500">
            Neutral / No Trade ({neutralSignals.length})
          </h2>

          <div className="space-y-5">
            {neutralSignals.map((signal) => (
              <SignalCard
                key={signal.symbol}
                signal={signal}
                sentiment={sentiments[signal.symbol]}
                loadingSentiment={loadingSentiment}
                news={newsBySymbol[signal.symbol] || []}
              />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
