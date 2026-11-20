// Normal NSE cash sessions only. Special sessions are deliberately excluded.
// Sources: NSE/CMTR/71775 and NSE/CMTR/72260; reviewed 2026-11-20.
export const CALENDAR_YEAR = 2026;
const HOLIDAYS = new Set([
  '2026-01-15',
  '2026-01-26',
  '2026-03-03',
  '2026-03-26',
  '2026-03-31',
  '2026-04-03',
  '2026-04-14',
  '2026-05-01',
  '2026-05-28',
  '2026-06-26',
  '2026-09-14',
  '2026-10-02',
  '2026-10-20',
  '2026-11-10',
  '2026-11-24',
  '2026-12-25',
]);
export type MarketSessionStatus =
  | 'WEEKEND'
  | 'HOLIDAY'
  | 'CALENDAR_UNVERIFIED'
  | 'BEFORE_OPEN'
  | 'OPEN'
  | 'AFTER_CLOSE';
export function istDateKey(date = new Date()) {
  if (!Number.isFinite(date.getTime())) return '';
  return new Date(date.getTime() + 330 * 60000).toISOString().slice(0, 10);
}
export function getISTMinutes(date = new Date()) {
  const shifted = new Date(date.getTime() + 330 * 60000);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
}
export function isWeekendIST(date = new Date()) {
  const day = new Date(date.getTime() + 330 * 60000).getUTCDay();
  return day === 0 || day === 6;
}
export function isTradingDayIST(date = new Date()) {
  const key = istDateKey(date);
  return (
    key.startsWith(String(CALENDAR_YEAR)) &&
    !isWeekendIST(date) &&
    !HOLIDAYS.has(key)
  );
}
export function getIndianMarketStatus(date = new Date()): MarketSessionStatus {
  const key = istDateKey(date);
  if (!key.startsWith(String(CALENDAR_YEAR))) return 'CALENDAR_UNVERIFIED';
  if (isWeekendIST(date)) return 'WEEKEND';
  if (HOLIDAYS.has(key)) return 'HOLIDAY';
  const minutes = getISTMinutes(date);
  if (minutes < 555) return 'BEFORE_OPEN';
  if (minutes >= 930) return 'AFTER_CLOSE';
  return 'OPEN';
}
export function isIndianMarketOpen(date = new Date()) {
  return getIndianMarketStatus(date) === 'OPEN';
}
export function isFreshSignalWindowOpenIST(date = new Date()) {
  return (
    isIndianMarketOpen(date) &&
    getISTMinutes(date) >= 585 &&
    getISTMinutes(date) < 675
  );
}
export function isMarketCloseSquareOffTimeIST(date = new Date()) {
  return isTradingDayIST(date) && getISTMinutes(date) >= 920;
}
export function minutesSinceISO(isoDate?: string) {
  const timestamp = Date.parse(isoDate || '');
  return Number.isFinite(timestamp)
    ? Math.max(0, Math.floor((Date.now() - timestamp) / 60000))
    : Infinity;
}
