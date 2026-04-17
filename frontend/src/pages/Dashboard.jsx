import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, BarChart, Bar } from 'recharts';
import { useAuth, useBotSocket } from '../lib/auth.jsx';
import { api } from '../lib/api.js';

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  bg:     '#030508',
  card:   '#07090f',
  card2:  '#0a0d15',
  border: '#ffffff0d',
  border2:'#ffffff15',
  green:  '#00e5a0',
  red:    '#ef4444',
  amber:  '#f59e0b',
  blue:   '#3b82f6',
  purple: '#a78bfa',
  cyan:   '#22d3ee',
  text:   '#f1f5f9',
  muted:  '#64748b',
  subtle: '#1e293b',
};

const COIN_COLORS = { BTC:'#f7931a', ETH:'#627eea', SOL:'#9945ff', XRP:'#00aae4', AVAX:'#e84142', LINK:'#2a5ada', ADA:'#3cc8c8', DOGE:'#c2a633' };
const STRAT_C = { MOMENTUM:C.blue, MEAN_REVERSION:C.cyan, BREAKOUT:C.amber, EMA_CROSS:C.purple, TAKE_PROFIT:C.green, STOP_LOSS:C.red, TRAIL_STOP:C.amber, TREND_REVERSAL:C.amber, HOLD:C.muted };
const LOG_C = { CYCLE:'#334155', MARKET:'#1e293b', AI:C.purple, SIGNAL:C.green, REASONING:C.text, TRADE:C.green, PROFIT:C.green, LOSS:C.red, POSITION:C.amber, HOLD:C.muted, WARN:C.amber, ERROR:C.red, SYSTEM:C.blue, INFO:C.muted };

const fUSD = n => { if(n==null||isNaN(n))return'$—'; const a=Math.abs(n); if(a>=1e6)return`$${(n/1e6).toFixed(2)}M`; if(a>=1000)return`$${n.toLocaleString('en-US',{maximumFractionDigits:2})}`; if(a>=1)return`$${n.toFixed(2)}`; return`$${n.toFixed(4)}`; };
const fPct  = n => n==null?'—':`${n>=0?'+':''}${n.toFixed(2)}%`;
const fTime = iso => !iso?'—':new Date(iso).toLocaleTimeString('en-US',{hour12:false,hour:'2-digit',minute:'2-digit'});
const fAge  = iso => { if(!iso)return'—'; const d=(Date.now()-new Date(iso))/1000; if(d<60)return`${Math.round(d)}s`; if(d<3600)return`${Math.round(d/60)}m`; return`${Math.round(d/3600)}h`; };

function useIsMobile() {
  const [m, setM] = useState(window.innerWidth < 768);
  useEffect(() => { const h=()=>setM(window.innerWidth<768); window.addEventListener('resize',h); return()=>window.removeEventListener('resize',h); }, []);
  return m;
}

// ── Sub-components ─────────────────────────────────────────────────────────────
function Badge({ color, children, sm }) {
  return <span style={{ background: color + '18', color, border: `1px solid ${color}28`, padding: sm ? '2px 6px' : '3px 10px', borderRadius: 5, fontSize: sm ? 9 : 11, fontWeight: 700, letterSpacing: '0.04em', display: 'inline-block' }}>{children}</span>;
}

