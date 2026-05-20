'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  Brain,
  Eye,
  LineChart,
  Settings,
  BookOpen,
  PieChart,
  Globe2,
} from 'lucide-react';

const navItems = [
  {
    href: '/dashboard',
    label: 'Home',
    icon: BarChart3,
  },
  {
    href: '/watchlist',
    label: 'Watch',
    icon: Eye,
  },
  {
    href: '/market',
    label: 'Market',
    icon: Globe2,
  },
  {
    href: '/signals',
    label: 'Signals',
    icon: LineChart,
  },
  {
    href: '/trades',
    label: 'Trades',
    icon: BookOpen,
  },
  {
    href: '/analytics',
    label: 'Stats',
    icon: PieChart,
  },
  {
    href: '/ai-summary',
    label: 'AI',
    icon: Brain,
  },
  {
    href: '/settings',
    label: 'Settings',
    icon: Settings,
  },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-800 bg-[#090a0f]/95 backdrop-blur">
      <div className="mx-auto grid max-w-5xl grid-cols-8">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center gap-1 px-1 py-3 text-[9px] sm:text-xs ${
                active ? 'text-emerald-400' : 'text-slate-500'
              }`}
            >
              <Icon className="h-5 w-5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}