export type MarketSessionStatus =
  | 'WEEKEND'
  | 'BEFORE_OPEN'
  | 'OPEN'
  | 'AFTER_CLOSE';

function getISTParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const map: Record<string, string> = {};

  for (const part of parts) {
    if (part.type !== 'literal') {
      map[part.type] = part.value;
    }
  }

  return map;
}

export function getISTMinutes(date = new Date()) {
  const parts = getISTParts(date);

  const hour = Number(parts.hour || 0);
  const minute = Number(parts.minute || 0);

  return hour * 60 + minute;
}

export function isWeekendIST(date = new Date()) {
  const weekday = getISTParts(date).weekday;

  return weekday === 'Sat' || weekday === 'Sun';
}

export function getIndianMarketStatus(date = new Date()): MarketSessionStatus {
  if (isWeekendIST(date)) {
    return 'WEEKEND';
  }

  const minutes = getISTMinutes(date);

  const marketOpen = 9 * 60 + 15;
  const marketClose = 15 * 60 + 30;

  if (minutes < marketOpen) {
    return 'BEFORE_OPEN';
  }

  if (minutes > marketClose) {
    return 'AFTER_CLOSE';
  }

  return 'OPEN';
}

export function isIndianMarketOpen(date = new Date()) {
  return getIndianMarketStatus(date) === 'OPEN';
}

export function isFreshSignalWindowOpenIST(date = new Date()) {
  if (isWeekendIST(date)) {
    return false;
  }

  const minutes = getISTMinutes(date);

  const start = 9 * 60 + 30;
  const end = 14 * 60 + 45;

  return minutes >= start && minutes <= end;
}

export function isMarketCloseSquareOffTimeIST(date = new Date()) {
  if (isWeekendIST(date)) {
    return false;
  }

  const minutes = getISTMinutes(date);
  const squareOff = 15 * 60 + 20;

  return minutes >= squareOff;
}

export function minutesSinceISO(isoDate?: string) {
  if (!isoDate) {
    return 0;
  }

  const created = new Date(isoDate).getTime();

  if (!Number.isFinite(created)) {
    return 0;
  }

  return Math.floor((Date.now() - created) / 60000);
}
