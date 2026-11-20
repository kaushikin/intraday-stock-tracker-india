'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  emptyPaperBook,
  PAPER_BOOK_KEY,
  PaperBook,
  parsePaperBook,
} from '@/lib/paperBook';

export function usePaperBook() {
  const [book, setBook] = useState<PaperBook>(emptyPaperBook),
    [ready, setReady] = useState(false),
    [error, setError] = useState('');
  const refresh = useCallback(() => {
    try {
      setBook(parsePaperBook(localStorage.getItem(PAPER_BOOK_KEY)));
      setReady(true);
      setError('');
    } catch (e) {
      setReady(false);
      setError(e instanceof Error ? e.message : 'Journal unavailable.');
    }
  }, []);
  useEffect(() => {
    refresh();
    window.addEventListener('storage', refresh);
    window.addEventListener('paperBookUpdated', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('paperBookUpdated', refresh);
    };
  }, [refresh]);
  const transact = useCallback(
    async (change: (book: PaperBook) => PaperBook) => {
      if (!navigator.locks)
        throw new Error(
          'This browser cannot safely coordinate journal writes. Use a current browser in a secure context.'
        );
      await navigator.locks.request(PAPER_BOOK_KEY, async () => {
        const latest = parsePaperBook(localStorage.getItem(PAPER_BOOK_KEY));
        const changed = change(latest);
        // Validate before replacing anything. A quota/write failure leaves the prior journal intact.
        const serialized = JSON.stringify(changed);
        parsePaperBook(serialized);
        localStorage.setItem(PAPER_BOOK_KEY, serialized);
        setBook(changed);
        setReady(true);
        setError('');
        window.dispatchEvent(new Event('paperBookUpdated'));
      });
    },
    []
  );
  return { book, ready, error, transact };
}
