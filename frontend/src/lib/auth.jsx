import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { api, setToken, clearToken } from './api.js';

// ── Auth Context ──────────────────────────────────────────────────────────────
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.me().then(d => setUser(d.user)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    const { token, user } = await api.login({ email, password });
    setToken(token);
    setUser(user);
    return user;
  };

  const register = async (email, password, firstName, lastName) => {
    const { token, user } = await api.register({ email, password, firstName, lastName });
    setToken(token);
    setUser(user);
    return user;
  };

  const logout = () => {
    clearToken();
    setUser(null);
  };

  const refreshUser = async () => {
    const { user } = await api.me();
    setUser(user);
    return user;
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

// ── WebSocket Hook ────────────────────────────────────────────────────────────
export function useBotSocket() {
  const [botState, setBotState]   = useState(null);
  const [prices, setPrices]       = useState({});
  const [botLog, setBotLog]       = useState([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);
  const retryRef = useRef(null);

  const connect = useCallback(() => {
    const token = localStorage.getItem('nexus_token');
    if (!token) return;

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${window.location.host}/ws?token=${token}`);
    wsRef.current = ws;

    ws.onopen  = () => { setConnected(true); if (retryRef.current) { clearTimeout(retryRef.current); retryRef.current = null; } };
    ws.onclose = () => { setConnected(false); retryRef.current = setTimeout(connect, 3000); };
    ws.onerror = () => ws.close();

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.state)       setBotState(msg.state);
        if (msg.prices)      setPrices(msg.prices);
        if (msg.botLog)      setBotLog(msg.botLog);
        if (msg.type === 'LOG')          setBotLog(prev => [msg.entry, ...prev].slice(0, 200));
        if (msg.type === 'STATE_UPDATE') { if (msg.state) setBotState(msg.state); if (msg.prices) setPrices(msg.prices); }
        if (msg.type === 'PRICES')       setPrices(msg.prices);
        if (msg.type === 'INIT')         { if (msg.state) setBotState(msg.state); if (msg.prices) setPrices(msg.prices); if (msg.botLog) setBotLog(msg.botLog); }
      } catch {}
    };
  }, []);

  useEffect(() => {
    connect();
    return () => { if (wsRef.current) wsRef.current.close(); if (retryRef.current) clearTimeout(retryRef.current); };
  }, [connect]);

  return { botState, prices, botLog, connected };
}
