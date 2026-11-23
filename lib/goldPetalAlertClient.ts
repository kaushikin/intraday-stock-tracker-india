import { PAPER_BOOK_KEY, parsePaperBook } from './paperBook';
import { SCANNER_BOOK_KEY, parseScannerBook } from './scannerJournal';
import {
  PETAL_BOOK_KEY,
  parsePetalBook,
  otherPaperRisk,
  petalBudget,
  petalEquity,
} from './goldPetalPilot';
import { checkAlertRisk, PETAL_ALERT_LOCAL_KEY } from './goldPetalAlerts';
import { istDateKey } from './marketHours';
const keys = [PAPER_BOOK_KEY, SCANNER_BOOK_KEY, PETAL_BOOK_KEY];
export async function alertFingerprint() {
  const raw = JSON.stringify(keys.map((k) => localStorage.getItem(k)));
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(raw),
  );
  return [...new Uint8Array(digest)]
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('');
}
export async function readAlertRisk(feeFloor: {
  stop: number;
  target: number;
}) {
  const before = await alertFingerprint(),
    now = new Date();
  const book = parsePetalBook(localStorage.getItem(PETAL_BOOK_KEY));
  const other = otherPaperRisk(
    [
      ...parsePaperBook(localStorage.getItem(PAPER_BOOK_KEY)).positions,
      ...parseScannerBook(localStorage.getItem(SCANNER_BOOK_KEY)).positions,
    ],
    now,
  );
  const budget = petalBudget(book, other, now);
  if (before !== (await alertFingerprint()))
    throw new Error('Paper records changed. Review risk and try again.');
  return checkAlertRisk(
    {
      day: istDateKey(now),
      used: budget.used + budget.reserved,
      declared: budget.declared,
      equity: petalEquity(book),
      openCount: other.openCount + book.positions.filter((p) => !p.exit).length,
      entriesToday: book.positions.filter(
        (p) => istDateKey(new Date(p.enteredAt)) === istDateKey(now),
      ).length,
      fingerprint: before,
      feeFloor,
    },
    now,
  );
}
export async function alertAction(body: object) {
  const response = await fetch('/api/alerts/gold-petal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
    signal: AbortSignal.timeout(25000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Alert request failed.');
  return result;
}
export async function invalidateChangedAlertRisk() {
  const raw = localStorage.getItem(PETAL_ALERT_LOCAL_KEY);
  if (!raw) return;
  const saved = JSON.parse(raw);
  if (
    saved.fingerprint === (await alertFingerprint()) &&
    saved.day === istDateKey()
  )
    return;
  await alertAction({ action: 'stop', revision: saved.revision });
  // Only remove our own watch marker. Both stock books and the pilot stay intact.
  if (localStorage.getItem(PETAL_ALERT_LOCAL_KEY) === raw)
    localStorage.removeItem(PETAL_ALERT_LOCAL_KEY);
  window.dispatchEvent(new Event('goldPetalAlertChanged'));
}
