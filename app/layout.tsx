import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AppProvider } from '@/contexts/AppContext';
import BottomNav from '@/components/BottomNav';
import Disclaimer from '@/components/Disclaimer';

const inter = Inter({ 
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter'
});

export const metadata: Metadata = {
  title: 'Intraday Stock Tracker India',
  description: 'Track Indian equity stocks for intraday trading. Risk management & journaling tool.',
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
      <body className={`${inter.variable} font-sans bg-zinc-950 text-white antialiased`}>
        <AppProvider>
          <div className="min-h-screen pb-20 max-w-md mx-auto relative">
            {/* Top Status Bar */}
            <div className="h-11 bg-black flex items-center justify-center text-[10px] text-zinc-400 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                MARKET OPEN • NSE • {new Date().toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' })}
              </div>
            </div>

            <main className="px-5 pt-6">
              {children}
            </main>

            <Disclaimer />
          </div>
          
          <BottomNav />
        </AppProvider>
      </body>
    </html>
  );
}