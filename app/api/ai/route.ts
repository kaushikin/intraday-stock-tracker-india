import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { trades, dailyPL, watchlist } = await request.json();

    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.length < 20) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured. Please add it to your environment variables.' },
        { status: 400 }
      );
    }

    const prompt = `You are an experienced Indian intraday equity trading coach. Analyze the following data from today's trading session and provide structured, educational feedback.

**Today's Data:**
- Total Trades: ${trades.length}
- Net P/L: ₹${dailyPL}
- Symbols Traded: ${watchlist?.join(', ') || 'N/A'}
- Trade Details: ${JSON.stringify(trades.map((t: any) => ({
  symbol: t.symbol,
  side: t.side,
  entry: t.entryPrice,
  exit: t.exitPrice,
  qty: t.quantity,
  pl: t.side === 'BUY' 
    ? ((t.exitPrice - t.entryPrice) * t.quantity - t.brokerage).toFixed(0)
    : ((t.entryPrice - t.exitPrice) * t.quantity - t.brokerage).toFixed(0)
})))}

**Instructions:**
1. Write a concise performance summary (2-3 sentences).
2. Identify 1-2 key lessons or mistakes observed.
3. Give 2 practical risk management tips relevant to Indian equity intraday trading.
4. End with a short encouraging note about building discipline.

**Strict Rules:**
- NEVER give buy, sell, or hold recommendations for any stock.
- NEVER promise profits or say "you will make money".
- Focus only on process, risk, and psychology.
- Keep language professional and supportive.
- Use Indian trading context (NSE, brokerage, etc.).

Respond ONLY in this exact JSON format (no markdown, no extra text):
{
  "summary": "...",
  "lessons": "...",
  "tips": "...",
  "encouragement": "..."
}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a professional trading psychology and risk management coach for Indian retail traders. You never give trading tips or stock recommendations."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 700,
      response_format: { type: "json_object" }
    });

    const content = completion.choices[0]?.message?.content;
    
    if (!content) {
      throw new Error('No response from OpenAI');
    }

    const parsed = JSON.parse(content);
    
    return NextResponse.json(parsed);

  } catch (error: any) {
    console.error('OpenAI API Error:', error);
    
    return NextResponse.json(
      { 
        error: error.message || 'Failed to generate AI summary. Please check your OpenAI API key.' 
      },
      { status: 500 }
    );
  }
}