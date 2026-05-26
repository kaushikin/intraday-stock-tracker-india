import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export const dynamic = 'force-dynamic';

type TradeInput = {
  symbol?: string;
  side?: 'BUY' | 'SELL';
  entryPrice?: number;
  exitPrice?: number;
  quantity?: number;
  brokerage?: number;
  setup?: string;
  emotion?: string;
  mistake?: string;
  notes?: string;
  timestamp?: string;
  date?: string;
};

function getTradePL(trade: TradeInput) {
  const entry = Number(trade.entryPrice || 0);
  const exit = Number(trade.exitPrice || 0);
  const quantity = Number(trade.quantity || 0);
  const brokerage = Number(trade.brokerage || 0);

  const gross =
    trade.side === 'BUY'
      ? (exit - entry) * quantity
      : (entry - exit) * quantity;

  return gross - brokerage;
}

function formatCurrency(value: number) {
  const sign = value < 0 ? '-' : '';
  return `${sign}₹${Math.abs(value).toFixed(2)}`;
}

function summarizeByField(
  trades: TradeInput[],
  field: 'setup' | 'emotion' | 'mistake'
) {
  const map: Record<
    string,
    {
      name: string;
      trades: number;
      pnl: number;
      wins: number;
      losses: number;
    }
  > = {};

  for (const trade of trades) {
    const rawValue = trade[field];
    const name = rawValue && rawValue.trim() ? rawValue.trim() : 'Not tagged';
    const pnl = getTradePL(trade);

    if (!map[name]) {
      map[name] = {
        name,
        trades: 0,
        pnl: 0,
        wins: 0,
        losses: 0,
      };
    }

    map[name].trades += 1;
    map[name].pnl += pnl;

    if (pnl > 0) map[name].wins += 1;
    if (pnl < 0) map[name].losses += 1;
  }

  return Object.values(map)
    .map((item) => ({
      ...item,
      pnl: Number(item.pnl.toFixed(2)),
      winRate:
        item.trades > 0 ? Number(((item.wins / item.trades) * 100).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.pnl - a.pnl);
}

function buildTradeDetailsForPrompt(trades: TradeInput[]) {
  return trades.map((trade) => {
    const pnl = getTradePL(trade);

    return {
      symbol: trade.symbol || 'UNKNOWN',
      side: trade.side || 'UNKNOWN',
      entry: Number(trade.entryPrice || 0),
      exit: Number(trade.exitPrice || 0),
      quantity: Number(trade.quantity || 0),
      brokerage: Number(trade.brokerage || 0),
      pnl: Number(pnl.toFixed(2)),
      setup: trade.setup || 'Not tagged',
      emotion: trade.emotion || 'Not tagged',
      mistake: trade.mistake || 'Not tagged',
      notes: trade.notes || '',
      time: trade.timestamp || trade.date || '',
    };
  });
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey || apiKey.length < 20) {
      return NextResponse.json(
        {
          error:
            'OpenAI API key not configured. Please add it to your environment variables.',
        },
        { status: 400 }
      );
    }

    const body = await request.json();

    const trades: TradeInput[] = Array.isArray(body.trades) ? body.trades : [];
    const dailyPL = Number(body.dailyPL || 0);
    const watchlist: string[] = Array.isArray(body.watchlist)
      ? body.watchlist
      : [];

    if (trades.length === 0) {
      return NextResponse.json(
        {
          error: 'No trades provided for AI summary.',
        },
        { status: 400 }
      );
    }

    const openai = new OpenAI({
      apiKey,
    });

    const enrichedTrades = buildTradeDetailsForPrompt(trades);

    const symbolsTraded = Array.from(
      new Set(enrichedTrades.map((trade) => trade.symbol).filter(Boolean))
    );

    const winningTrades = enrichedTrades.filter((trade) => trade.pnl > 0);
    const losingTrades = enrichedTrades.filter((trade) => trade.pnl < 0);

    const setupSummary = summarizeByField(trades, 'setup');
    const emotionSummary = summarizeByField(trades, 'emotion');
    const mistakeSummary = summarizeByField(trades, 'mistake');

    const notes = enrichedTrades
      .filter((trade) => trade.notes)
      .map((trade) => ({
        symbol: trade.symbol,
        pnl: trade.pnl,
        setup: trade.setup,
        emotion: trade.emotion,
        mistake: trade.mistake,
        notes: trade.notes,
      }));

    const prompt = `You are an experienced Indian intraday equity trading coach. Analyze today's trading journal and provide structured educational feedback.

Today's Session Data:
- Total Trades: ${trades.length}
- Winning Trades: ${winningTrades.length}
- Losing Trades: ${losingTrades.length}
- Net P/L: ${formatCurrency(dailyPL)}
- Symbols Traded: ${symbolsTraded.join(', ') || 'N/A'}
- Watchlist Symbols: ${watchlist.join(', ') || 'N/A'}

Trade Details:
${JSON.stringify(enrichedTrades, null, 2)}

Performance by Setup:
${JSON.stringify(setupSummary, null, 2)}

Performance by Emotion:
${JSON.stringify(emotionSummary, null, 2)}

Performance by Mistake:
${JSON.stringify(mistakeSummary, null, 2)}

Trader Notes:
${JSON.stringify(notes, null, 2)}

Instructions:
1. Write a concise performance summary in 2-3 sentences.
2. Identify 1-2 key lessons from setup, emotion, mistake, and notes.
3. Give 2 practical risk management or psychology tips relevant to Indian equity intraday trading.
4. End with a short encouraging note about discipline and review.
5. If FOMO, revenge trading, overconfidence, chasing entries, late entries, early exits, overtrading, or no stop loss appear in the data, mention them clearly but supportively.
6. If calm trades or clean setups performed better, highlight that pattern.
7. Keep feedback specific to the user's journal data, not generic.

Strict Rules:
- NEVER give buy, sell, or hold recommendations for any stock.
- NEVER recommend any specific stock or future trade.
- NEVER promise profits.
- NEVER say "you will make money".
- Focus only on process, risk, discipline, journaling, and psychology.
- Use Indian trading context like NSE, intraday, brokerage, position sizing, stop loss, and overtrading.
- Keep language professional, direct, and supportive.

Respond ONLY in this exact JSON format. No markdown. No extra text:
{
  "summary": "...",
  "lessons": "...",
  "tips": "...",
  "encouragement": "..."
}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You are a professional trading psychology and risk management coach for Indian retail traders. You never give trading tips, stock calls, predictions, or buy/sell recommendations. You only analyze the trader’s own journal for discipline, risk, and psychology.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.65,
      max_tokens: 900,
      response_format: { type: 'json_object' },
    });

    const content = completion.choices[0]?.message?.content;

    if (!content) {
      throw new Error('No response from OpenAI');
    }

    const parsed = JSON.parse(content);

    return NextResponse.json({
      summary: String(parsed.summary || ''),
      lessons: String(parsed.lessons || ''),
      tips: String(parsed.tips || ''),
      encouragement: String(parsed.encouragement || ''),
    });
  } catch (error: any) {
    console.error('OpenAI API Error:', error);

    return NextResponse.json(
      {
        error:
          error?.message ||
          'Failed to generate AI summary. Please check your OpenAI API key.',
      },
      { status: 500 }
    );
  }
}
