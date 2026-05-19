import { NextRequest, NextResponse } from 'next/server';
import { XMLParser } from 'fast-xml-parser';
import { INSTRUMENTS } from '@/lib/instruments';

export const dynamic = 'force-dynamic';

type NewsItem = {
  title: string;
  link: string;
  source?: string;
  publishedAt?: string;
};

function cleanTitle(title: string) {
  return title
    .replace(/ - Moneycontrol/gi, '')
    .replace(/ - The Economic Times/gi, '')
    .replace(/ - Business Standard/gi, '')
    .replace(/ - Mint/gi, '')
    .replace(/ - NDTV Profit/gi, '')
    .trim();
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get('symbol')?.toUpperCase();

    if (!symbol) {
      return NextResponse.json(
        {
          success: false,
          error: 'Symbol is required',
        },
        {
          status: 400,
        }
      );
    }

    const instrument = INSTRUMENTS[symbol];

    const companyName = instrument?.name || symbol;

    const query = encodeURIComponent(
      `${companyName} ${symbol} stock NSE India`
    );

    const url = `https://news.google.com/rss/search?q=${query}&hl=en-IN&gl=IN&ceid=IN:en`;

    const response = await fetch(url, {
      cache: 'no-store',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    });

    const xml = await response.text();

    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to fetch news',
          status: response.status,
        },
        {
          status: 500,
        }
      );
    }

    const parser = new XMLParser({
      ignoreAttributes: false,
    });

    const parsed = parser.parse(xml);

    const rawItems = parsed?.rss?.channel?.item || [];

    const itemsArray = Array.isArray(rawItems) ? rawItems : [rawItems];

    const news: NewsItem[] = itemsArray.slice(0, 5).map((item: any) => ({
      title: cleanTitle(item.title || ''),
      link: item.link || '',
      source: item.source?.['#text'] || item.source || 'Google News',
      publishedAt: item.pubDate || '',
    }));

    return NextResponse.json({
      success: true,
      symbol,
      companyName,
      news,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'Failed to fetch news',
      },
      {
        status: 500,
      }
    );
  }
}