function StatCard({ label, value, sub, color, glow }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${glow ? color + '30' : C.border}`, borderRadius: 12, padding: '16px 18px', boxShadow: glow ? `0 0 20px ${color}12` : 'none', minWidth: 0 }}>
      <div style={{ color: C.muted, fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', marginBottom: 6, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: color || C.text, fontFamily: "'JetBrains Mono', monospace", letterSpacing: '-0.02em', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ color: C.muted, fontSize: 11, marginTop: 5 }}>{sub}</div>}
    </div>
  );
}

function Section({ title, right, children }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#050710' }}>
        <span style={{ color: C.muted, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{title}</span>
        {right && <span style={{ color: C.muted, fontSize: 10 }}>{right}</span>}
      </div>
      {children}
    </div>
  );
}

function Btn({ onClick, children, variant = 'ghost', color, size = 'md', disabled, fullWidth }) {
  const bg = variant === 'solid' ? (color || C.green) : variant === 'outline' ? 'transparent' : 'transparent';
  const fg = variant === 'solid' ? '#000' : (color || C.muted);
  const border = variant === 'outline' ? `1px solid ${color || C.border2}` : variant === 'ghost' ? `1px solid ${C.border}` : 'none';
  const pad = size === 'sm' ? '5px 12px' : size === 'lg' ? '12px 24px' : '8px 16px';
  return (
    <button onClick={onClick} disabled={disabled} style={{ background: bg, color: fg, border, padding: pad, borderRadius: 8, cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontSize: size === 'sm' ? 11 : 13, fontWeight: 700, opacity: disabled ? 0.4 : 1, width: fullWidth ? '100%' : 'auto', transition: 'all 0.15s', whiteSpace: 'nowrap' }}>{children}</button>
  );
}

// ── Settings modal ─────────────────────────────────────────────────────────────
function SettingsModal({ user, onClose, onSave }) {
  const [form, setForm] = useState({
    maxTradeUSD:    user.maxTradeUSD    || 20,
    stopLossPct:    Math.round((user.stopLossPct    || 0.05) * 100),
    takeProfitPct:  Math.round((user.takeProfitPct  || 0.08) * 100),
    maxDrawdownPct: Math.round((user.maxDrawdownPct || 0.20) * 100),
    startingBalance: user.startingBalance || 100,
    botMode:        user.botMode || 'PAPER',
    leverageEnabled: user.leverageEnabled || false,
    maxLeverage:    user.maxLeverage || 3,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function save() {
    setSaving(true); setErr('');
    try {
      await onSave({
        maxTradeUSD:    Number(form.maxTradeUSD),
        stopLossPct:    Number(form.stopLossPct) / 100,
        takeProfitPct:  Number(form.takeProfitPct) / 100,
        maxDrawdownPct: Number(form.maxDrawdownPct) / 100,
        startingBalance: Number(form.startingBalance),
        botMode:        form.botMode,
        leverageEnabled: form.leverageEnabled,
        maxLeverage:    Number(form.maxLeverage),
      });
      onClose();
    } catch(e) { setErr(e.message); }
    setSaving(false);
  }

  const inp = { background: '#030508', border: `1px solid ${C.border2}`, borderRadius: 8, padding: '10px 12px', color: C.text, fontFamily: "'JetBrains Mono', monospace", fontSize: 14, width: '100%', outline: 'none', boxSizing: 'border-box' };
  const lbl = { color: C.muted, fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', display: 'block', marginBottom: 6, textTransform: 'uppercase' };

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000000cc', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: C.card2, border: `1px solid ${C.border2}`, borderRadius: 16, padding: '28px', width: '100%', maxWidth: 500, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
          <div style={{ color: C.text, fontSize: 18, fontWeight: 800 }}>Bot Settings</div>
          <button onClick={onClose} style={{ color: C.muted, background: 'none', border: 'none', cursor: 'pointer', fontSize: 20 }}>×</button>
        </div>
        {err && <div style={{ color: C.red, fontSize: 12, marginBottom: 16, padding: '10px 12px', background: '#ef444415', borderRadius: 8 }}>{err}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          {[['Max Trade ($)', 'maxTradeUSD', 5, 10000], ['Starting Balance ($)', 'startingBalance', 1, 1000000]].map(([l, k, mn, mx]) => (
            <div key={k}><label style={lbl}>{l}</label><input type="number" min={mn} max={mx} value={form[k]} onChange={e=>set(k,e.target.value)} style={inp}/></div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
          {[['Stop Loss (%)', 'stopLossPct', 0.5, 50], ['Take Profit (%)', 'takeProfitPct', 1, 100], ['Max Drawdown (%)', 'maxDrawdownPct', 5, 50]].map(([l, k, mn, mx]) => (
            <div key={k}><label style={lbl}>{l}</label><input type="number" min={mn} max={mx} step="0.5" value={form[k]} onChange={e=>set(k,e.target.value)} style={inp}/></div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
          <div>
            <label style={lbl}>Trading Mode</label>
            <select value={form.botMode} onChange={e=>set('botMode',e.target.value)} style={inp}>
              <option value="PAPER">Paper (Safe)</option>
              <option value="LIVE">Live (Real Money)</option>
            </select>
          </div>
          <div>
            <label style={lbl}>Max Leverage</label>
            <select value={form.maxLeverage} onChange={e=>set('maxLeverage',e.target.value)} style={inp}>
              {[2,3,5,10].map(n=><option key={n} value={n}>{n}x</option>)}
            </select>
          </div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, cursor: 'pointer' }}>
          <input type="checkbox" checked={form.leverageEnabled} onChange={e=>set('leverageEnabled',e.target.checked)} style={{ accentColor: C.purple, width: 16, height: 16 }} />
          <span style={{ color: C.muted, fontSize: 13 }}>Enable leverage / perpetuals (high risk — confidence ≥ 8/10 required)</span>
        </label>
        <div style={{ padding: '12px', background: '#f59e0b10', border: '1px solid #f59e0b20', borderRadius: 8, marginBottom: 20 }}>
          <p style={{ color: '#d97706', fontSize: 12, lineHeight: 1.6 }}>⚠ Changes take effect on the next trading cycle. Stopping and restarting the bot applies settings immediately.</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Btn onClick={save} disabled={saving} variant="solid" color={C.green} size="lg" fullWidth>{saving ? 'Saving...' : 'Save Settings'}</Btn>
          <Btn onClick={onClose} size="lg">Cancel</Btn>
        </div>
      </div>
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { user, logout, refreshUser, setUser } = useAuth();
  const { botState, prices, botLog, connected }  = useBotSocket();
  const nav = useNavigate();
  const isMobile = useIsMobile();
  const [tab, setTab]             = useState('overview');
  const [showSettings, setSettings] = useState(false);
  const [showExchanges, setExchanges] = useState(false);
  const [equityCurve, setEquity]  = useState([]);
  const [actionPending, setPending] = useState(false);
  const [billing, setBilling]     = useState(null);
  const [exchanges, setExchangeList] = useState({});
  const [exForm, setExForm]       = useState({ exchange:'coinbase', apiKey:'', apiSecret:'', label:'', mode:'PAPER' });
  const [exErr, setExErr]         = useState('');
  const [exLoading, setExLoading] = useState(false);
  const logRef = useRef(null);

  useEffect(() => {
    if (!user) { nav('/login'); return; }
    api.billingStatus().then(setBilling).catch(() => {});
    api.exchanges().then(d => setExchangeList(d.exchanges || {})).catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!botState?.trades) return;
    let val = botState.startingBalance || 100;
    const curve = [{ i: 0, value: val }];
    [...botState.trades].reverse().forEach((t, i) => {
      if (t.type === 'SELL' && t.pnl != null) { val += t.pnl; curve.push({ i: i + 1, value: +val.toFixed(4) }); }
    });
    setEquity(curve);
  }, [botState?.trades?.length]);

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [botLog?.length]);

  const control = useCallback(async (action) => {
    setPending(true);
    try {
      if (action === 'start')  await api.botStart();
      if (action === 'stop')   await api.botStop();
      if (action === 'reset')  await api.botReset();
      await refreshUser();
    } catch (e) { alert(e.message); }
    setPending(false);
  }, [refreshUser]);

  const saveSettings = useCallback(async (data) => {
    const updated = await api.botSettings(data);
    setUser(updated.user);
    return updated;
  }, [setUser]);

  const connectExchange = async () => {
    setExErr(''); setExLoading(true);
    try { await api.connectEx(exForm); const d = await api.exchanges(); setExchangeList(d.exchanges || {}); setExForm({ exchange:'coinbase', apiKey:'', apiSecret:'', label:'', mode:'PAPER' }); }
    catch (e) { setExErr(e.message); }
    setExLoading(false);
  };

  if (!user) return null;
  const bs = botState || {};
  const portfolio = bs.portfolio || {};
  const trades = bs.trades || [];

  let totalValue = bs.balance || 0;
  for (const [s, p] of Object.entries(portfolio)) totalValue += (p.qty || 0) * (prices[s]?.price || 0);

  const pnl     = totalValue - (bs.startingBalance || 100);
  const pnlPct  = (pnl / (bs.startingBalance || 100)) * 100;
  const drawdown = bs.peakValue > 0 ? ((bs.peakValue - totalValue) / bs.peakValue * 100) : 0;
  const sells   = trades.filter(t => t.type === 'SELL');
  const wins    = sells.filter(t => t.pnl > 0).length;
  const winRate = sells.length > 0 ? `${((wins / sells.length) * 100).toFixed(0)}%` : '—';
  const isRunning = ['running', 'cycling'].includes(bs.status);
  const trialDaysLeft = billing?.trialDaysLeft ?? 14;

  const inp = { background: '#030508', border: `1px solid ${C.border2}`, borderRadius: 8, padding: '9px 12px', color: C.text, fontFamily: "'JetBrains Mono', monospace", fontSize: 13, width: '100%', outline: 'none', boxSizing: 'border-box' };

  const TABS = isMobile
    ? ['overview', 'log', 'trades', 'market']
    : ['overview', 'live log', 'trades', 'positions', 'market', 'analytics'];

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 3px; height: 3px; } ::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 2px; }
        button { cursor: pointer; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes spin { from{transform:rotate(0)} to{transform:rotate(360deg)} }
      `}</style>

      {showSettings && <SettingsModal user={user} onClose={() => setSettings(false)} onSave={saveSettings} />}

      {/* Trial banner */}
      {billing?.plan === 'trial' && trialDaysLeft <= 5 && (
        <div style={{ background: '#f59e0b12', borderBottom: '1px solid #f59e0b22', padding: '10px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <span style={{ color: C.amber, fontSize: 12 }}>⏰ Trial ends in <strong>{trialDaysLeft} days</strong></span>
          <button onClick={async () => { const d = await api.billingCheckout(); window.location.href = d.url; }} style={{ background: C.amber, color: '#000', border: 'none', borderRadius: 6, padding: '5px 14px', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>Subscribe $29.99/mo</button>
        </div>
      )}

      {/* Risk bar */}
      <div style={{ background: '#ef444408', borderBottom: '1px solid #ef444418', padding: '5px 16px', textAlign: 'center' }}>
        <span style={{ color: '#ef444490', fontSize: 10 }}>⚠ Risk: Crypto trading involves substantial risk of loss. NEXUS is not a financial adviser. All trades may result in losses.</span>
      </div>

      {/* Header */}
      <header style={{ background: C.card, borderBottom: `1px solid ${C.border}`, padding: isMobile ? '12px 16px' : '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
          <span style={{ color: C.green, fontWeight: 800, fontSize: 16, fontFamily: "'JetBrains Mono', monospace", letterSpacing: '-0.02em', flexShrink: 0 }}>NEXUS</span>
          {!isMobile && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: '#ffffff06', borderRadius: 6, border: `1px solid ${C.border}` }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: isRunning ? C.green : C.muted, boxShadow: isRunning ? `0 0 6px ${C.green}` : 'none', animation: isRunning ? 'pulse 1.5s infinite' : 'none' }} />
              <span style={{ color: isRunning ? C.green : C.muted, fontSize: 10, fontWeight: 600, fontFamily: 'JetBrains Mono' }}>{(bs.status || 'idle').toUpperCase()}</span>
            </div>
          )}
          {!isMobile && <span style={{ color: C.muted, fontSize: 11 }}>MODE: <span style={{ color: user.botMode === 'LIVE' ? C.amber : C.blue }}>{user.botMode || 'PAPER'}</span></span>}
        </div>

        <div style={{ display: 'flex', align: 'center', gap: 8, flexShrink: 0 }}>
          {!isMobile && (
            <div style={{ textAlign: 'right', marginRight: 4 }}>
              <div style={{ color: pnl >= 0 ? C.green : C.red, fontSize: 18, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace" }}>{fUSD(totalValue)}</div>
              <div style={{ color: pnl >= 0 ? C.green : C.red, fontSize: 10 }}>{pnl >= 0 ? '+' : ''}{fUSD(pnl)}</div>
            </div>
          )}
          {isRunning
            ? <Btn onClick={() => control('stop')}  variant="outline" color={C.red}   size="sm">◼ Stop</Btn>
            : <Btn onClick={() => control('start')} variant="solid"   color={C.green} size="sm">▶ Start</Btn>
          }
          {!isMobile && <Btn onClick={() => control('reset')} size="sm">↺</Btn>}
          <Btn onClick={() => setSettings(true)} size="sm">⚙{!isMobile && ' Settings'}</Btn>
          {!isMobile && <Btn onClick={() => setExchanges(!showExchanges)} size="sm">🔗 Exchanges</Btn>}
          <button onClick={() => { logout(); nav('/'); }} style={{ color: C.muted, background: 'none', border: 'none', fontSize: 12, padding: '4px 8px' }}>Out</button>
        </div>
      </header>

      {/* Exchange panel */}
      {showExchanges && !isMobile && (
        <div style={{ background: '#050810', borderBottom: `1px solid ${C.border}`, padding: '20px 24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <div>
            <div style={{ color: C.text, fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Connect Exchange</div>
            {exErr && <div style={{ color: C.red, fontSize: 12, padding: '8px 12px', background: '#ef444412', borderRadius: 6, marginBottom: 10 }}>{exErr}</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <select value={exForm.exchange} onChange={e=>setExForm(f=>({...f,exchange:e.target.value}))} style={inp}>
                <option value="coinbase">Coinbase Advanced Trade</option>
                <option value="binance">Binance</option>
                <option value="cryptocom">Crypto.com</option>
              </select>
              <input placeholder="API Key" value={exForm.apiKey} onChange={e=>setExForm(f=>({...f,apiKey:e.target.value}))} style={inp}/>
              <input type="password" placeholder="API Secret" value={exForm.apiSecret} onChange={e=>setExForm(f=>({...f,apiSecret:e.target.value}))} style={inp}/>
              <select value={exForm.mode} onChange={e=>setExForm(f=>({...f,mode:e.target.value}))} style={inp}>
                <option value="PAPER">Paper mode</option>
                <option value="LIVE">Live mode (real trades)</option>
              </select>
              <div style={{ color: '#9a6a10', fontSize: 11, lineHeight: 1.6 }}>⚠ Only grant Trade + Read API permissions. Never withdrawal.</div>
              <Btn onClick={connectExchange} disabled={exLoading} variant="solid" color={C.green} fullWidth>{exLoading ? 'Connecting...' : 'Connect'}</Btn>
            </div>
          </div>
          <div>
            <div style={{ color: C.text, fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Connected</div>
            {Object.keys(exchanges).length === 0
              ? <div style={{ color: C.muted, fontSize: 13 }}>No exchanges connected.</div>
              : Object.entries(exchanges).map(([ex, d]) => (
                <div key={ex} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: '12px 14px', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ color: C.text, fontWeight: 600, fontSize: 13, textTransform: 'capitalize' }}>{ex}</div>
                    <div style={{ color: C.muted, fontSize: 10 }}>{d.apiKeyMask} · {d.mode}</div>
                  </div>
                  <button onClick={async()=>{await api.disconnectEx(ex);const r=await api.exchanges();setExchangeList(r.exchanges||{});}} style={{ color:C.red, background:'transparent', border:`1px solid ${C.red}30`, borderRadius:5, padding:'3px 10px', fontSize:10, cursor:'pointer' }}>Remove</button>
                </div>
              ))
            }
          </div>
        </div>
      )}

      {/* Mobile stats */}
      {isMobile && (
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}`, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
          {[
            { label:'VALUE', value:fUSD(totalValue), color:pnl>=0?C.green:C.red },
            { label:'P&L', value:`${pnl>=0?'+':''}${fUSD(pnl)}`, color:pnl>=0?C.green:C.red },
            { label:'WIN', value:winRate, color:C.text },
          ].map(s => (
            <div key={s.label} style={{ background: C.card, borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
              <div style={{ color: C.muted, fontSize: 9, fontWeight: 600, marginBottom: 3 }}>{s.label}</div>
              <div style={{ color: s.color, fontSize: 14, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace" }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Desktop stats */}
      {!isMobile && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 1, background: C.border, margin: '0' }}>
          {[
            { label:'PORTFOLIO', value:fUSD(totalValue), sub:`started ${fUSD(bs.startingBalance)}`, color:pnl>=0?C.green:C.red, glow:pnl>0 },
            { label:'CASH', value:fUSD(bs.balance), sub:`${totalValue>0?((bs.balance/totalValue)*100).toFixed(0):0}% liquid` },
            { label:'P&L', value:`${pnl>=0?'+':''}${fUSD(pnl)}`, sub:fPct(pnlPct), color:pnl>=0?C.green:C.red },
            { label:'WIN RATE', value:winRate, sub:`${wins}W/${sells.length-wins}L`, color:parseInt(winRate)>=50?C.green:C.red },
            { label:'DRAWDOWN', value:fPct(-drawdown), sub:`peak ${fUSD(bs.peakValue)}`, color:drawdown>15?C.red:drawdown>8?C.amber:C.green },
            { label:'FEES', value:fUSD(bs.totalFeesUSD), sub:`${bs.cycleCount||0} cycles` },
            { label:'OPEN POS', value:Object.keys(portfolio).length, sub:`${trades.length} total trades` },
          ].map((s,i)=>(
            <div key={i} style={{ background:C.card, padding:'12px 16px' }}>
              <div style={{ color:C.muted, fontSize:9, fontWeight:600, letterSpacing:'0.08em', marginBottom:4, textTransform:'uppercase' }}>{s.label}</div>
              <div style={{ fontSize:18, fontWeight:800, color:s.color||C.text, fontFamily:"'JetBrains Mono',monospace" }}>{s.value}</div>
              <div style={{ color:C.muted, fontSize:10, marginTop:3 }}>{s.sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{ background: C.card, borderBottom: `1px solid ${C.border}`, padding: `0 ${isMobile?'16px':'24px'}`, display: 'flex', overflowX: 'auto', gap: 0 }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ background:'transparent', border:'none', padding:isMobile?'10px 12px':'10px 16px', color:tab===t?C.green:C.muted, fontFamily:'inherit', fontSize:isMobile?10:11, fontWeight:700, cursor:'pointer', borderBottom:tab===t?`2px solid ${C.green}`:'2px solid transparent', whiteSpace:'nowrap', textTransform:'uppercase', letterSpacing:'0.06em', transition:'color 0.15s' }}>{t}</button>
        ))}
      </div>

      <div style={{ padding: isMobile ? '12px 16px' : '20px 24px' }}>

        {/* OVERVIEW */}
        {(tab === 'overview') && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr', gap: 16 }}>
              <Section title="Equity Curve" right={`${equityCurve.length} pts`}>
                <div style={{ padding: 16, height: 200 }}>
                  {equityCurve.length < 2
                    ? <div style={{ color:C.muted, textAlign:'center', paddingTop:60, fontSize:13 }}>Equity curve builds after first sell trades.</div>
                    : <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={equityCurve}>
                          <defs><linearGradient id="eg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={pnl>=0?C.green:C.red} stopOpacity={0.2}/><stop offset="95%" stopColor={pnl>=0?C.green:C.red} stopOpacity={0}/></linearGradient></defs>
                          <XAxis dataKey="i" hide/><YAxis domain={['auto','auto']} hide/>
                          <Tooltip contentStyle={{ background:C.card2, border:`1px solid ${C.border2}`, borderRadius:8, fontSize:11, color:C.text }} formatter={v=>[fUSD(v),'Value']}/>
                          <ReferenceLine y={bs.startingBalance} stroke={C.subtle} strokeDasharray="4 4"/>
                          <Area type="monotone" dataKey="value" stroke={pnl>=0?C.green:C.red} strokeWidth={2} fill="url(#eg)"/>
                        </AreaChart>
                      </ResponsiveContainer>}
                </div>
              </Section>

              <Section title="Last Decision">
                {(() => {
                  const t = trades[0];
                  if (!t) return <div style={{ padding:'24px 16px', color:C.muted, fontSize:13 }}>Start bot to see decisions.</div>;
                  const ac = t.type==='BUY'?C.green:t.type==='SELL'?(t.pnl>=0?C.blue:C.red):C.muted;
                  return (
                    <div style={{ padding: '14px 16px' }}>
                      <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap', marginBottom:10 }}>
                        <Badge color={ac}>{t.type}</Badge>
                        {t.coin && <span style={{ color:COIN_COLORS[t.coin]||C.text, fontWeight:800, fontSize:17, fontFamily:'JetBrains Mono' }}>{t.coin}</span>}
                        {t.strategy && <Badge color={STRAT_C[t.strategy]||C.muted} sm>{t.strategy}</Badge>}
                        <span style={{ color:C.muted, fontSize:10, marginLeft:'auto' }}>{fAge(t.ts)}</span>
                      </div>
                      {t.type !== 'HOLD' && (
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginBottom:10 }}>
                          {[['Price',fUSD(t.price)],['Amount',fUSD(t.gross)],['Fee',fUSD(t.fee)],t.pnl!=null?['PnL',`${t.pnl>=0?'+':''}${fUSD(t.pnl)}`]:['Qty',t.qty?.toFixed(5)]].map(([k,v])=>(
                            <div key={k} style={{ background:'#ffffff05', padding:'7px 10px', borderRadius:7 }}>
                              <div style={{ color:C.muted, fontSize:9, marginBottom:2 }}>{k}</div>
                              <div style={{ color:k==='PnL'?(t.pnl>=0?C.green:C.red):C.text, fontSize:12, fontWeight:700, fontFamily:'JetBrains Mono' }}>{v}</div>
                            </div>
                          ))}
                        </div>
                      )}
                      <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginBottom:8 }}>
                        {(t.signals||[]).slice(0,3).map((s,i)=><Badge key={i} color={C.cyan} sm>{s}</Badge>)}
                      </div>
                      <div style={{ color:'#475569', fontSize:11, lineHeight:1.8, borderLeft:`2px solid ${C.subtle}`, paddingLeft:10 }}>{t.reasoning}</div>
                    </div>
                  );
                })()}
              </Section>
            </div>

            <Section title="Decision Feed" right={`${trades.length} total`}>
              <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                {trades.slice(0, 50).map((t, i) => {
                  const ac=t.type==='BUY'?C.green:t.type==='SELL'?(t.pnl>=0?C.blue:C.red):C.muted;
                  return (
                    <div key={i} style={{ padding:isMobile?'10px 14px':'8px 16px', borderBottom:`1px solid ${C.border}`, display:'flex', justifyContent:'space-between', alignItems:'center', gap:8, background:i%2?'#ffffff02':'transparent' }}>
                      <div style={{ display:'flex', gap:7, alignItems:'center', flex:1, minWidth:0 }}>
                        <Badge color={ac} sm>{t.type}</Badge>
                        {t.coin && <span style={{ color:COIN_COLORS[t.coin]||C.text, fontWeight:700, fontSize:12, fontFamily:'JetBrains Mono', minWidth:32 }}>{t.coin}</span>}
                        {!isMobile && t.strategy && <Badge color={STRAT_C[t.strategy]||C.muted} sm>{t.strategy}</Badge>}
                        {!isMobile && <span style={{ color:C.muted, fontSize:10, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{t.reasoning?.slice(0,70)}…</span>}
                      </div>
                      <div style={{ display:'flex', gap:8, alignItems:'center', flexShrink:0 }}>
                        {t.type!=='HOLD'&&<span style={{ color:C.muted, fontSize:11, fontFamily:'JetBrains Mono' }}>{fUSD(t.gross)}</span>}
                        {t.pnl!=null&&<span style={{ color:t.pnl>=0?C.green:C.red, fontSize:11, fontFamily:'JetBrains Mono' }}>{t.pnl>=0?'+':''}{fUSD(t.pnl)}</span>}
                        <span style={{ color:'#334155', fontSize:9 }}>{fTime(t.ts)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Section>
          </div>
        )}

        {/* LIVE LOG */}
        {(tab === 'live log' || tab === 'log') && (
          <Section title="Bot Reasoning Log — Real Time" right={`${(botLog||[]).length} entries`}>
            <div ref={logRef} style={{ height: isMobile ? 'calc(100vh - 280px)' : 'calc(100vh - 320px)', overflowY: 'auto', background: '#020307', fontFamily: "'JetBrains Mono', monospace", padding: '6px 0' }}>
              {(!botLog || botLog.length === 0) && <div style={{ padding:'20px', color:C.muted, fontSize:12 }}>Log appears when bot starts.</div>}
              {(botLog || []).map((e, i) => {
                const lc = LOG_C[e.level] || C.muted;
                const big = ['TRADE','PROFIT','LOSS','REASONING','CYCLE'].includes(e.level);
                return (
                  <div key={i} style={{ padding: big ? '7px 16px' : '3px 16px', borderBottom: big ? `1px solid ${C.border}` : 'none', background: big ? '#050a18' : 'transparent', display:'flex', gap:10, alignItems:'flex-start' }}>
                    <span style={{ color:'#1e293b', fontSize:9, flexShrink:0, paddingTop:1 }}>{fTime(e.ts)}</span>
                    <span style={{ color:lc, fontSize:9, fontWeight:700, minWidth:64, flexShrink:0 }}>[{e.level}]</span>
                    <span style={{ color: big ? C.text : '#475569', fontSize: big ? 11 : 10, lineHeight:1.6 }}>{e.msg}</span>
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        {/* TRADES */}
        {tab === 'trades' && (
          <Section title="Trade History" right={`${trades.length} records`}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                <thead><tr style={{ background:'#050710' }}>
                  {(isMobile?['TIME','TYPE','COIN','P&L']:['TIME','TYPE','COIN','STRATEGY','PRICE','AMOUNT','FEE','P&L','CONF']).map(h=>(
                    <th key={h} style={{ padding:'9px 12px', color:C.muted, fontWeight:700, fontSize:9, letterSpacing:'0.08em', textAlign:'left', borderBottom:`1px solid ${C.border}`, whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {trades.map((t,i)=>(
                    <tr key={i} style={{ borderBottom:`1px solid ${C.border}`, background:i%2?'#ffffff01':'transparent' }}>
                      <td style={{ padding:'8px 12px', color:C.muted, fontSize:10, fontFamily:'JetBrains Mono', whiteSpace:'nowrap' }}>{fTime(t.ts)}</td>
                      <td style={{ padding:'8px 12px' }}><Badge color={t.type==='BUY'?C.green:t.type==='SELL'?C.blue:C.muted} sm>{t.type}</Badge></td>
                      <td style={{ padding:'8px 12px', color:COIN_COLORS[t.coin]||C.text, fontWeight:700, fontFamily:'JetBrains Mono' }}>{t.coin||'—'}</td>
                      {!isMobile && <td style={{ padding:'8px 12px' }}>{t.strategy&&<Badge color={STRAT_C[t.strategy]||C.muted} sm>{t.strategy}</Badge>}</td>}
                      {!isMobile && <td style={{ padding:'8px 12px', color:C.text, fontFamily:'JetBrains Mono' }}>{fUSD(t.price)}</td>}
                      {!isMobile && <td style={{ padding:'8px 12px', color:C.text, fontFamily:'JetBrains Mono' }}>{fUSD(t.gross)}</td>}
                      {!isMobile && <td style={{ padding:'8px 12px', color:C.muted, fontFamily:'JetBrains Mono' }}>{fUSD(t.fee)}</td>}
                      <td style={{ padding:'8px 12px', color:t.pnl==null?C.muted:t.pnl>=0?C.green:C.red, fontFamily:'JetBrains Mono' }}>{t.pnl!=null?`${t.pnl>=0?'+':''}${fUSD(t.pnl)}`:'—'}</td>
                      {!isMobile && <td style={{ padding:'8px 12px', color:(t.confidence||0)>=7?C.green:(t.confidence||0)>=5?C.amber:C.red, fontFamily:'JetBrains Mono' }}>{t.confidence||'—'}/10</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        {/* POSITIONS — desktop only */}
        {tab === 'positions' && !isMobile && (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {Object.keys(portfolio).length === 0
              ? <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:'48px', color:C.muted, textAlign:'center', fontSize:14 }}>No open positions. Waiting for high-conviction setup.</div>
              : Object.entries(portfolio).map(([sym,pos]) => {
                  const px=prices[sym]?.price, posVal=px?pos.qty*px:0;
                  const pnl=px?(px-pos.avgCost)*pos.qty:0, pnlP=pos.avgCost>0?((px||0)-pos.avgCost)/pos.avgCost*100:0;
                  return (
                    <div key={sym} style={{ background:C.card, border:`1px solid ${pnl>=0?C.green+'28':C.red+'28'}`, borderRadius:12, padding:'20px 24px', display:'grid', gridTemplateColumns:'auto 1fr 1fr 1fr 1fr 1fr', gap:16, alignItems:'center' }}>
                      <div style={{ width:40, height:40, borderRadius:10, background:(COIN_COLORS[sym]||C.text)+'18', display:'flex', alignItems:'center', justifyContent:'center', color:COIN_COLORS[sym]||C.text, fontWeight:800, fontSize:11, fontFamily:'JetBrains Mono' }}>{sym.slice(0,3)}</div>
                      <div><div style={{ color:COIN_COLORS[sym]||C.text, fontWeight:800, fontSize:20, fontFamily:'JetBrains Mono' }}>{sym}</div><div style={{ color:C.muted, fontSize:11 }}>since {fAge(pos.entryTime)}</div></div>
                      {[['Quantity',pos.qty.toFixed(5)],['Avg Cost',fUSD(pos.avgCost)],['Current',fUSD(px)],['Value',fUSD(posVal)],['P&L',`${pnl>=0?'+':''}${fUSD(pnl)} (${fPct(pnlP)})`]].map(([k,v])=>(
                        <div key={k}><div style={{ color:C.muted, fontSize:9, fontWeight:600, marginBottom:3, textTransform:'uppercase' }}>{k}</div><div style={{ color:k==='P&L'?(pnl>=0?C.green:C.red):C.text, fontSize:13, fontWeight:700, fontFamily:'JetBrains Mono' }}>{v}</div></div>
                      ))}
                    </div>
                  );
                })
            }
          </div>
        )}

        {/* MARKET */}
        {tab === 'market' && (
          <div style={{ display:'grid', gridTemplateColumns:`repeat(${isMobile?2:4},1fr)`, gap:12 }}>
            {Object.entries(prices).map(([sym,data])=>{
              if(!data) return null;
              const held=portfolio[sym], cc=COIN_COLORS[sym]||C.text, chg=data.change24h||0;
              return(
                <div key={sym} style={{ background:C.card, border:`1px solid ${held?cc+'30':C.border}`, borderRadius:12, padding:isMobile?'14px':'18px' }}>
                  {held && <div style={{ float:'right' }}><Badge color={cc} sm>HELD</Badge></div>}
                  <div style={{ color:cc, fontWeight:800, fontSize:18, fontFamily:'JetBrains Mono', marginBottom:4 }}>{sym}</div>
                  <div style={{ color:C.text, fontSize:isMobile?15:18, fontWeight:700, fontFamily:'JetBrains Mono', marginBottom:2 }}>{fUSD(data.price)}</div>
                  <div style={{ color:chg>=0?C.green:C.red, fontSize:12, marginBottom:isMobile?8:12 }}>{fPct(chg)} 24h</div>
                  {!isMobile && (
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
                      {[['HIGH',fUSD(data.high24h)],['LOW',fUSD(data.low24h)],['VOL',fUSD(data.volume24h)],['OPEN',fUSD(data.openPrice)]].map(([k,v])=>(
                        <div key={k} style={{ background:'#ffffff04', padding:'6px 8px', borderRadius:6 }}>
                          <div style={{ color:C.muted, fontSize:8, fontWeight:600, marginBottom:2 }}>{k}</div>
                          <div style={{ color:C.muted, fontSize:10, fontFamily:'JetBrains Mono' }}>{v}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ANALYTICS — desktop only */}
        {tab === 'analytics' && !isMobile && (
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
              <Section title="Strategy Breakdown">
                <div style={{ padding:16 }}>
                  {(()=>{ const s={}; trades.forEach(t=>{if(t.strategy&&t.type!=='HOLD')s[t.strategy]=(s[t.strategy]||0)+1;}); const tot=Object.values(s).reduce((a,b)=>a+b,0)||1;
                    return Object.entries(s).sort((a,b)=>b[1]-a[1]).map(([st,n])=>(
                      <div key={st} style={{ marginBottom:12 }}>
                        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}><Badge color={STRAT_C[st]||C.muted} sm>{st}</Badge><span style={{ color:C.muted, fontSize:11, fontFamily:'JetBrains Mono' }}>{n} ({((n/tot)*100).toFixed(0)}%)</span></div>
                        <div style={{ height:4, background:'#ffffff08', borderRadius:2 }}><div style={{ height:'100%', width:`${(n/tot)*100}%`, background:STRAT_C[st]||C.muted, borderRadius:2, transition:'width 0.5s' }}/></div>
                      </div>
                    ));
                  })()}
                </div>
              </Section>
              <Section title="Coin P&L">
                <div style={{ padding:16 }}>
                  {(()=>{ const cp={}; trades.filter(t=>t.type==='SELL'&&t.pnl!=null).forEach(t=>{cp[t.coin]=(cp[t.coin]||0)+t.pnl;});
                    return Object.entries(cp).sort((a,b)=>b[1]-a[1]).map(([c,p])=>(
                      <div key={c} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:`1px solid ${C.border}` }}>
                        <span style={{ color:COIN_COLORS[c]||C.text, fontWeight:700, fontSize:13, fontFamily:'JetBrains Mono' }}>{c}</span>
                        <span style={{ color:p>=0?C.green:C.red, fontSize:13, fontFamily:'JetBrains Mono' }}>{p>=0?'+':''}{fUSD(p)}</span>
                      </div>
                    ));
                  })()}
                </div>
              </Section>
            </div>
            <Section title="Trade P&L History">
              <div style={{ padding:16, height:200 }}>
                {(()=>{ const d=trades.filter(t=>t.type==='SELL'&&t.pnl!=null).slice(0,40).reverse().map((t,i)=>({i:i+1,pnl:+t.pnl.toFixed(4),fill:t.pnl>=0?C.green:C.red}));
                  if(!d.length) return<div style={{ color:C.muted, textAlign:'center', paddingTop:70, fontSize:13 }}>No closed trades yet.</div>;
                  return<ResponsiveContainer width="100%" height="100%"><BarChart data={d}><XAxis dataKey="i" hide/><YAxis hide/><Tooltip contentStyle={{ background:C.card2, border:`1px solid ${C.border2}`, borderRadius:8, fontSize:11 }} formatter={v=>[fUSD(v),'P&L']}/><ReferenceLine y={0} stroke={C.subtle}/><Bar dataKey="pnl" radius={[3,3,0,0]} fill={C.green}/></BarChart></ResponsiveContainer>;
                })()}
              </div>
            </Section>
          </div>
        )}
      </div>

      <div style={{ padding:'8px 24px', borderTop:`1px solid ${C.border}`, textAlign:'center', color:'#334155', fontSize:9 }}>
        PAPER MODE · Risk disclosure: crypto trading involves substantial loss risk · NEXUS is not a financial adviser
      </div>
    </div>
  );
}
