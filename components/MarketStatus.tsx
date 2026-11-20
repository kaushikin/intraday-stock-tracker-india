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
    <div className="flex h-11 items-center justify-center gap-2 border-b border-zinc-800 bg-black text-[10px] text-zinc-400">
      <span
        className={`h-1.5 w-1.5 rounded-full ${status === 'OPEN' ? 'bg-emerald-400' : 'bg-zinc-500'}`}
      />
      NSE SESSION: {status ? status.replaceAll('_', ' ') : 'CHECKING'}
      {now &&
        ` · ${now.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', month: 'short', day: 'numeric' })} IST`}
    </div>
  );
}
