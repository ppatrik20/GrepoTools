'use client';
import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useApp } from '@/context/AppContext';
import { Shield, Lock, User, ArrowRight, AlertCircle, CheckCircle2 } from 'lucide-react';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get('redirect') || '/map';

  const { refreshUser } = useApp();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [attemptsRemaining, setAttemptsRemaining] = useState(null);

  // Attempt silent refresh on mount if user already has a valid refresh token cookie
  useEffect(() => {
    let cancelled = false;
    const trySilentRefresh = async () => {
      try {
        const res = await fetch('/api/auth/refresh', { method: 'POST' });
        if (res.ok && !cancelled) {
          const data = await res.json();
          await refreshUser();
          const teams = data.user?.teams || [];
          const isGlobalAdmin = data.user?.globalRole === 'GLOBAL_ADMIN';
          const hasVerified = isGlobalAdmin || teams.some(t => t.status === 'VERIFIED');

          if (!hasVerified && !isGlobalAdmin) {
            router.push('/verify');
          } else {
            router.push(redirectUrl.startsWith('/') ? redirectUrl : '/map');
          }
        }
      } catch {}
    };
    trySilentRefresh();
    return () => { cancelled = true; };
  }, [redirectUrl, refreshUser, router]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Please enter your Grepolis username and password');
      return;
    }

    setLoading(true);
    setError('');
    setAttemptsRemaining(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          password
        })
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Authentication failed');
        if (data.attemptsRemaining !== undefined) {
          setAttemptsRemaining(data.attemptsRemaining);
        }
        return;
      }

      // Successful login
      await refreshUser();

      const teams = data.user?.teams || [];
      const isGlobalAdmin = data.user?.globalRole === 'GLOBAL_ADMIN';
      const hasVerified = isGlobalAdmin || teams.some(t => t.status === 'VERIFIED');

      if (!hasVerified && !isGlobalAdmin) {
        router.push('/verify');
      } else {
        router.push(redirectUrl.startsWith('/') ? redirectUrl : '/map');
      }
    } catch (err) {
      setError('Connection error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md p-8 bg-slate-900/90 border border-slate-700/80 rounded-2xl shadow-2xl backdrop-blur-xl relative">
      <div className="flex flex-col items-center text-center mb-8">
        <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mb-3 shadow-inner">
          <Shield className="w-7 h-7 text-amber-400" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Command Center Login</h1>
        <p className="text-sm text-slate-400 mt-1">
          Enter your Grepolis in-game username & password
        </p>
      </div>

      {error && (
        <div className="mb-6 p-3.5 bg-red-950/50 border border-red-800/80 rounded-xl flex items-start gap-3 text-red-200 text-sm">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span>{error}</span>
            {attemptsRemaining !== null && (
              <div className="text-xs text-red-300/80 mt-1 font-mono">
                {attemptsRemaining} attempt{attemptsRemaining === 1 ? '' : 's'} remaining before 15m lockout.
              </div>
            )}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
            Grepolis Username
          </label>
          <div className="relative">
            <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              required
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. Leonidas"
              className="w-full pl-10 pr-4 py-2.5 bg-slate-950/60 border border-slate-700/80 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 text-sm transition"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
            Password
          </label>
          <div className="relative">
            <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full pl-10 pr-4 py-2.5 bg-slate-950/60 border border-slate-700/80 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 text-sm transition"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full mt-2 py-3 px-4 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold rounded-xl shadow-lg shadow-amber-500/20 transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {loading ? (
            <div className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <span>Authenticate</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>

      <div className="mt-8 pt-6 border-t border-slate-800 text-center text-xs text-slate-400">
        <p>
          New commander? You need an invitation link from your Team Administrator to activate your account.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-[85vh] flex items-center justify-center px-4 py-12">
      <Suspense fallback={<div className="text-slate-400">Loading authentication...</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
