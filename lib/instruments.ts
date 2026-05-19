export type Instrument = {
  symbol: string;
  tradingSymbol: string;
  exchange: "NSE" | "BSE";
  token: string;
  name: string;
};

export const INSTRUMENTS: Record<string, Instrument> = {
  RELIANCE: {
    symbol: "RELIANCE",
    tradingSymbol: "RELIANCE-EQ",
    exchange: "NSE",
    token: "2885",
    name: "Reliance Industries",
  },
  TCS: {
    symbol: "TCS",
    tradingSymbol: "TCS-EQ",
    exchange: "NSE",
    token: "11536",
    name: "Tata Consultancy Services",
  },
  INFY: {
    symbol: "INFY",
    tradingSymbol: "INFY-EQ",
    exchange: "NSE",
    token: "1594",
    name: "Infosys",
  },
  HDFCBANK: {
    symbol: "HDFCBANK",
    tradingSymbol: "HDFCBANK-EQ",
    exchange: "NSE",
    token: "1333",
    name: "HDFC Bank",
  },
  ICICIBANK: {
    symbol: "ICICIBANK",
    tradingSymbol: "ICICIBANK-EQ",
    exchange: "NSE",
    token: "4963",
    name: "ICICI Bank",
  },
  SBIN: {
    symbol: "SBIN",
    tradingSymbol: "SBIN-EQ",
    exchange: "NSE",
    token: "3045",
    name: "State Bank of India",
  },
  AXISBANK: {
    symbol: "AXISBANK",
    tradingSymbol: "AXISBANK-EQ",
    exchange: "NSE",
    token: "5900",
    name: "Axis Bank",
  },
  ITC: {
    symbol: "ITC",
    tradingSymbol: "ITC-EQ",
    exchange: "NSE",
    token: "1660",
    name: "ITC",
  },
  BHARTIARTL: {
    symbol: "BHARTIARTL",
    tradingSymbol: "BHARTIARTL-EQ",
    exchange: "NSE",
    token: "10604",
    name: "Bharti Airtel",
  },
  LT: {
    symbol: "LT",
    tradingSymbol: "LT-EQ",
    exchange: "NSE",
    token: "11483",
    name: "Larsen & Toubro",
  },
  TATAMOTORS: {
    symbol: "TATAMOTORS",
    tradingSymbol: "TATAMOTORS-EQ",
    exchange: "NSE",
    token: "3456",
    name: "Tata Motors",
  },
  ADANIENT: {
    symbol: "ADANIENT",
    tradingSymbol: "ADANIENT-EQ",
    exchange: "NSE",
    token: "25",
    name: "Adani Enterprises",
  },
};