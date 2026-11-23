import { istDateKey } from './marketHours';
import { planPetal, PETAL_RULES } from './goldPetalPilot';
import type { PetalFeed } from './goldPetalMarket';

export const PETAL_ALERT_PATH = '/commodities/gold-petal';
export const PETAL_ALERT_LOCAL_KEY = 'gold_petal_alert_watch_v1';
export type PetalRiskSnapshot = {
  day: string;
  used: number;
  equity: number;
  declared: boolean;
  openCount: number;
  entriesToday: number;
  fingerprint: string;
  feeFloor: { stop: number; target: number };
};
export function checkAlertRisk(value: unknown, now: Date): PetalRiskSnapshot {
  const r = value as PetalRiskSnapshot;
  if (
    !r ||
    r.day !== istDateKey(now) ||
    r.declared !== true ||
    !Number.isFinite(r.used) ||
    r.used < 0 ||
    r.used >= PETAL_RULES.dailyLoss ||
    !Number.isFinite(r.equity) ||
    r.equity <= 0 ||
    r.openCount !== 0 ||
    r.entriesToday !== 0 ||
    typeof r.fingerprint !== 'string' ||
    !/^[a-f0-9]{64}$/.test(r.fingerprint) ||
    !r.feeFloor ||
    ![r.feeFloor.stop, r.feeFloor.target].every(
      (n) => Number.isFinite(n) && n >= 0,
    )
  ) {
    throw new Error(
      'Confirm today’s outside risk, close open paper positions and check the daily allowance before enabling alerts. Only one pilot entry per day is allowed.',
    );
  }
  return {
    day: r.day,
    used: Math.ceil(r.used * 100) / 100,
    equity: Math.min(r.equity, PETAL_RULES.capital),
    declared: true,
    openCount: 0,
    entriesToday: 0,
    fingerprint: r.fingerprint,
    feeFloor: { stop: r.feeFloor.stop, target: r.feeFloor.target },
  };
}
export function alertCandidate(
  feed: PetalFeed,
  risk: PetalRiskSnapshot,
  now: Date,
) {
  const checked = checkAlertRisk(risk, now);
  const result = planPetal(feed, now, checked.feeFloor);
  if (result.issues.length || !result.plan) return { issues: result.issues };
  if (result.plan.plannedRisk + checked.used > PETAL_RULES.dailyLoss)
    return {
      issues: ['Candidate exceeds the last confirmed daily allowance.'],
    };
  if (result.plan.fullFunding > checked.equity)
    return { issues: ['Candidate exceeds fully funded paper equity.'] };
  return result;
}
