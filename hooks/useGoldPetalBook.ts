'use client';
import { useCallback, useEffect, useState } from 'react';
import { PAPER_BOOK_KEY, parsePaperBook } from '@/lib/paperBook';
import { SCANNER_BOOK_KEY, parseScannerBook } from '@/lib/scannerJournal';
import {
  PETAL_BOOK_KEY,
  emptyPetalBook,
  parsePetalBook,
  otherPaperRisk,
  type PetalBook,
  type OtherPaperRisk,
} from '@/lib/goldPetalPilot';
function readOther() {
  return otherPaperRisk(
    [
      ...parsePaperBook(localStorage.getItem(PAPER_BOOK_KEY)).positions,
      ...parseScannerBook(localStorage.getItem(SCANNER_BOOK_KEY)).positions,
    ],
    new Date()
  );
}
export function useGoldPetalBook() {
  const [book, setBook] = useState(emptyPetalBook),
    [other, setOther] = useState<OtherPaperRisk>({
      loss: 0,
      openRisk: 0,
      openCount: 0,
    }),
    [ready, setReady] = useState(false),
    [otherReady, setOtherReady] = useState(false),
    [error, setError] = useState('');
  const refresh = useCallback(() => {
    const errors: string[] = [];
    try {
      setBook(parsePetalBook(localStorage.getItem(PETAL_BOOK_KEY)));
      setReady(true);
    } catch (e) {
      setReady(false);
      errors.push(
        e instanceof Error ? e.message : 'Pilot storage unavailable.'
      );
    }
    try {
      setOther(readOther());
      setOtherReady(true);
    } catch {
      setOtherReady(false);
      errors.push(
        'Stock paper journals cannot be read. Gold Petal entries are blocked; existing pilot exits remain available.'
      );
    }
    setError(errors.join(' '));
  }, []);
  useEffect(() => {
    refresh();
    const events = [
      'storage',
      'focus',
      'paperBookUpdated',
      'scannerBookUpdated',
      'goldPetalBookUpdated',
    ];
    events.forEach((e) => window.addEventListener(e, refresh));
    const timer = setInterval(refresh, 30000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, refresh));
      clearInterval(timer);
    };
  }, [refresh]);
  const transact = useCallback(
    async (
      change: (book: PetalBook, other: OtherPaperRisk) => PetalBook,
      needsOther = false
    ) => {
      if (!navigator.locks)
        throw new Error(
          'Use a current secure browser to save the pilot safely.'
        );
      // Same lock order as existing stock writers; both stock books are read-only here.
      await navigator.locks.request(PAPER_BOOK_KEY, () =>
        navigator.locks.request(SCANNER_BOOK_KEY, () =>
          navigator.locks.request(PETAL_BOOK_KEY, () => {
            const latest = parsePetalBook(localStorage.getItem(PETAL_BOOK_KEY));
            const result = change(
              latest,
              needsOther ? readOther() : { loss: 0, openRisk: 0, openCount: 0 }
            );
            const raw = JSON.stringify(result);
            parsePetalBook(raw);
            localStorage.setItem(PETAL_BOOK_KEY, raw);
            window.dispatchEvent(new Event('goldPetalBookUpdated'));
          })
        )
      );
    },
    []
  );
  return { book, other, ready, otherReady, error, transact, refresh };
}
