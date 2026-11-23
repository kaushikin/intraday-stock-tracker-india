'use client';

import { useState } from 'react';
import { Lock } from 'lucide-react';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
        body: JSON.stringify({ password }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(data.error || 'Login failed');
        setLoading(false);
        return;
      }

      // Hard redirect so auth cookie is definitely picked up
      window.location.href = '/dashboard';
    } catch {
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="scanner-hero w-full max-w-sm">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-400">
          <Lock className="h-7 w-7" />
        </div>

        <h1 className="text-center text-2xl font-semibold">
          Welcome to Intraday India
        </h1>

        <p className="mt-2 text-center text-sm text-zinc-400">
          Enter your app password to open Intraday Stock Tracker.
        </p>

        <form onSubmit={handleLogin} className="mt-6 space-y-4">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter password"
            aria-label="App password"
            autoComplete="current-password"
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
            autoFocus
          />

          {error && (
            <div className="rounded-2xl border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="scanner-primary w-full"
          >
            {loading ? 'Checking...' : 'Unlock App'}
          </button>
        </form>
      </div>
    </main>
  );
}
