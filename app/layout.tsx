import PWARegister from '@/components/PWARegister';
import type { Metadata } from 'next';
import './globals.css';
import { AppProvider } from '@/contexts/AppContext';
import { AlertProvider } from '@/contexts/AlertContext';
import AlertToasts from '@/components/AlertToasts';
import BottomNav from '@/components/BottomNav';
import Disclaimer from '@/components/Disclaimer';
import MarketStatus from '@/components/MarketStatus';

export const metadata: Metadata = {
  title: 'Intraday Stock Tracker India',
  description:
    'Track Indian equity stocks for intraday trading. Risk management & journaling tool.',
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="font-sans bg-zinc-950 text-white antialiased">
        <PWARegister />
        <AlertProvider>
          <AppProvider>
            <AlertToasts />

            <div className="min-h-screen pb-20 max-w-md mx-auto relative">
              <MarketStatus />

              <main className="px-5 pt-6">{children}</main>

              <Disclaimer />
            </div>

            <BottomNav />
          </AppProvider>
        </AlertProvider>
      </body>
    </html>
  );
}
