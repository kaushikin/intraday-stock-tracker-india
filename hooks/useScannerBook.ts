'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  emptyScannerBook,
  parseScannerBook,
  SCANNER_BOOK_KEY,
  studySymbols,
  type ScannerBook,
  mergeScannerBackup,
} from '@/lib/scannerJournal';
import {
  emptyPaperBook,
  parsePaperBook,
  PAPER_BOOK_KEY,
  type PaperBook,
} from '@/lib/paperBook';

export function readStudy() {
  const study = parsePaperBook(localStorage.getItem(PAPER_BOOK_KEY));
  const raw = localStorage.getItem('watchlist');
  const watch =
    raw === null ? ['RELIANCE', 'TCS', 'HDFCBANK'] : JSON.parse(raw);
  if (!Array.isArray(watch) || watch.some((s) => typeof s !== 'string'))
    throw new Error(
      'Study watchlist is unreadable. Repair it before scanner entries.'
    );
  return { study, symbols: studySymbols(study, watch) };
}
export function useScannerBook() {
  const [book, setBook] = useState(emptyScannerBook),
    [study, setStudy] = useState(emptyPaperBook),
    [symbols, setSymbols] = useState<string[]>([]),
    [ready, setReady] = useState(false),
    [studyReady, setStudyReady] = useState(false),
    [error, setError] = useState(''),
    [studyError, setStudyError] = useState('');
  const refresh = useCallback(() => {
    try {
      setBook(parseScannerBook(localStorage.getItem(SCANNER_BOOK_KEY)));
      setReady(true);
      setError('');
    } catch (e) {
      setReady(false);
      setError(e instanceof Error ? e.message : 'Scanner storage unavailable.');
    }
    try {
      const value = readStudy();
      setStudy(value.study);
      setSymbols(value.symbols);
      setStudyReady(true);
      setStudyError('');
    } catch (e) {
      setStudyReady(false);
      setStudyError(
        e instanceof Error ? e.message : 'Study storage unavailable.'
      );
    }
  }, []);
  useEffect(() => {
    refresh();
    for (const name of [
      'storage',
      'paperBookUpdated',
      'scannerBookUpdated',
      'focus',
    ])
      window.addEventListener(name, refresh);
    return () => {
      for (const name of [
        'storage',
        'paperBookUpdated',
        'scannerBookUpdated',
        'focus',
      ])
        window.removeEventListener(name, refresh);
    };
  }, [refresh]);
  const transact = useCallback(
    async (
      change: (
        book: ScannerBook,
        study: PaperBook,
        symbols: string[]
      ) => ScannerBook,
      needsStudy = false
    ) => {
      if (!navigator.locks)
        throw new Error(
          'Use a current secure browser with Web Locks to save paper records safely.'
        );
      // Both writers acquire the study lock first. Study contents are never written here.
      await navigator.locks.request(PAPER_BOOK_KEY, () =>
        navigator.locks.request(SCANNER_BOOK_KEY, async () => {
          const latest = parseScannerBook(
            localStorage.getItem(SCANNER_BOOK_KEY)
          );
          const other = needsStudy
            ? readStudy()
            : { study: emptyPaperBook(), symbols: [] };
          const next = change(latest, other.study, other.symbols);
          const raw = JSON.stringify(next);
          parseScannerBook(raw);
          localStorage.setItem(SCANNER_BOOK_KEY, raw);
          window.dispatchEvent(new Event('scannerBookUpdated'));
        })
      );
    },
    []
  );
  const restore = useCallback(
    async (incoming: ScannerBook, replaceUnreadable: boolean) => {
      if (!navigator.locks)
        throw new Error('Use a current secure browser to restore safely.');
      await navigator.locks.request(PAPER_BOOK_KEY, () =>
        navigator.locks.request(SCANNER_BOOK_KEY, async () => {
          const raw = localStorage.getItem(SCANNER_BOOK_KEY);
          let current;
          try {
            current = parseScannerBook(raw);
          } catch {
            if (!replaceUnreadable)
              throw new Error(
                'Export the unreadable raw backup and explicitly confirm its replacement first.'
              );
            current = emptyScannerBook();
          }
          const next = mergeScannerBackup(current, incoming, readStudy().study);
          localStorage.setItem(SCANNER_BOOK_KEY, JSON.stringify(next));
          window.dispatchEvent(new Event('scannerBookUpdated'));
        })
      );
    },
    []
  );
  return {
    book,
    study,
    symbols,
    ready,
    studyReady,
    error,
    studyError,
    transact,
    restore,
  };
}
