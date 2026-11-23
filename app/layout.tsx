import PWARegister from '@/components/PWARegister';
import type { Metadata } from 'next';
import './globals.css';
import AppShell from '@/components/AppShell';

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
      <body className="font-sans antialiased">
        <PWARegister />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
