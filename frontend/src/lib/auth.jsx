import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { api, setToken, clearToken } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.me().then(d => setUser(d.user)).catch(()=>{}).finally(()=>setLoading(false));
  }, []);

  const login    = async (e,p)     => { const {token,user}=await api.login({email:e,password:p}); setToken(token); setUser(user); return user; };
  const register = async (e,p,f,l) => { const {token,user}=await api.register({email:e,password:p,firstName:f,lastName:l}); setToken(token); setUser(user); return user; };
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
  const wsRef   = useRef(null);
  const retryRef= useRef(null);
  const { setUser } = useAuth() || {};

  const connect = useCallback(() => {
    const token = localStorage.getItem('nexus_token');
    if (!token) return;
    const proto = location.protocol==='https:'?'wss:':'ws:';
    const ws = new WebSocket(`${proto}//${location.host}/ws?token=${token}`);
    wsRef.current = ws;
    ws.onopen  = () => { setConn(true); if(retryRef.current){clearTimeout(retryRef.current);retryRef.current=null;} };
    ws.onclose = () => { setConn(false); retryRef.current=setTimeout(connect,3000); };
    ws.onerror = () => ws.close();
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.bots)       setBots(msg.bots);
        if (msg.prices)     setPrices(msg.prices);
        if (msg.strategies) setStrats(msg.strategies);
        if (msg.type==='INIT')        { if(msg.bots)setBots(msg.bots); if(msg.prices)setPrices(msg.prices); if(msg.strategies)setStrats(msg.strategies); }
        if (msg.type==='BOTS_UPDATE') { if(msg.bots)setBots(msg.bots); if(msg.prices)setPrices(msg.prices); }
        if (msg.type==='PRICES')      setPrices(msg.prices);
        if (msg.type==='USER_UPDATE' && msg.user && setUser) setUser(msg.user);
      } catch {}
    };
  }, [setUser]);

  useEffect(() => { connect(); return()=>{ wsRef.current?.close(); if(retryRef.current)clearTimeout(retryRef.current); }; }, [connect]);
  return { bots, prices, strategies, connected };
}
