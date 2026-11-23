'use client';
import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { AppProvider } from '@/contexts/AppContext';
import { AlertProvider } from '@/contexts/AlertContext';
import AlertToasts from './AlertToasts';
import BottomNav from './BottomNav';
import Disclaimer from './Disclaimer';
import MarketStatus from './MarketStatus';

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // Do not mount journal readers, persisted app state or live polling in the demo.
  if (pathname === '/market/demo') {
    return (
      <main className="mx-auto min-h-screen max-w-md px-5 py-6">
        {children}
      </main>
    );
  }
  return (
    <AlertProvider>
      <AppProvider autoRefresh={pathname !== '/market'}>
        <AlertToasts />
        <div className="min-h-screen pb-20 max-w-md mx-auto relative">
          <MarketStatus />
          <main className="px-5 pt-6">{children}</main>
          <Disclaimer />
        </div>
        <BottomNav />
      </AppProvider>
    </AlertProvider>
  );
}
