'use client';
import { useEffect, useState } from 'react';
import { invalidateChangedAlertRisk } from '@/lib/goldPetalAlertClient';
export default function GoldPetalAlertGuard() {
  const [error, setError] = useState(false);
  useEffect(() => {
    let pending = false,
      mounted = true;
    const check = async () => {
      if (pending) return;
      pending = true;
      try {
        await invalidateChangedAlertRisk();
        if (mounted) setError(false);
      } catch {
        if (mounted) setError(true);
      } finally {
        pending = false;
      }
    };
    void check();
    const events = [
      'storage',
      'focus',
      'paperBookUpdated',
      'scannerBookUpdated',
      'goldPetalBookUpdated',
    ];
    events.forEach((e) => window.addEventListener(e, check));
    const timer = setInterval(check, 10000);
    return () => {
      mounted = false;
      clearInterval(timer);
      events.forEach((e) => window.removeEventListener(e, check));
    };
  }, []);
  return error ? (
    <p role="alert" className="bg-amber-950 p-3 text-sm text-amber-200">
      Gold Petal alert risk could not be checked or updated. Open Gold Petal and
      stop alerts before other trading; earlier notifications may use an old
      allowance.
    </p>
  ) : null;
}
