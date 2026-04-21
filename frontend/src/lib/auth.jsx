import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { api, setToken, clearToken } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]     = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.me().then(d => setUser(d.user)).catch(()=>{}).finally(()=>setLoading(false));
  }, []);

  const login    = async (e,p)     => { const {token,user}=await api.login({email:e,password:p}); setToken(token); setUser(user); return user; };
  const register = async (e,p,f,l,ref) => { const {token,user}=await api.register({email:e,password:p,firstName:f,lastName:l,referralCode:ref||null}); setToken(token); setUser(user); return user; };
  const logout   = ()              => { clearToken(); setUser(null); };
  const refreshUser = async ()     => { try{const{user}=await api.me();setUser(user);return user;}catch{} };

  return <AuthContext.Provider value={{user,loading,login,register,logout,refreshUser,setUser}}>{children}</AuthContext.Provider>;
}
export const useAuth = () => useContext(AuthContext);

export function useBotSocket() {
  const [bots, setBots]         = useState([]);
  const [prices, setPrices]     = useState({});
  const [strategies, setStrats] = useState([]);
  const [connected, setConn]    = useState(false);
  const wsRef      = useRef(null);
  const retryRef   = useRef(null);
  const retryCount = useRef(0);
  const destroyed  = useRef(false);
  const { setUser } = useAuth() || {};

  const connect = useCallback(() => {
    if (destroyed.current) return;
    const token = localStorage.getItem('nexus_token');
    if (!token) return;

    // Clean up existing connection
    if (wsRef.current && wsRef.current.readyState < 2) {
      wsRef.current.onclose = null; // prevent reconnect trigger
      wsRef.current.close();
    }

    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    let ws;
    try {
      ws = new WebSocket(`${proto}//${location.host}/ws?token=${token}`);
    } catch { return; }

    wsRef.current = ws;

    ws.onopen = () => {
      if (destroyed.current) { ws.close(); return; }
      setConn(true);
      retryCount.current = 0; // reset backoff on successful connect
      if (retryRef.current) { clearTimeout(retryRef.current); retryRef.current = null; }
    };

    ws.onclose = (e) => {
      if (destroyed.current) return;
      setConn(false);
      // Exponential backoff: 1s, 2s, 4s, 8s, 16s, max 30s
      const delay = Math.min(1000 * Math.pow(2, retryCount.current), 30000);
      retryCount.current = Math.min(retryCount.current + 1, 5);
      retryRef.current = setTimeout(connect, delay);
    };

    ws.onerror = () => { ws.close(); };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'INIT') {
          if (msg.bots)       setBots(msg.bots);
          if (msg.prices)     setPrices(msg.prices);
          if (msg.strategies) setStrats(msg.strategies);
        }
        if (msg.type === 'BOTS_UPDATE') {
          if (msg.bots)   setBots(msg.bots);
          if (msg.prices) setPrices(msg.prices);
        }
        if (msg.type === 'PRICES')      setPrices(p => ({...p, ...msg.prices}));
        if (msg.type === 'BOT_LOG')     {} // handled by dashboard via bots update
        if (msg.type === 'USER_UPDATE' && msg.user && setUser) setUser(msg.user);
        // Legacy format support
        if (msg.bots && !msg.type)       setBots(msg.bots);
        if (msg.prices && !msg.type)     setPrices(msg.prices);
        if (msg.strategies && !msg.type) setStrats(msg.strategies);
      } catch {}
    };
  }, [setUser]);

  useEffect(() => {
    destroyed.current = false;
    connect();
    // Ping every 25s to keep connection alive (Railway times out idle WS at 30s)
    const ping = setInterval(() => {
      if (wsRef.current?.readyState === 1) {
        try { wsRef.current.send(JSON.stringify({ type:'ping' })); } catch {}
      }
    }, 25000);
    return () => {
      destroyed.current = true;
      clearInterval(ping);
      if (retryRef.current) clearTimeout(retryRef.current);
      if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); }
    };
  }, [connect]);

  return { bots, prices, strategies, connected };
}
