"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Marker } from 'react-map-gl/maplibre';
import { getTransitProgress } from '@/lib/map/trajectories';
import { Ship, Clock, Feather, Shield, Anchor } from 'lucide-react';

const UNIT_ICONS = {
  bireme: { icon: Shield, color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.25)', label: 'Bireme' },
  trireme: { icon: Ship, color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.25)', label: 'Trireme' },
  colony_ship: { icon: Anchor, color: '#10b981', bg: 'rgba(16, 185, 129, 0.25)', label: 'Colony Ship' },
  manticore: { icon: Feather, color: '#ec4899', bg: 'rgba(236, 72, 153, 0.25)', label: 'Manticore' },
  harpy: { icon: Feather, color: '#a855f7', bg: 'rgba(168, 85, 247, 0.25)', label: 'Harpy' },
  pegasus: { icon: Feather, color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.25)', label: 'Pegasus' },
  transport: { icon: Ship, color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.25)', label: 'Transport' }
};

function formatSecondsToHMS(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (hrs > 0) {
    return `${hrs}h ${mins.toString().padStart(2, '0')}m ${secs.toString().padStart(2, '0')}s`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export default function AnimatedTroopLayer({ transits = [] }) {
  const [now, setNow] = useState(() => Date.now());
  const rafId = useRef(null);

  useEffect(() => {
    let active = true;
    const tick = () => {
      if (!active) return;
      setNow(Date.now());
      rafId.current = requestAnimationFrame(tick);
    };
    rafId.current = requestAnimationFrame(tick);

    return () => {
      active = false;
      if (rafId.current) cancelAnimationFrame(rafId.current);
    };
  }, []);

  if (!Array.isArray(transits) || transits.length === 0) return null;

  return (
    <>
      {transits.map((transit) => {
        const progress = getTransitProgress(transit, now);
        if (progress.isCompleted) return null;

        const [lng, lat] = progress.currentLngLat;
        const unitMeta = UNIT_ICONS[transit.unitType] || UNIT_ICONS.bireme;
        const IconComponent = unitMeta.icon;

        return (
          <Marker
            key={transit.id}
            longitude={lng}
            latitude={lat}
            anchor="center"
          >
            <div className="flex flex-col items-center pointer-events-none select-none">
              {/* Floating ETA Countdown Timer */}
              <div 
                className="mb-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold flex items-center gap-1 shadow-lg border backdrop-blur-md animate-pulse"
                style={{
                  backgroundColor: 'rgba(11, 16, 30, 0.85)',
                  color: unitMeta.color,
                  borderColor: unitMeta.color
                }}
              >
                <Clock size={10} />
                <span>{formatSecondsToHMS(progress.remainingSeconds)}</span>
              </div>

              {/* Animated Unit Sprite with Tangent Rotation */}
              <div
                className="p-2 rounded-full border shadow-xl flex items-center justify-center transition-transform"
                style={{
                  backgroundColor: unitMeta.bg,
                  borderColor: unitMeta.color,
                  transform: `rotate(${progress.rotationDegrees - 90}deg)`,
                  boxShadow: `0 0 12px ${unitMeta.color}66`
                }}
              >
                <IconComponent size={16} color={unitMeta.color} />
              </div>

              {/* Origin -> Target Badge */}
              <div 
                className="mt-1 px-1.5 py-0.2 rounded text-[9px] font-medium bg-slate-900/90 text-slate-300 border border-slate-700/80 shadow"
              >
                {transit.originName || 'Origin'} → {transit.targetName || 'Target'}
              </div>
            </div>
          </Marker>
        );
      })}
    </>
  );
}
