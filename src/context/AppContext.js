'use client';
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';

const AppContext = createContext(null);

export function AppContextProvider({ children }) {
  const [worlds, setWorlds] = useState([]);
  const [activeWorldId, setActiveWorldId] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('grepo_active_world');
        if (saved && saved.trim()) return saved.trim().toLowerCase();
      } catch (e) {}
    }
    return 'hu119';
  });
  const [activePlayerName, setActivePlayerName] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('grepo_active_player');
        if (saved && saved.trim()) return saved.trim();
      } catch (e) {}
    }
    return '';
  });
  const [activePlayer, setActivePlayer] = useState(null);
  const [masterData, setMasterData] = useState(null);
  const [loadingWorlds, setLoadingWorlds] = useState(true);
  const [loadingPlayer, setLoadingPlayer] = useState(true);

  const [user, setUser] = useState(null);
  const [userLoading, setUserLoading] = useState(true);

  const activeWorldIdRef = useRef(activeWorldId);
  useEffect(() => {
    activeWorldIdRef.current = activeWorldId;
  }, [activeWorldId]);

  // Auth: Fetch current user session with automatic token refresh on 401
  const refreshUser = useCallback(async () => {
    try {
      setUserLoading(true);
      let res = await fetch('/api/auth/me');

      // If access token is expired, attempt silent Refresh Token Rotation (RTR)
      if (res.status === 401) {
        try {
          const refreshRes = await fetch('/api/auth/refresh', { method: 'POST' });
          if (refreshRes.ok) {
            res = await fetch('/api/auth/me');
          }
        } catch {}
      }

      if (res.ok) {
        const data = await res.json();
        setUser(data.user || null);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setUserLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  // Proactive periodic token refresh: rotates access token every 10 minutes while user is active
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/auth/refresh', { method: 'POST' });
        if (res.ok) {
          const data = await res.json();
          if (data.user) setUser(data.user);
        }
      } catch {}
    }, 10 * 60 * 1000); // 10 minutes (access token lifespan is 15 minutes)

    return () => clearInterval(interval);
  }, [user]);

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {}
    setUser(null);
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  }, []);


  // 2. Fetch Worlds list (does not recreate on activeWorldId change)
  const refreshWorlds = useCallback(async () => {
    try {
      setLoadingWorlds(true);
      const res = await fetch('/api/worlds');
      const data = await res.json();
      if (data.success && Array.isArray(data.worlds)) {
        setWorlds(data.worlds);
        
        // If current activeWorldId doesn't exist in the worlds list and worlds list is non-empty, default to first world
        const currentId = activeWorldIdRef.current;
        const exists = data.worlds.some(w => w.id.toLowerCase() === currentId.toLowerCase());
        if (!exists && data.worlds.length > 0) {
          const firstId = data.worlds[0].id.toLowerCase();
          setActiveWorldId(firstId);
          activeWorldIdRef.current = firstId;
          try {
            localStorage.setItem('grepo_active_world', firstId);
          } catch (e) {}
        }
      }
    } catch (e) {
      console.error("Failed to load worlds:", e);
    } finally {
      setLoadingWorlds(false);
    }
  }, []);

  useEffect(() => {
    refreshWorlds();
  }, [refreshWorlds]);

  // 3. Compute Active World dynamically without state setter loops
  const activeWorld = useMemo(() => {
    if (!worlds || worlds.length === 0) {
      return { 
        id: activeWorldId, 
        name: activeWorldId.toUpperCase(), 
        server: activeWorldId,
        speed: 1.0, 
        unitSpeed: 1.0, 
        worldType: 'siege', 
        isActive: true 
      };
    }
    return worlds.find(w => w.id.toLowerCase() === activeWorldId.toLowerCase()) || worlds[0];
  }, [worlds, activeWorldId]);

  // 4. Switch World
  const switchWorld = useCallback((worldId) => {
    if (!worldId) return;
    const cleanId = worldId.trim().toLowerCase();
    setActiveWorldId(cleanId);
    activeWorldIdRef.current = cleanId;
    try {
      localStorage.setItem('grepo_active_world', cleanId);
    } catch (e) {}
  }, []);

  // 5. Fetch Master Player Data when activeWorldId or activePlayerName changes
  const refreshActivePlayer = useCallback(async () => {
    if (!activeWorldId) return;
    try {
      setLoadingPlayer(true);
      const params = new URLSearchParams({ world: activeWorldId });
      if (activePlayerName) params.append('playerName', activePlayerName);

      const res = await fetch(`/api/master-player?${params.toString()}`);
      const data = await res.json();

      if (data && data.player) {
        setActivePlayer(data.player);
        if (data.player.name.toLowerCase() !== activePlayerName.toLowerCase()) {
          setActivePlayerName(data.player.name);
        }
        setMasterData(data);
      } else {
        setActivePlayer(null);
        setMasterData(null);
      }
    } catch (e) {
      console.error("Failed to fetch active player:", e);
      setActivePlayer(null);
    } finally {
      setLoadingPlayer(false);
    }
  }, [activeWorldId, activePlayerName]);

  useEffect(() => {
    refreshActivePlayer();
  }, [refreshActivePlayer]);

  // 6. Switch Player
  const switchPlayer = useCallback((name) => {
    const cleanName = name ? name.trim() : '';
    setActivePlayerName(cleanName);
    try {
      localStorage.setItem('grepo_active_player', cleanName);
    } catch (e) {}
  }, []);

  const providerValue = useMemo(() => ({
    worlds,
    activeWorldId,
    activeWorld,
    switchWorld,
    activePlayerName,
    activePlayer,
    masterData,
    switchPlayer,
    refreshWorlds,
    refreshActivePlayer,
    loadingWorlds,
    loadingPlayer,
    user,
    userLoading,
    refreshUser,
    logout
  }), [
    worlds,
    activeWorldId,
    activeWorld,
    switchWorld,
    activePlayerName,
    activePlayer,
    masterData,
    switchPlayer,
    refreshWorlds,
    refreshActivePlayer,
    loadingWorlds,
    loadingPlayer,
    user,
    userLoading,
    refreshUser,
    logout
  ]);

  return (
    <AppContext.Provider value={providerValue}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useApp must be used within an AppContextProvider");
  }
  return context;
}
