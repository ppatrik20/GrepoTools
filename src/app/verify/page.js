'use client';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { Shield, Copy, Check, RefreshCw, ArrowRight, AlertCircle, Sparkles, CheckCircle2 } from 'lucide-react';

export default function VerifyTownPage() {
  const router = useRouter();
  const { user, refreshUser } = useApp();

  const [copied, setCopied] = useState(false);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  // Find unverified team membership or first team
  const teams = user?.teams || [];
  const unverifiedTeam = teams.find(t => t.status === 'UNVERIFIED') || teams[0];
  const isAlreadyVerified = teams.length > 0 && teams.every(t => t.status === 'VERIFIED');

  const verificationCode = unverifiedTeam?.verificationCode || 'GP-PENDING';
  const worldId = unverifiedTeam?.worldId || 'hu119';
  const playerName = unverifiedTeam?.playerName || user?.username || 'Commander';

  const handleCopyCode = () => {
    if (verificationCode) {
      navigator.clipboard.writeText(verificationCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleCheckNow = async () => {
    setChecking(true);
    setResult(null);
    setError('');

    try {
      const res = await fetch('/api/auth/verify-town', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ worldId })
      });

      const data = await res.json();
      if (res.ok && data.verified) {
        setResult({
          success: true,
          message: data.message || 'Verification successful!',
          town: data.town
        });
        await refreshUser();
      } else {
        setError(data.message || data.error || 'Verification code not found on any of your towns yet.');
      }
    } catch (err) {
      setError('Error communicating with verification service: ' + err.message);
    } finally {
      setChecking(false);
    }
  };

  if (isAlreadyVerified) {
    return (
      <div className="min-h-[85vh] flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-lg p-8 bg-slate-900/90 border border-emerald-500/40 rounded-2xl shadow-2xl backdrop-blur-xl text-center">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-emerald-400" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Account Verified</h1>
          <p className="text-slate-300 text-sm mb-6">
            Your in-game ownership of player <span className="text-emerald-400 font-semibold">{playerName}</span> on world <span className="font-mono text-white uppercase">{worldId}</span> is confirmed.
          </p>
          <button
            onClick={() => router.push('/map')}
            className="py-3 px-6 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-bold rounded-xl shadow-lg shadow-emerald-500/20 transition-all inline-flex items-center gap-2 text-sm cursor-pointer"
          >
            <span>Enter Tactical Command Center</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[85vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-xl p-8 bg-slate-900/90 border border-slate-700/80 rounded-2xl shadow-2xl backdrop-blur-xl relative">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mb-3 shadow-inner">
            <Shield className="w-7 h-7 text-amber-400" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">In-Game Town Verification</h1>
          <p className="text-sm text-slate-400 mt-1">
            Prove ownership of player <span className="text-amber-400 font-semibold">{playerName}</span> on world <span className="font-mono text-slate-200 uppercase">{worldId}</span>
          </p>
        </div>

        {/* Verification Code Box */}
        <div className="mb-6 p-5 bg-slate-950/80 border-2 border-dashed border-amber-500/40 rounded-xl text-center">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
            Your Unique Cryptographic Code
          </span>
          <div className="flex items-center justify-center gap-3 mt-2">
            <span className="text-3xl font-mono font-extrabold tracking-widest text-amber-400 selection:bg-amber-500 selection:text-slate-950">
              {verificationCode}
            </span>
            <button
              onClick={handleCopyCode}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors border border-slate-600 flex items-center gap-1.5 text-xs font-semibold"
              title="Copy code to clipboard"
            >
              {copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
              <span>{copied ? 'Copied!' : 'Copy'}</span>
            </button>
          </div>
        </div>

        {/* Steps */}
        <div className="mb-6 p-5 bg-slate-950/50 border border-slate-800 rounded-xl space-y-3 text-sm">
          <h2 className="font-semibold text-slate-200 text-xs uppercase tracking-wider">
            Verification Steps:
          </h2>
          <ol className="space-y-2.5 text-slate-300">
            <li className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
              <span>Log in to your <strong>Grepolis account</strong> on world <strong className="font-mono uppercase text-amber-300">{worldId}</strong>.</span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
              <span>Double-click any town name you own to rename it.</span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">3</span>
              <span>Append your code to the town name (e.g. <span className="font-mono text-amber-300 bg-slate-800/80 px-1.5 py-0.5 rounded text-xs">Athens [{verificationCode}]</span>).</span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">4</span>
              <span>Click <strong>Check Verification Now</strong> below. Once verified, you can rename your town back to whatever you like!</span>
            </li>
          </ol>
        </div>

        {/* Error / Result alert */}
        {error && (
          <div className="mb-6 p-3.5 bg-red-950/50 border border-red-800/80 rounded-xl flex items-start gap-3 text-red-200 text-sm animate-fade-in">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {result?.success && (
          <div className="mb-6 p-4 bg-emerald-950/50 border border-emerald-700/80 rounded-xl flex items-start gap-3 text-emerald-200 text-sm animate-fade-in">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold">{result.message}</p>
              {result.town && (
                <p className="text-xs text-emerald-300 mt-1">
                  Matched Town: &quot;{result.town.name}&quot; (ID: {result.town.id})
                </p>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        {result?.success ? (
          <button
            onClick={() => router.push('/map')}
            className="w-full py-3.5 px-4 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-bold rounded-xl shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2 text-sm cursor-pointer"
          >
            <span>Proceed to Tactical Map</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={handleCheckNow}
            disabled={checking}
            className="w-full py-3.5 px-4 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold rounded-xl shadow-lg shadow-amber-500/20 transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {checking ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                <span>Scanning World Towns...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Check Verification Now</span>
              </>
            )}
          </button>
        )}

        <div className="mt-6 text-center text-xs text-slate-500">
          Sync scanner also checks hourly automatically.
        </div>
      </div>
    </div>
  );
}
