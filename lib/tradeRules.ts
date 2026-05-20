export type TradeRuleSettings = {
  dailyTarget: number;
  dailyLossLimit: number;
  maxTradesPerDay: number;
  maxLossStreak: number;
};

export type TradeRuleStatus = {
  dailyTargetHit: boolean;
  dailyLossLimitHit: boolean;
  maxTradesHit: boolean;
  maxLossStreakHit: boolean;
  shouldStopTrading: boolean;
  warnings: string[];
  dailyPL: number;
  todayTradesCount: number;
  lossStreak: number;
  rules: TradeRuleSettings;
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

export const TRADE_RULE_SETTINGS_KEY = 'trade_rule_settings_v1';

export const DEFAULT_TRADE_RULES: TradeRuleSettings = {
  dailyTarget: 500,
  dailyLossLimit: -500,
  maxTradesPerDay: 5,
  maxLossStreak: 2,
};

export function normalizeTradeRuleSettings(
  input: Partial<TradeRuleSettings>
): TradeRuleSettings {
  return {
    dailyTarget:
      Number(input.dailyTarget) > 0
        ? Number(input.dailyTarget)
        : DEFAULT_TRADE_RULES.dailyTarget,

    dailyLossLimit:
      Number(input.dailyLossLimit) < 0
        ? Number(input.dailyLossLimit)
        : DEFAULT_TRADE_RULES.dailyLossLimit,

    maxTradesPerDay:
      Number(input.maxTradesPerDay) > 0
        ? Number(input.maxTradesPerDay)
        : DEFAULT_TRADE_RULES.maxTradesPerDay,

    maxLossStreak:
      Number(input.maxLossStreak) > 0
        ? Number(input.maxLossStreak)
        : DEFAULT_TRADE_RULES.maxLossStreak,
  };
}

export function loadTradeRuleSettings(): TradeRuleSettings {
  if (typeof window === 'undefined') {
    return DEFAULT_TRADE_RULES;
  }

  try {
    const saved = localStorage.getItem(TRADE_RULE_SETTINGS_KEY);

    if (!saved) {
      return DEFAULT_TRADE_RULES;
    }

    return normalizeTradeRuleSettings(JSON.parse(saved));
  } catch {
    return DEFAULT_TRADE_RULES;
  }
}

export function saveTradeRuleSettings(settings: TradeRuleSettings) {
  if (typeof window === 'undefined') return;

  const normalized = normalizeTradeRuleSettings(settings);

  localStorage.setItem(TRADE_RULE_SETTINGS_KEY, JSON.stringify(normalized));

  window.dispatchEvent(new Event('tradeRulesUpdated'));
}

export function resetTradeRuleSettings() {
  if (typeof window === 'undefined') return;

  localStorage.setItem(
    TRADE_RULE_SETTINGS_KEY,
    JSON.stringify(DEFAULT_TRADE_RULES)
  );

  window.dispatchEvent(new Event('tradeRulesUpdated'));
}

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
  const normalizedRules = normalizeTradeRuleSettings(rules);
  const todayTrades = getTodayTrades(trades);

  const dailyPL = todayTrades.reduce((sum, trade) => {
    return sum + getTradePL(trade);
  }, 0);

  const lossStreak = calculateLossStreak(todayTrades);

  const dailyTargetHit = dailyPL >= normalizedRules.dailyTarget;
  const dailyLossLimitHit = dailyPL <= normalizedRules.dailyLossLimit;
  const maxTradesHit = todayTrades.length >= normalizedRules.maxTradesPerDay;
  const maxLossStreakHit = lossStreak >= normalizedRules.maxLossStreak;

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
      `Max trades reached: ${todayTrades.length}/${normalizedRules.maxTradesPerDay}. Avoid overtrading.`
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
    dailyPL,
    todayTradesCount: todayTrades.length,
    lossStreak,
    rules: normalizedRules,
  };
}