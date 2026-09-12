'use client';
import React, { useState, useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import { 
  Globe, Plus, RefreshCw, Trash2, CheckCircle2, AlertTriangle, 
  Settings, Database, Server, Clock, Edit3, Lock, Unlock, X, ShieldCheck, Users
} from 'lucide-react';

export default function AdminWorldCenter() {
  const { worlds, activeWorldId, switchWorld, refreshWorlds } = useApp();
  const [loading, setLoading] = useState(false);
  const [syncingWorldId, setSyncingWorldId] = useState(null);
  const [syncResults, setSyncResults] = useState({});
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Admin Authentication State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [authError, setAuthError] = useState('');
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Add World form states
  const [formOpen, setFormOpen] = useState(false);
  const [newWorldId, setNewWorldId] = useState('');
  const [newWorldName, setNewWorldName] = useState('');
  const [newWorldServer, setNewWorldServer] = useState('');
  const [newWorldSpeed, setNewWorldSpeed] = useState(3.0);
  const [newWorldUnitSpeed, setNewWorldUnitSpeed] = useState(3.0);
  const [newWorldType, setNewWorldType] = useState('siege');
  const [syncImmediately, setSyncImmediately] = useState(true);

  // Edit World states
  const [editingWorld, setEditingWorld] = useState(null);
  const [editName, setEditName] = useState('');
  const [editServer, setEditServer] = useState('');
  const [editSpeed, setEditSpeed] = useState(3.0);
  const [editUnitSpeed, setEditUnitSpeed] = useState(3.0);
  const [editType, setEditType] = useState('siege');
  const [editActive, setEditActive] = useState(true);

  // Team creation states
  const [createTeamOpen, setCreateTeamOpen] = useState(false);
  const [newTeamWorldId, setNewTeamWorldId] = useState('');
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamDesc, setNewTeamDesc] = useState('');
  const [creatingTeam, setCreatingTeam] = useState(false);

  // Check existing session authentication
  useEffect(() => {
    try {
      const savedAuth = sessionStorage.getItem('grepo_admin_auth');
      if (savedAuth === 'true') {
        setIsAuthenticated(true);
      }
    } catch (e) {}
    setCheckingAuth(false);
  }, []);

  const handleAdminLogin = async (e) => {
    e.preventDefault();
    setAuthError('');
    try {
      const res = await fetch('/api/admin/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPasswordInput })
      });
      const data = await res.json();
      if (data.success) {
        setIsAuthenticated(true);
        try {
          sessionStorage.setItem('grepo_admin_auth', 'true');
        } catch (e) {}
      } else {
        setAuthError(data.error || 'Invalid passcode');
      }
    } catch (err) {
      setAuthError(err.message);
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    try {
      sessionStorage.removeItem('grepo_admin_auth');
    } catch (e) {}
  };

  const handleAddWorld = async (e) => {
    e.preventDefault();
    if (!newWorldId.trim()) return;

    setLoading(true);
    setError('');
    setSuccessMessage('');

    const cleanId = newWorldId.trim().toLowerCase();
    const cleanServer = newWorldServer.trim().toLowerCase() || cleanId;
    const cleanName = newWorldName.trim() || `${cleanId.toUpperCase()} (${cleanServer})`;

    try {
      const res = await fetch('/api/worlds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: cleanId,
          name: cleanName,
          server: cleanServer,
          speed: parseFloat(newWorldSpeed) || 1.0,
          unitSpeed: parseFloat(newWorldUnitSpeed) || 1.0,
          worldType: newWorldType,
          isActive: true
        })
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to add world');

      setSuccessMessage(`World ${cleanId.toUpperCase()} created successfully!`);
      await refreshWorlds();
      setFormOpen(false);

      // Reset form
      setNewWorldId('');
      setNewWorldName('');
      setNewWorldServer('');

      if (syncImmediately) {
        handleSyncWorld(cleanId);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const openEditModal = (world) => {
    setEditingWorld(world);
    setEditName(world.name);
    setEditServer(world.server);
    setEditSpeed(world.speed);
    setEditUnitSpeed(world.unitSpeed || world.speed);
    setEditType(world.worldType || 'siege');
    setEditActive(world.isActive !== false);
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingWorld) return;

    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/worlds', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingWorld.id,
          name: editName,
          server: editServer,
          speed: parseFloat(editSpeed) || 1.0,
          unitSpeed: parseFloat(editUnitSpeed) || 1.0,
          worldType: editType,
          isActive: editActive
        })
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to update world');

      setSuccessMessage(`World ${editingWorld.id.toUpperCase()} updated successfully!`);
      await refreshWorlds();
      setEditingWorld(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSyncWorld = async (worldId) => {
    setSyncingWorldId(worldId);
    setError('');
    try {
      const res = await fetch(`/api/world/sync?world=${worldId}&force=true`);
      const data = await res.json();
      if (data.success) {
        setSyncResults(prev => ({
          ...prev,
          [worldId]: data
        }));
        await refreshWorlds();
      } else {
        setError(`Sync error for ${worldId}: ${data.error}`);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSyncingWorldId(null);
    }
  };

  const handleDeleteWorld = async (worldId) => {
    if (!window.confirm(`Are you sure you want to delete world ${worldId.toUpperCase()} and all its synced player/alliance/town data?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/worlds?id=${worldId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setSuccessMessage(`World ${worldId.toUpperCase()} deleted.`);
        await refreshWorlds();
      } else {
        setError(data.error || 'Failed to delete world');
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCreateTeam = async (e) => {
    e.preventDefault();
    if (!newTeamName.trim() || !newTeamWorldId.trim()) return;
    setCreatingTeam(true);
    setError('');
    setSuccessMessage('');
    try {
      const res = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          worldId: newTeamWorldId.trim().toLowerCase(),
          name: newTeamName.trim(),
          description: newTeamDesc.trim() || undefined
        })
      });
      const data = await res.json();
      if (res.ok) {
        setSuccessMessage(`Team "${data.team.name}" successfully created on world ${data.team.worldId.toUpperCase()}!`);
        setCreateTeamOpen(false);
        setNewTeamName('');
        setNewTeamDesc('');
      } else {
        setError(data.error || 'Failed to create team');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setCreatingTeam(false);
    }
  };

  if (checkingAuth) {
    return (
      <div className="py-20 text-center text-slate-500 text-sm animate-pulse">
        Verifying security clearance...
      </div>
    );
  }

  // Security Gate if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="max-w-md mx-auto py-16">
        <div className="glass-panel p-8 bg-slate-900/95 border border-slate-700/80 rounded-2xl shadow-2xl text-center">
          <div className="w-12 h-12 bg-primary/20 text-primary border border-primary/40 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Lock size={24} />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Admin Gate</h1>
          <p className="text-xs text-slate-400 mt-1 mb-6">
            Authentication required to modify game worlds, triggers, and server configurations.
          </p>

          <form onSubmit={handleAdminLogin} className="flex flex-col gap-3">
            <input
              type="password"
              placeholder="Enter Admin Passcode..."
              value={adminPasswordInput}
              onChange={e => setAdminPasswordInput(e.target.value)}
              className="input-field text-center font-mono tracking-widest text-base py-2.5"
              autoFocus
              required
            />

            {authError && (
              <div className="text-xs text-rose-400 font-mono bg-rose-500/10 p-2 rounded-lg border border-rose-500/20">
                {authError}
              </div>
            )}

            <button type="submit" className="btn btn-primary mt-2 py-2.5">
              <Unlock size={16} /> Unlock Management Console
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-800 pb-5 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded flex items-center gap-1">
              <ShieldCheck size={13} /> Admin Mode Authenticated
            </span>
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
            <Globe size={28} className="text-primary" /> World Management Center
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Configure game worlds, edit server parameters, and trigger database synchronization.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setNewTeamWorldId(worlds[0]?.id || 'hu119');
              setCreateTeamOpen(true);
            }}
            className="btn bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold flex items-center gap-1.5"
          >
            <Users size={16} /> Create Team
          </button>

          <button
            onClick={() => setFormOpen(!formOpen)}
            className="btn btn-primary"
          >
            <Plus size={16} /> {formOpen ? 'Cancel' : 'Add New World'}
          </button>

          <button
            onClick={handleLogout}
            className="btn bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs py-2 px-3"
            title="Lock Admin Session"
          >
            <Lock size={14} /> Lock
          </button>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="bg-rose-500/10 border border-rose-500/40 text-rose-300 p-4 rounded-xl flex items-center gap-3 animate-fade-in text-sm">
          <AlertTriangle size={18} className="text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMessage && (
        <div className="bg-emerald-500/10 border border-emerald-500/40 text-emerald-300 p-4 rounded-xl flex items-center gap-3 animate-fade-in text-sm">
          <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Add World Form Drawer */}
      {formOpen && (
        <div className="glass-panel p-6 bg-slate-900/95 border border-primary/40 rounded-2xl animate-fade-in">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <Server size={20} className="text-primary" /> Register New Game World
          </h2>
          <form onSubmit={handleAddWorld} className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                World ID / Code <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. en143, hu120, de125"
                value={newWorldId}
                onChange={(e) => {
                  setNewWorldId(e.target.value);
                  if (!newWorldServer) setNewWorldServer(e.target.value.toLowerCase());
                }}
                className="input-field"
                required
              />
              <span className="text-xs text-slate-500 mt-1 block">The subdomain prefix used on Grepolis.</span>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                Display Name
              </label>
              <input
                type="text"
                placeholder="e.g. EN143 (Tithorea)"
                value={newWorldName}
                onChange={(e) => setNewWorldName(e.target.value)}
                className="input-field"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                Server Host Prefix
              </label>
              <input
                type="text"
                placeholder="e.g. en143"
                value={newWorldServer}
                onChange={(e) => setNewWorldServer(e.target.value)}
                className="input-field"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                World Game Speed
              </label>
              <input
                type="number"
                step="0.5"
                min="1"
                max="10"
                value={newWorldSpeed}
                onChange={(e) => setNewWorldSpeed(e.target.value)}
                className="input-field"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                Unit Speed Multiplier
              </label>
              <input
                type="number"
                step="0.5"
                min="1"
                max="10"
                value={newWorldUnitSpeed}
                onChange={(e) => setNewWorldUnitSpeed(e.target.value)}
                className="input-field"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                Game Conquest Mode
              </label>
              <select
                value={newWorldType}
                onChange={(e) => setNewWorldType(e.target.value)}
                className="input-field"
              >
                <option value="siege">Siege (Old Conquest)</option>
                <option value="revolt">Revolt (New Conquest)</option>
              </select>
            </div>

            <div className="md:col-span-3 flex items-center justify-between pt-2 border-t border-slate-800">
              <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={syncImmediately}
                  onChange={(e) => setSyncImmediately(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-950 text-primary w-4 h-4"
                />
                <span>Download and synchronize world data immediately after creating</span>
              </label>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="btn bg-slate-800 hover:bg-slate-700 text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="btn btn-primary"
                >
                  {loading ? 'Registering...' : 'Save World'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Configured Worlds List */}
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <Database size={18} className="text-primary" /> Configured Game Worlds ({worlds.length})
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {worlds.map(w => {
            const isCurrentActive = w.id.toLowerCase() === activeWorldId.toLowerCase();
            const isSyncing = syncingWorldId === w.id;
            const recentSyncResult = syncResults[w.id];

            return (
              <div 
                key={w.id} 
                className={`glass-panel p-5 relative transition-all rounded-2xl flex flex-col justify-between ${
                  isCurrentActive ? 'border-primary/50 bg-slate-900/90 shadow-lg' : 'bg-slate-900/60'
                }`}
              >
                <div>
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-lg text-white">{w.name}</span>
                        {isCurrentActive && (
                          <span className="text-xs bg-primary/20 text-primary border border-primary/30 font-semibold px-2 py-0.5 rounded-full">
                            Active
                          </span>
                        )}
                        {!w.isActive && (
                          <span className="text-xs bg-rose-500/20 text-rose-300 border border-rose-500/30 font-semibold px-2 py-0.5 rounded-full">
                            Disabled
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 font-mono mt-0.5">
                        Server: {w.server}.grepolis.com • {w.worldType?.toUpperCase()}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => openEditModal(w)}
                        className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                        title="Edit world settings"
                      >
                        <Edit3 size={15} />
                      </button>
                      <button
                        onClick={() => handleSyncWorld(w.id)}
                        disabled={isSyncing}
                        className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                        title="Force sync world data"
                      >
                        <RefreshCw size={15} className={isSyncing ? "animate-spin text-primary" : ""} />
                      </button>
                      <button
                        onClick={() => handleDeleteWorld(w.id)}
                        className="p-2 rounded-lg bg-slate-800 hover:bg-rose-950/80 text-slate-400 hover:text-rose-400 transition-colors"
                        title="Delete world"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  {/* World Metrics */}
                  <div className="grid grid-cols-4 gap-2 my-4 bg-slate-950/60 p-3 rounded-xl border border-slate-800 text-center">
                    <div>
                      <div className="text-xs text-slate-400">Speed</div>
                      <div className="font-mono font-bold text-sm text-primary">{w.speed}x</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400">Towns</div>
                      <div className="font-mono font-bold text-sm text-white">{w.counts?.towns?.toLocaleString() || 0}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400">Players</div>
                      <div className="font-mono font-bold text-sm text-white">{w.counts?.players?.toLocaleString() || 0}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400">Alliances</div>
                      <div className="font-mono font-bold text-sm text-white">{w.counts?.alliances?.toLocaleString() || 0}</div>
                    </div>
                  </div>
                </div>

                {/* Footer status and Switch action */}
                <div className="border-t border-slate-800/80 pt-3 flex items-center justify-between text-xs">
                  <div className="text-slate-400 flex items-center gap-1.5">
                    <Clock size={13} />
                    <span>
                      {w.lastSync 
                        ? `Last sync: ${new Date(w.lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` 
                        : 'Never synced'}
                    </span>
                  </div>

                  {!isCurrentActive ? (
                    <button
                      onClick={() => switchWorld(w.id)}
                      className="text-primary hover:underline font-semibold flex items-center gap-1"
                    >
                      Switch to this World →
                    </button>
                  ) : (
                    <span className="text-slate-500 italic">Currently Loaded</span>
                  )}
                </div>

                {/* Sync Delta Summary */}
                {recentSyncResult && (
                  <div className="mt-3 p-2.5 bg-emerald-950/40 border border-emerald-800/50 rounded-lg text-xs text-emerald-300 animate-fade-in">
                    Sync finished: +{recentSyncResult.stats?.players} players, +{recentSyncResult.stats?.towns} towns.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Edit World Modal */}
      {editingWorld && (
        <div 
          className="grepo-modal-backdrop animate-fade-in"
          onClick={(e) => { if (e.target === e.currentTarget) setEditingWorld(null); }}
        >
          <div 
            className="glass-panel w-full max-w-lg p-6 bg-slate-900/95 border border-slate-700/80 rounded-2xl shadow-2xl relative my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4 border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Edit3 size={18} className="text-primary" /> Edit World: {editingWorld.id.toUpperCase()}
                </h3>
                <p className="text-xs text-slate-400">Update server attributes and speeds</p>
              </div>
              <button 
                onClick={() => setEditingWorld(null)}
                className="p-1 rounded-lg bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="text-xs font-semibold text-slate-300 block mb-1">Display Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="input-field"
                  required
                />
              </div>

              <div className="sm:col-span-2">
                <label className="text-xs font-semibold text-slate-300 block mb-1">Server Host Prefix</label>
                <input
                  type="text"
                  value={editServer}
                  onChange={e => setEditServer(e.target.value)}
                  className="input-field"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">World Game Speed</label>
                <input
                  type="number"
                  step="0.5"
                  min="1"
                  max="10"
                  value={editSpeed}
                  onChange={e => setEditSpeed(e.target.value)}
                  className="input-field"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Unit Speed Multiplier</label>
                <input
                  type="number"
                  step="0.5"
                  min="1"
                  max="10"
                  value={editUnitSpeed}
                  onChange={e => setEditUnitSpeed(e.target.value)}
                  className="input-field"
                  required
                />
              </div>

              <div className="sm:col-span-2">
                <label className="text-xs font-semibold text-slate-300 block mb-1">Game Conquest Mode</label>
                <select
                  value={editType}
                  onChange={e => setEditType(e.target.value)}
                  className="input-field"
                >
                  <option value="siege">Siege (Old Conquest)</option>
                  <option value="revolt">Revolt (New Conquest)</option>
                </select>
              </div>

              <div className="sm:col-span-2 flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="editActiveCheckbox"
                  checked={editActive}
                  onChange={e => setEditActive(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-950 text-primary w-4 h-4"
                />
                <label htmlFor="editActiveCheckbox" className="text-sm text-slate-300 cursor-pointer">
                  World is active and available in world switcher
                </label>
              </div>

              <div className="sm:col-span-2 flex justify-end gap-2 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingWorld(null)}
                  className="btn bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs border border-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="btn btn-primary text-xs"
                >
                  {loading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Team Modal */}
      {createTeamOpen && (
        <div 
          className="grepo-modal-backdrop animate-fade-in"
          onClick={(e) => { if (e.target === e.currentTarget) setCreateTeamOpen(false); }}
        >
          <div 
            className="glass-panel w-full max-w-md p-6 bg-slate-900/95 border border-amber-500/40 rounded-2xl shadow-2xl relative my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4 border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Users size={18} className="text-amber-400" /> Create Tactical Team
              </h3>
              <button 
                onClick={() => setCreateTeamOpen(false)}
                className="p-1 rounded-lg bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                title="Close"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateTeam} className="flex flex-col gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  World Target <span className="text-rose-400">*</span>
                </label>
                <select
                  value={newTeamWorldId}
                  onChange={(e) => setNewTeamWorldId(e.target.value)}
                  className="input-field"
                  required
                >
                  {worlds.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.id.toUpperCase()})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Team Name <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Aegis Vanguard, Spartan Core"
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  className="input-field"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Description (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Tactical focus, alliance association, or squad notes..."
                  value={newTeamDesc}
                  onChange={(e) => setNewTeamDesc(e.target.value)}
                  className="input-field resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setCreateTeamOpen(false)}
                  className="btn bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs border border-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingTeam}
                  className="btn bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs"
                >
                  {creatingTeam ? 'Creating...' : 'Create Team'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
