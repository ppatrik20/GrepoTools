'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Castle, Flame, Compass, AlertCircle, RefreshCw,
  Clock, ShieldAlert
} from 'lucide-react';
import { TeamOperationsAdapter } from '@/lib/team/TeamOperationsAdapter';
import WonderCommandPanel from '../endgame/WonderCommandPanel';
import DominationCommandPanel from '../endgame/DominationCommandPanel';
import OlympusCommandPanel from '../endgame/OlympusCommandPanel';

export default function TeamEndgameTab({
  team,
  authority,
  activeWorldId
}) {
  const [endgameState, setEndgameState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const { isTeamAdmin, canCoordinateEndgame, canManageWonderLogistics } = authority || {};

  const teamId = team?.id;

  const loadEndgameData = useCallback(async (isManual = false) => {
    if (!teamId) return;
    try {
      if (isManual) setRefreshing(true);
      else setLoading(true);
      setError('');

      const data = await TeamOperationsAdapter.loadEndgameState({ teamId });
      setEndgameState(data);
    } catch (err) {
      console.error('Failed to load endgame state:', err);
      setError(err.message || 'Failed to load endgame state');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [teamId]);

  useEffect(() => {
    let active = true;
    if (!teamId) return;

    TeamOperationsAdapter.loadEndgameState({ teamId })
      .then(data => {
        if (active) {
          setEndgameState(data);
          setLoading(false);
        }
      })
      .catch(err => {
        if (active) {
          setError(err.message || 'Failed to load endgame state');
          setLoading(false);
        }
      });

    return () => { active = false; };
  }, [teamId]);

  const handleUpsertWonderProject = async (projectData) => {
    try {
      await TeamOperationsAdapter.updateWonderProject({
        teamId: team.id,
        projectData
      });
      await loadEndgameData(true);
    } catch (err) {
      setError(err.message || 'Failed to update wonder project');
    }
  };

  const handleAddWonderContribution = async (contributionData) => {
    try {
      await TeamOperationsAdapter.recordWonderContribution({
        teamId: team.id,
        contributionData
      });
      await loadEndgameData(true);
    } catch (err) {
      setError(err.message || 'Failed to record contribution');
    }
  };

  const handleToggleDominationIsland = async (islandData) => {
    try {
      await TeamOperationsAdapter.toggleDominationIsland({
        teamId: team.id,
        islandData
      });
      await loadEndgameData(true);
    } catch (err) {
      setError(err.message || 'Failed to update island valid status');
    }
  };

  if (loading) {
    return (
      <div className="p-12 flex flex-col items-center justify-center space-y-3">
        <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs text-slate-400 font-mono">Synchronizing Endgame War Room...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-950/30 border border-red-800 rounded-2xl flex items-center justify-between text-xs text-red-200">
        <div className="flex items-center gap-2">
          <AlertCircle size={18} className="text-red-400" />
          <span>{error}</span>
        </div>
        <button
          onClick={() => loadEndgameData(true)}
          className="px-3 py-1.5 bg-red-900/50 hover:bg-red-800 text-white rounded-lg flex items-center gap-1.5 font-bold cursor-pointer"
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          <span>Retry</span>
        </button>
      </div>
    );
  }

  const endgameType = endgameState?.endgameType || 'NONE';

  return (
    <div className="space-y-6">
      {/* Dynamic Endgame View strictly tied to active world endgameType */}
      {endgameType === 'WORLD_WONDERS' && (
        <WonderCommandPanel
          endgameState={endgameState}
          canCoordinate={canCoordinateEndgame}
          canManageLogistics={canManageWonderLogistics}
          onRefresh={() => loadEndgameData(true)}
          onUpsertProject={handleUpsertWonderProject}
          onAddContribution={handleAddWonderContribution}
        />
      )}

      {endgameType === 'DOMINATION' && (
        <DominationCommandPanel
          endgameState={endgameState}
          canCoordinate={canCoordinateEndgame}
          onRefresh={() => loadEndgameData(true)}
          onToggleIsland={handleToggleDominationIsland}
        />
      )}

      {endgameType === 'OLYMPUS' && (
        <OlympusCommandPanel
          endgameState={endgameState}
          canCoordinate={canCoordinateEndgame}
          onRefresh={() => loadEndgameData(true)}
        />
      )}

      {endgameType === 'NONE' && (
        <div className="p-8 bg-slate-900/60 border border-slate-800 rounded-2xl text-center space-y-4 max-w-xl mx-auto">
          <Clock className="w-12 h-12 text-slate-600 mx-auto" />
          <div>
            <h3 className="text-lg font-bold text-white">Pre-Era Endgame Phase</h3>
            <p className="text-xs text-slate-400 mt-1">
              World <span className="font-mono text-amber-400 uppercase">{activeWorldId}</span> has not yet reached its endgame era. The endgame phase will activate automatically as the world matures and required milestone requirements are fulfilled.
            </p>
          </div>
          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800/80 text-xs font-mono text-slate-400 flex items-center justify-around">
            <span>Status: PRE_ERA</span>
            <span>Speed: {endgameState?.endgameSpeed || 'NORMAL'}</span>
            <span>Type: Unannounced</span>
          </div>
        </div>
      )}
    </div>
  );
}
