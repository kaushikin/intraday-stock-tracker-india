'use client';

import { useEffect, useState } from 'react';
import { getIndianMarketStatus } from '@/lib/marketHours';

export default function MarketStatus() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const refresh = () => setNow(new Date());
    refresh();
    const timer = window.setInterval(refresh, 10_000);
    return () => window.clearInterval(timer);
  }, []);
  const status = now ? getIndianMarketStatus(now) : null;
  return (
    <div
      aria-label="NSE session"
      className="flex shrink-0 flex-col items-end gap-1 text-[10px] text-slate-400 sm:text-xs"
    >
      <span className="flex items-center gap-2">
        <span
          className={`h-1.5 w-1.5 rounded-full ${status === 'OPEN' ? 'bg-emerald-400' : 'bg-zinc-500'}`}
        />
        NSE · {status ? status.replaceAll('_', ' ') : 'CHECKING'}
      </span>
      {now && (
        <span className="hidden sm:block">
          {now.toLocaleDateString('en-IN', {
            timeZone: 'Asia/Kolkata',
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          })}{' '}
          IST
        </span>
      )}
    </div>
  );
}
