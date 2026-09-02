"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  projectMinimapClickToWorld, 
  calculateViewportFrustum, 
  projectWorldToMinimap 
} from '@/lib/map/minimapMath';
import { Compass, ChevronDown, ChevronUp, Maximize2, Crosshair } from 'lucide-react';

const CANVAS_SIZE = 220;

export default function MinimapRadar({
  towns = [],
  alliances = [],
  viewState = { longitude: 0, latitude: 0, zoom: 6 },
  onNavigate,
  className = ""
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const canvasRef = useRef(null);

  const frustum = calculateViewportFrustum(viewState);

  // Render Minimap Radar Canvas
  const drawMinimap = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 1. Background Void
    ctx.fillStyle = '#070b14';
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // 2. Tactical Ocean Grid (10x10)
    ctx.strokeStyle = 'rgba(30, 41, 59, 0.6)';
    ctx.lineWidth = 1;
    const step = CANVAS_SIZE / 10;
    for (let i = 0; i <= 10; i++) {
      const pos = i * step;
      ctx.beginPath();
      ctx.moveTo(pos, 0);
      ctx.lineTo(pos, CANVAS_SIZE);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, pos);
      ctx.lineTo(CANVAS_SIZE, pos);
      ctx.stroke();
    }

    // 3. Playable World Bounds (center 500,500, radius 250)
    const center = CANVAS_SIZE / 2;
    const radius = (250 / 1000) * CANVAS_SIZE;
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.15)';
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.stroke();

    // 4. Alliance Town Points
    if (Array.isArray(towns) && towns.length > 0) {
      // Build alliance color map
      const colorMap = new Map();
      (alliances || []).forEach(a => {
        if (a && a.name) colorMap.set(a.name, a.color || '#3b82f6');
      });

      towns.forEach(t => {
        const raw = t.properties || t;
        const x = Number(raw.islandX ?? raw.x ?? 500);
        const y = Number(raw.islandY ?? raw.y ?? 500);
        const { mx, my } = projectWorldToMinimap(x, y, CANVAS_SIZE, CANVAS_SIZE);

        const aName = raw.alliance;
        ctx.fillStyle = (aName && colorMap.get(aName)) || (raw.townColor || '#38bdf8');
        ctx.beginPath();
        ctx.arc(mx, my, 1.2, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // 5. Active Viewport Camera Frustum Rectangle
    const { mx: fX, my: fY } = projectWorldToMinimap(frustum.minX, frustum.minY, CANVAS_SIZE, CANVAS_SIZE);
    const { mx: fMaxX, my: fMaxY } = projectWorldToMinimap(frustum.maxX, frustum.maxY, CANVAS_SIZE, CANVAS_SIZE);
    const fW = Math.max(8, Math.abs(fMaxX - fX));
    const fH = Math.max(8, Math.abs(fMaxY - fY));

    // Semi-transparent frustum box
    ctx.fillStyle = 'rgba(56, 189, 248, 0.18)';
    ctx.fillRect(fX, fY, fW, fH);

    // Glowing border
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(fX, fY, fW, fH);

    // Center crosshair in frustum
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(fX + fW / 2, fY + fH / 2, 2, 0, Math.PI * 2);
    ctx.fill();
  }, [towns, alliances, frustum]);

  useEffect(() => {
    drawMinimap();
  }, [drawMinimap]);

  const handlePointerNavigate = (e) => {
    const canvas = canvasRef.current;
    if (!canvas || !onNavigate) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const nav = projectMinimapClickToWorld(clickX, clickY, CANVAS_SIZE, CANVAS_SIZE);
    onNavigate({ lng: nav.lng, lat: nav.lat });
  };

  const handleMouseDown = (e) => {
    setIsDragging(true);
    handlePointerNavigate(e);
  };

  const handleMouseMove = (e) => {
    if (isDragging) {
      handlePointerNavigate(e);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mouseup', handleMouseUp);
      return () => window.removeEventListener('mouseup', handleMouseUp);
    }
  }, [isDragging]);

  // Collapsed Pill HUD
  if (isCollapsed) {
    return (
      <div 
        className={`glass-panel flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900/90 border border-slate-700/80 shadow-xl cursor-pointer hover:bg-slate-800/90 transition-all ${className}`}
        onClick={() => setIsCollapsed(false)}
        title="Expand Global World Minimap Radar"
      >
        <div className="p-1.5 rounded-lg bg-sky-500/20 text-sky-400 border border-sky-500/30">
          <Compass size={16} />
        </div>
        <div className="flex flex-col">
          <span className="text-xs font-bold text-white leading-tight">World Minimap</span>
          <span className="text-[10px] text-sky-300 font-mono">1000×1000 Radar</span>
        </div>
        <ChevronUp size={14} className="text-slate-400 ml-1" />
      </div>
    );
  }

  return (
    <div 
      className={`glass-panel flex flex-col gap-2 p-3 rounded-2xl bg-slate-900/95 border border-slate-700/80 shadow-2xl backdrop-blur-xl animate-fade-in select-none ${className}`}
      style={{ width: CANVAS_SIZE + 24 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-1.5 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded-lg bg-sky-500/20 text-sky-400 border border-sky-500/30">
            <Compass size={14} />
          </div>
          <div>
            <h3 className="text-xs font-bold text-white tracking-wide uppercase">World Radar</h3>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsCollapsed(true)}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Collapse Minimap"
            aria-label="Collapse Minimap"
          >
            <ChevronDown size={15} />
          </button>
        </div>
      </div>

      {/* Interactive Minimap Radar Canvas */}
      <div className="relative rounded-xl overflow-hidden border border-slate-800 bg-slate-950 shadow-inner cursor-crosshair">
        <canvas
          ref={canvasRef}
          width={CANVAS_SIZE}
          height={CANVAS_SIZE}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          className="block w-full h-full"
        />
        {/* Ocean Corner Legend */}
        <div className="absolute top-1 left-1.5 text-[8px] font-mono text-slate-500 pointer-events-none">
          O00
        </div>
        <div className="absolute top-1 right-1.5 text-[8px] font-mono text-slate-500 pointer-events-none">
          O90
        </div>
        <div className="absolute bottom-1 left-1.5 text-[8px] font-mono text-slate-500 pointer-events-none">
          O09
        </div>
        <div className="absolute bottom-1 right-1.5 text-[8px] font-mono text-slate-500 pointer-events-none">
          O99
        </div>
      </div>

      {/* Footer Info */}
      <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
        <span>Click to Pan Camera</span>
        <span className="text-sky-300">Zoom: {viewState.zoom?.toFixed(1) || '6.0'}</span>
      </div>
    </div>
  );
}
