// Fictional training data only. No journal, storage, provider or order functions.
import type { CandleData, PriceData } from '@/contexts/AppContext';
import {
  captureComparison,
  comparisonIssues,
  type BrokerObservation,
} from './researchEvidence';
import { DEFAULT_SCAN_CONFIG_3R, screenScanner3R } from './scanner3R';
import { estimateCashCharges } from './brokerCharges';

export const DEMO_DAY = '2026-11-23';
export const DEMO_ENTRY_TIME = '09:48:10';
export const DEMO_EXIT_TIME = '09:58:00';
export const DEMO_EXIT_BID = 197.9;
export const demoTime = (time: string) => `${DEMO_DAY}T${time}+05:30`;
export const DEMO_FIELDS = [
  ['ltp', 'Demo broker stock LTP', 'number'],
  ['quoteTime', 'Demo broker exchange quote time (IST)', 'time'],
  ['barTime', 'Demo broker candle start time (IST)', 'time'],
  ['stockOpen', 'Demo stock open', 'number'],
  ['stockHigh', 'Demo stock high', 'number'],
  ['stockLow', 'Demo stock low', 'number'],
  ['stockClose', 'Demo stock close', 'number'],
  ['stockVolume', 'Demo stock candle volume', 'number'],
  ['indexOpen', 'Demo NIFTY open', 'number'],
  ['indexHigh', 'Demo NIFTY high', 'number'],
  ['indexLow', 'Demo NIFTY low', 'number'],
  ['indexClose', 'Demo NIFTY close', 'number'],
] as const;
export type DemoField = (typeof DEMO_FIELDS)[number][0];
export type DemoReadings = Record<DemoField, string>;

export function emptyDemoReadings(): DemoReadings {
  return Object.fromEntries(
    DEMO_FIELDS.map(([key]) => [key, ''])
  ) as DemoReadings;
}
export function matchingDemoReadings(): DemoReadings {
  // Separate literal teaching readings; never claim these came from Angel One.
  return {
    ltp: '200',
    quoteTime: '09:45:07',
    barTime: '09:40:00',
    stockOpen: '199.2',
    stockHigh: '199.99',
    stockLow: '198.01',
    stockClose: '199.9',
    stockVolume: '15000',
    indexOpen: '24125',
    indexHigh: '24130',
    indexLow: '24120',
    indexClose: '24125',
  };
}

export function createONGCDemo() {
  const stock: CandleData[] = [],
    index: CandleData[] = [];
  const bar = (time: number, price: number): CandleData => ({
    time: new Date(time).toISOString(),
    open: price,
    high: price + 0.2,
    low: price - 0.2,
    close: price,
    volume: 10000,
  });
  for (const day of ['16', '17', '18', '19', '20']) {
    for (let i = 0; i < 75; i++) {
      const at = Date.parse(`2026-11-${day}T09:15:00+05:30`) + i * 300000;
      stock.push(bar(at, 185 + stock.length * 0.035));
      index.push(bar(at, 22200 + index.length * 5));
    }
  }
  for (let i = 0; i < 5; i++) {
    const at = Date.parse(demoTime('09:15:00')) + i * 300000;
    stock.push(bar(at, 198.5 + i * 0.2));
    index.push(bar(at, 24100 + i * 5));
  }
  stock.push({
    time: demoTime('09:40:00'),
    open: 199.2,
    high: 199.99,
    low: 198.01,
    close: 199.9,
    volume: 15000,
  });
  index.push({
    time: demoTime('09:40:00'),
    open: 24125,
    high: 24130,
    low: 24120,
    close: 24125,
    volume: 0,
  });
  const now = new Date(demoTime('09:45:05'));
  const quote: PriceData = {
    price: 200,
    ask: 200,
    bid: 199.98,
    askQuantity: 1000,
    change: 0,
    tickSize: 0.01,
    instrumentAsOf: DEMO_DAY,
    exchangeTime: now.toISOString(),
    lastUpdated: now.toISOString(),
  };
  const result = screenScanner3R(
    'ONGC',
    quote,
    stock,
    index,
    DEFAULT_SCAN_CONFIG_3R,
    now
  );
  if (
    result.status !== 'SHORTLIST' ||
    !result.plan?.eligible ||
    !result.setup
  )
    throw new Error(
      'The training scenario no longer qualifies under current rules. Return to Scan.'
    );
  return {
    plan: result.plan,
    snapshot: captureComparison('ONGC', quote, stock, index, now),
  };
}
export type ONGCDemo = ReturnType<typeof createONGCDemo>;

