'use client';
import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { AppProvider } from '@/contexts/AppContext';
import { AlertProvider } from '@/contexts/AlertContext';
import AlertToasts from './AlertToasts';
import BottomNav from './BottomNav';
import Disclaimer from './Disclaimer';
import MarketStatus from './MarketStatus';
import GoldPetalAlertGuard from './GoldPetalAlertGuard';

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname === '/login') return <>{children}</>;
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
      <AppProvider
        autoRefresh={
          pathname !== '/market' && !pathname.startsWith('/commodities')
        }
      >
        <AlertToasts />
        <GoldPetalAlertGuard />
        <a href="#workspace-content" className="desk-skip-link">
          Skip to content
        </a>
        <BottomNav />
        <div className="min-h-screen pb-24 lg:pb-8 lg:pl-64">
          <header className="desk-topbar">
            <div>
              <p className="text-sm font-semibold">Intraday India</p>
              <p className="mt-0.5 text-xs text-slate-400">
                Private paper-trading workspace
              </p>
            </div>
            {pathname.startsWith('/commodities') ? (
              <span className="text-xs text-teal-200">
                MCX · quotes on request
              </span>
            ) : (
              <MarketStatus />
            )}
          </header>
          <main
            id="workspace-content"
            className="mx-auto max-w-5xl px-4 py-6 sm:px-8 sm:py-9"
          >
            {children}
          </main>
          <div className="mx-auto max-w-5xl px-4 sm:px-8">
            <Disclaimer />
          </div>
        </div>
      </AppProvider>
    </AlertProvider>
  );
}
