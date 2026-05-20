export type TradeRuleStatus = {
  dailyTargetHit: boolean;
  dailyLossLimitHit: boolean;
  maxTradesHit: boolean;
  maxLossStreakHit: boolean;
  shouldStopTrading: boolean;
  warnings: string[];
};

type TradeLike = {
  date?: string;
  timestamp?: string;
  side: 'BUY' | 'SELL';
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  brokerage: number;
};

export const DEFAULT_TRADE_RULES = {
  dailyTarget: 500,
  dailyLossLimit: -500,
  maxTradesPerDay: 5,
  maxLossStreak: 2,
};

export function getTradePL(trade: TradeLike) {
  const gross =
    trade.side === 'BUY'
      ? (trade.exitPrice - trade.entryPrice) * trade.quantity
      : (trade.entryPrice - trade.exitPrice) * trade.quantity;

  return gross - trade.brokerage;
}

function isToday(dateString?: string) {
  if (!dateString) return false;

  const date = new Date(dateString);
  const today = new Date();

  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

export function getTodayTrades<T extends TradeLike>(trades: T[]) {
  return trades.filter((trade) => {
    if (trade.timestamp) return isToday(trade.timestamp);
    if (trade.date) return isToday(trade.date);
    return false;
  });
}

export function calculateLossStreak<T extends TradeLike>(trades: T[]) {
  const sorted = [...trades].sort((a, b) => {
    const aTime = new Date(a.timestamp || a.date || '').getTime();
    const bTime = new Date(b.timestamp || b.date || '').getTime();

    return bTime - aTime;
  });

  let streak = 0;

  for (const trade of sorted) {
    const pnl = getTradePL(trade);

    if (pnl < 0) {
      streak += 1;
    } else {
      break;
    }
  }

  return streak;
}

export function evaluateTradeRules<T extends TradeLike>(
  trades: T[],
  rules = DEFAULT_TRADE_RULES
): TradeRuleStatus {
  const todayTrades = getTodayTrades(trades);

  const dailyPL = todayTrades.reduce((sum, trade) => {
    return sum + getTradePL(trade);
  }, 0);

  const lossStreak = calculateLossStreak(todayTrades);

  const dailyTargetHit = dailyPL >= rules.dailyTarget;
  const dailyLossLimitHit = dailyPL <= rules.dailyLossLimit;
  const maxTradesHit = todayTrades.length >= rules.maxTradesPerDay;
  const maxLossStreakHit = lossStreak >= rules.maxLossStreak;

  const warnings: string[] = [];

  if (dailyTargetHit) {
    warnings.push(
      `Daily target reached: ₹${dailyPL.toFixed(
        2
      )}. Consider stopping for the day.`
    );
  }

  if (dailyLossLimitHit) {
    warnings.push(
      `Daily loss limit hit: ₹${dailyPL.toFixed(
        2
      )}. Stop trading for the day.`
    );
  }

  if (maxTradesHit) {
    warnings.push(
      `Max trades reached: ${todayTrades.length}/${rules.maxTradesPerDay}. Avoid overtrading.`
    );
  }

  if (maxLossStreakHit) {
    warnings.push(
      `Max loss streak hit: ${lossStreak} losses in a row. Take a break.`
    );
  }

  return {
    dailyTargetHit,
    dailyLossLimitHit,
    maxTradesHit,
    maxLossStreakHit,
    shouldStopTrading:
      dailyTargetHit || dailyLossLimitHit || maxTradesHit || maxLossStreakHit,
    warnings,
  };
}