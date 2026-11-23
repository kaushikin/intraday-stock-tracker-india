'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  Brain,
  Calculator,
  Eye,
  LineChart,
  Settings,
  BookOpen,
  PieChart,
  Globe2,
  MoreHorizontal,
  X,
  ArrowUpRight,
} from 'lucide-react';

const main = [
  { href: '/dashboard', label: 'Home', icon: BarChart3 },
  { href: '/market', label: 'Scan', icon: Globe2 },
  { href: '/signals', label: 'Practice', icon: LineChart },
  { href: '/trades', label: 'Trades', icon: BookOpen },
];
const tools = [
  { href: '/commodities', label: 'Commodities', icon: Globe2 },
  { href: '/watchlist', label: 'Watchlist', icon: Eye },
  { href: '/calculator', label: 'Calculator', icon: Calculator },
  { href: '/analytics', label: 'Analytics', icon: PieChart },
  { href: '/ai-summary', label: 'Discipline coach', icon: Brain },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export default function BottomNav() {
  const pathname = usePathname();
  const [more, setMore] = useState(false);
  useEffect(() => setMore(false), [pathname]);
  useEffect(() => {
    if (!more) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMore(false);
        document.getElementById('mobile-more-button')?.focus();
      }
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [more]);
  const links = (items: typeof main) =>
    items.map(({ href, label, icon: Icon }) => (
      <Link
        key={href}
        href={href}
        aria-current={pathname === href ? 'page' : undefined}
        className={`desk-nav-link ${pathname === href ? 'desk-nav-active' : ''}`}
        onClick={() => setMore(false)}
      >
        <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
        {label}
      </Link>
    ));
  return (
    <>
      <aside className="desk-sidebar hidden lg:flex">
        <Link href="/dashboard" className="flex items-center gap-3 px-3 py-4">
          <span className="desk-brand-icon">
            <LineChart className="h-5 w-5" aria-hidden="true" />
          </span>
          <span>
            <span className="block text-sm font-semibold tracking-wide">
              Intraday India
            </span>
            <span className="text-xs text-slate-400">Your research desk</span>
          </span>
        </Link>
        <nav aria-label="Main navigation" className="mt-8 space-y-1">
          <p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[.18em] text-slate-500">
            Workspace
          </p>
          {links(main)}
          <p className="px-3 pb-2 pt-7 text-[10px] font-semibold uppercase tracking-[.18em] text-slate-500">
            Tools
          </p>
          {links(tools)}
        </nav>
        <div className="mt-auto pt-8">
          <Link
            href="/market/demo"
            className="block rounded-2xl border border-slate-700/60 bg-slate-800/40 p-4 text-sm"
          >
            <span className="flex items-center justify-between font-medium">
              Practise the workflow{' '}
              <ArrowUpRight
                className="h-4 w-4 text-teal-300"
                aria-hidden="true"
              />
            </span>
            <span className="mt-2 block text-xs leading-relaxed text-slate-400">
              ONGC demo · nothing saved to your journals.
            </span>
          </Link>
        </div>
      </aside>
      <div className="desk-mobile-nav lg:hidden">
        {more && (
          <div
            id="mobile-more-tools"
            className="border-b border-slate-700 px-4 pb-4 pt-3"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold">Your tools</span>
              <button
                type="button"
                aria-label="Close tools"
                onClick={() => {
                  setMore(false);
                  document.getElementById('mobile-more-button')?.focus();
                }}
                className="rounded-lg p-3 text-slate-400"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav aria-label="More tools" className="grid grid-cols-2 gap-1">
              {links(tools)}
            </nav>
          </div>
        )}
        <nav
          aria-label="Mobile navigation"
          className="mx-auto grid max-w-xl grid-cols-5"
        >
          {main.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setMore(false)}
              aria-current={pathname === href ? 'page' : undefined}
              className={`flex min-h-[68px] flex-col items-center justify-center gap-1 text-[11px] font-medium ${pathname === href ? 'text-teal-300' : 'text-slate-400'}`}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              {label}
            </Link>
          ))}
          <button
            id="mobile-more-button"
            type="button"
            aria-expanded={more}
            aria-controls="mobile-more-tools"
            onClick={() => setMore(!more)}
            className={`flex min-h-[68px] flex-col items-center justify-center gap-1 text-[11px] font-medium ${more || tools.some((item) => item.href === pathname) ? 'text-teal-300' : 'text-slate-400'}`}
          >
            <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
            More
          </button>
        </nav>
      </div>
    </>
  );
}
