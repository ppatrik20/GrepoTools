'use client';
import React, { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { Shield, Lock, User, ArrowRight, AlertCircle, CheckCircle, Globe } from 'lucide-react';

export default function InviteRedemptionPage({ params }) {
  const router = useRouter();
  const resolvedParams = use(params);
  const token = resolvedParams.token;

  const { refreshUser } = useApp();

  const [inviteData, setInviteData] = useState(null);
  const [loadingInvite, setLoadingInvite] = useState(true);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // 1. Fetch invite details
  useEffect(() => {
    let isMounted = true;
    async function loadInvite() {
      try {
        const res = await fetch(`/api/auth/invites/${token}`);
        const data = await res.json();
        if (isMounted) {
          if (res.ok && data.valid) {
            setInviteData(data);
          } else {
            setError(data.error || 'Invalid or expired invitation token');
          }
        }
      } catch (err) {
        if (isMounted) setError('Failed to load invite: ' + err.message);
      } finally {
        if (isMounted) setLoadingInvite(false);
      }
    }

    loadInvite();
    return () => { isMounted = false; };
  }, [token]);

  // 2. Handle registration submission
  const handleRegister = async (e) => {
    e.preventDefault();
    if (!password || password.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password })
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to complete registration');
        return;
      }

      // Successful registration: session cookie is set
      await refreshUser();
      router.push('/verify');
    } catch (err) {
      setError('Network error: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingInvite) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Validating invitation...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[85vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md p-8 bg-slate-900/90 border border-slate-700/80 rounded-2xl shadow-2xl backdrop-blur-xl relative">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mb-3 shadow-inner">
            <Shield className="w-7 h-7 text-amber-400" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Team Invitation</h1>
          <p className="text-sm text-slate-400 mt-1">
            Accept team invitation and establish your password
          </p>
        </div>

        {error && (
          <div className="mb-6 p-3.5 bg-red-950/50 border border-red-800/80 rounded-xl flex items-start gap-3 text-red-200 text-sm">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {inviteData && (
          <>
            {/* Invite Details Card */}
            <div className="mb-6 p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-2 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Team:</span>
                <span className="font-bold text-amber-400">{inviteData.teamName}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">World:</span>
                <span className="font-mono text-slate-200 uppercase flex items-center gap-1.5">
                  <Globe size={13} className="text-primary" /> {inviteData.worldName} ({inviteData.worldId})
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Grepolis Player:</span>
                <span className="font-semibold text-white flex items-center gap-1.5">
                  <User size={13} className="text-accent" /> {inviteData.targetPlayerName}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Assigned Role:</span>
                <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                  inviteData.role === 'TEAM_ADMIN'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                }`}>
                  {inviteData.role === 'TEAM_ADMIN' ? 'Team Administrator' : 'Team Member'}
                </span>
              </div>
            </div>

            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Grepolis Username
                </label>
                <input
                  type="text"
                  disabled
                  value={inviteData.targetPlayerName}
                  className="w-full px-4 py-2.5 bg-slate-800/40 border border-slate-700 rounded-xl text-slate-400 cursor-not-allowed text-sm font-semibold"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  This invitation is cryptographically locked to this player name.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Set Account Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-950/60 border border-slate-700/80 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 text-sm transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat password"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-950/60 border border-slate-700/80 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 text-sm transition"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full mt-2 py-3 px-4 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold rounded-xl shadow-lg shadow-amber-500/20 transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {submitting ? (
                  <div className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Accept Invite & Register</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