function timeInput(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value);
}
export function checkDemoReadings(
  demo: ONGCDemo,
  values: DemoReadings
): string[] {
  if (
    DEMO_FIELDS.some(
      ([key, , type]) =>
        !values[key].trim() ||
        (type === 'time'
          ? !timeInput(values[key])
          : !Number.isFinite(Number(values[key])))
    )
  )
    return [
      'Complete every demo price, candle value and IST time before checking.',
    ];
  const broker: BrokerObservation = {
    ltp: Number(values.ltp),
    quoteTime: demoTime(values.quoteTime),
    barTime: demoTime(values.barTime),
    stock: {
      open: +values.stockOpen,
      high: +values.stockHigh,
      low: +values.stockLow,
      close: +values.stockClose,
      volume: +values.stockVolume,
    },
    index: {
      open: +values.indexOpen,
      high: +values.indexHigh,
      low: +values.indexLow,
      close: +values.indexClose,
    },
  };
  try {
    return comparisonIssues(demo.snapshot, broker);
  } catch (e) {
    return [e instanceof Error ? e.message : 'Invalid demo readings.'];
  }
}

export function checkDemoFees(
  demo: ONGCDemo,
  stop: string,
  target: string
): string[] {
  const totals = [stop, target].map(Number);
  if (
    ![stop, target].every((v) => v.trim()) ||
    totals.some((v) => !Number.isFinite(v) || v < 0)
  )
    return ['Enter both full round-trip fee totals.'];
  if (
    totals[0] + 1e-8 < demo.plan.atStop.total ||
    totals[1] + 1e-8 < demo.plan.atTarget.total
  )
    return [
      'Demo fees are below the published-rate estimates. Include all charges; never lower costs to qualify.',
    ];
  if (
    Math.max(...totals) + demo.plan.taxReserve! >
    demo.plan.planningCharges + 1e-8
  )
    return [
      'Higher fees exceed this plan’s reserve. In the scanner, increase extra charges and recheck; skip if the new plan fails. This fixed exercise uses the displayed demo estimates.',
    ];
  return [];
}

export function demoExitCharges(demo: ONGCDemo) {
  return (
    Math.round(
      (estimateCashCharges(
        demo.plan.entry,
        DEMO_EXIT_BID,
        demo.plan.quantity
      ).total +
        demo.plan.taxReserve!) *
        100
    ) / 100
  );
}
export function checkDemoExit(
  demo: ONGCDemo,
  values: {
    price: string;
    time: string;
    fees: string;
    reason: string;
    notes: string;
  }
): string[] {
  const issues: string[] = [];
  if (
    !values.price.trim() ||
    Math.abs(Number(values.price) - DEMO_EXIT_BID) > 1e-8 ||
    !Number.isFinite(Number(values.price))
  )
    issues.push(
      'Use the fictional observed bid ₹197.90, not an assumed ₹198 stop fill.'
    );
  if (
    !timeInput(values.time) ||
    Date.parse(demoTime(values.time)) !==
      Date.parse(demoTime(DEMO_EXIT_TIME))
  )
    issues.push('Use the fictional observed exit time 09:58:00 IST.');
  if (
    !values.fees.trim() ||
    !Number.isFinite(Number(values.fees)) ||
    !Number.isSafeInteger(Math.round(Number(values.fees) * 100)) ||
    Number(values.fees) + 1e-8 < demoExitCharges(demo)
  )
    issues.push(
      'Include full estimated round-trip charges plus the ₹1 rounding allowance.'
    );
  if (values.reason !== 'STOP')
    issues.push(
      'This exercise reaches the stop before the time limit. Choose Stop reached.'
    );
  if (!values.notes.trim())
    issues.push('Add a demo exit source and supervision note.');
  return issues;
}
