// Placeholder Market Data Service
// Replace this with real broker APIs later:
// - Zerodha Kite Connect
// - Upstox API  
// - Angel One SmartAPI
// - Dhan API
// - Fyers API

export interface MarketQuote {
  symbol: string;
  price: number;
  change: number;
  volume?: number;
  high?: number;
  low?: number;
}

export async function fetchMarketData(symbols: string[]): Promise<Record<string, MarketQuote>> {
  // MOCK IMPLEMENTATION - Simulates API delay
  // In production, replace with real API call (server-side only)
  
  await new Promise(resolve => setTimeout(resolve, 200)); // Simulate network

  const quotes: Record<string, MarketQuote> = {};
  
  symbols.forEach(symbol => {
    // Realistic Indian equity price ranges
    const basePrice = 
      symbol.includes('RELIANCE') ? 2450 + Math.random() * 20 :
      symbol.includes('TCS') ? 3850 + Math.random() * 50 :
      symbol.includes('HDFC') ? 1650 + Math.random() * 30 :
      symbol.includes('ICICI') ? 1100 + Math.random() * 25 :
      symbol.includes('SBIN') ? 800 + Math.random() * 15 :
      700 + Math.random() * 3000;

    const change = (Math.random() - 0.5) * 3.5; // -1.75% to +1.75%
    const price = Math.round((basePrice + (basePrice * change / 100)) * 100) / 100;

    quotes[symbol] = {
      symbol,
      price,
      change: parseFloat(change.toFixed(2)),
      volume: Math.floor(Math.random() * 15000000) + 2000000,
      high: parseFloat((price * 1.012).toFixed(2)),
      low: parseFloat((price * 0.988).toFixed(2)),
    };
  });

  return quotes;
}

// Future: Real implementation example
/*
export async function fetchRealMarketData(symbols: string[]) {
  const response = await fetch(`https://api.zerodha.com/v3/instruments?symbols=${symbols.join(',')}`, {
    headers: { 'Authorization': `token ${process.env.KITE_API_KEY}` }
  });
  return response.json();
}
*/