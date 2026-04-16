import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, BarChart, Bar } from 'recharts';
import { useAuth, useBotSocket } from '../lib/auth.jsx';
import { api } from '../lib/api.js';

const C = { bg:'#04060e', green:'#0ff078', red:'#f0365a', amber:'#f5a020', blue:'#2f8ef5', purple:'#a855f7', cyan:'#06b6d4', text:'#b8d0e8', sub:'#2d4460', card:'#080d1a', border:'#0f1e30', dim:'#05080f' };
const COIN_COLORS = { BTC:'#f7931a', ETH:'#627eea', SOL:'#9945ff', XRP:'#00aae4', AVAX:'#e84142', LINK:'#2a5ada', ADA:'#3cc8c8', DOGE:'#c2a633' };
const STRAT_COLORS = { MOMENTUM:C.blue, MEAN_REVERSION:C.cyan, BREAKOUT:C.amber, EMA_CROSS:C.purple, HIGH_RISK_REWARD:C.red, TAKE_PROFIT:C.green, STOP_LOSS:C.red, TREND_REVERSAL:C.amber, HOLD:'#445566', RSI_DIVERGENCE:C.cyan };
const LOG_COLORS = { CYCLE:'#334466', MARKET:'#223344', AI:C.purple, SIGNAL:C.green, REASONING:C.text, TRADE:C.green, PROFIT:C.green, LOSS:C.red, POSITION:C.amber, HOLD:'#445566', WARN:C.amber, ERROR:C.red, SYSTEM:C.blue, INFO:C.sub };

const fUSD = n => { if(n==null||isNaN(n))return'$—'; const a=Math.abs(n); if(a>=1e6)return`$${(n/1e6).toFixed(3)}M`; if(a>=1000)return`$${n.toLocaleString('en-US',{maximumFractionDigits:2})}`; if(a>=1)return`$${n.toFixed(4)}`; return`$${n.toFixed(6)}`; };
const fPct  = n => n==null?'—':`${n>=0?'+':''}${n.toFixed(2)}%`;
const fTime = iso => !iso?'—':new Date(iso).toLocaleTimeString('en-US',{hour12:false});
const fAge  = iso => { if(!iso)return'—'; const d=(Date.now()-new Date(iso))/1000; if(d<60)return`${Math.round(d)}s ago`; if(d<3600)return`${Math.round(d/60)}m ago`; return`${Math.round(d/3600)}h ago`; };

function Tag({color,children,small}){return<span style={{background:color+'1e',color,border:`1px solid ${color}30`,padding:small?'1px 5px':'3px 9px',borderRadius:3,fontSize:small?8:10,fontWeight:700,letterSpacing:'0.06em'}}>{children}</span>;}
function Btn({onClick,color,children,disabled,active,small}){return<button onClick={onClick} disabled={disabled} style={{background:active?color+'22':'transparent',color:active?color:C.sub,border:`1px solid ${active?color:C.sub}44`,padding:small?'4px 10px':'7px 16px',borderRadius:5,cursor:disabled?'not-allowed':'pointer',fontFamily:'inherit',fontSize:small?9:11,fontWeight:700,letterSpacing:'0.07em',opacity:disabled?0.4:1}}>{children}</button>;}
function Card({label,value,sub,color,pulse}){return<div style={{background:C.card,border:`1px solid ${pulse?color+'44':C.border}`,borderRadius:8,padding:'14px 18px',boxShadow:pulse?`0 0 14px ${color}18`:'none'}}><div style={{color:C.sub,fontSize:9,letterSpacing:'0.14em',marginBottom:5}}>{label}</div><div style={{fontSize:20,fontWeight:800,color:color||C.text,fontFamily:'IBM Plex Mono',lineHeight:1.1}}>{value}</div>{sub&&<div style={{color:C.sub,fontSize:10,marginTop:4}}>{sub}</div>}</div>;}
function Head({children,right}){return<div style={{padding:'7px 14px',fontSize:9,color:C.sub,letterSpacing:'0.15em',fontWeight:700,borderBottom:`1px solid ${C.border}`,background:C.dim,display:'flex',justifyContent:'space-between',alignItems:'center'}}><span>{children}</span>{right&&<span style={{color:C.sub}}>{right}</span>}</div>;}

export default function Dashboard() {
  const { user, logout, refreshUser } = useAuth();
  const { botState, prices, botLog, connected } = useBotSocket();
  const nav = useNavigate();
  const [tab, setTab]           = useState('overview');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exchangesOpen, setExchangesOpen] = useState(false);
  const [equityCurve, setEquity] = useState([]);
  const [actionPending, setPending] = useState(false);
  const [billing, setBilling]   = useState(null);
  const [exchanges, setExchanges] = useState({});
  const [exForm, setExForm]     = useState({ exchange:'coinbase', apiKey:'', apiSecret:'', label:'', mode:'PAPER' });
  const [exError, setExError]   = useState('');
  const [exLoading, setExLoading] = useState(false);
  const [settings, setSettings] = useState(null);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const logRef = useRef(null);

  useEffect(() => {
    if (!user) { nav('/login'); return; }
    setSettings({ maxTradeUSD: user.maxTradeUSD||20, stopLossPct: (user.stopLossPct||0.05)*100, takeProfitPct: (user.takeProfitPct||0.08)*100, maxDrawdownPct: (user.maxDrawdownPct||0.20)*100, leverageEnabled: user.leverageEnabled||false, maxLeverage: user.maxLeverage||3, startingBalance: user.startingBalance||100, botMode: user.botMode||'PAPER' });
    api.billingStatus().then(setBilling).catch(()=>{});
    api.exchanges().then(d=>setExchanges(d.exchanges||{})).catch(()=>{});
  }, [user]);

  useEffect(() => {
    if (!botState?.trades) return;
    let val = botState.startingBalance || 100;
    const curve = [{ i:0, value:val }];
    [...botState.trades].reverse().forEach((t,i) => { if(t.type==='SELL'&&t.pnl!=null){val+=t.pnl;curve.push({i:i+1,value:+val.toFixed(4),ts:t.ts});}});
    setEquity(curve);
  }, [botState?.trades?.length]);

  useEffect(() => { if(logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [botLog?.length]);

  const control = async (action) => {
    setPending(true);
    try { await api[action==='start'?'botStart':action==='stop'?'botStop':'botReset'](); await refreshUser(); } catch(e) { alert(e.message); }
    setPending(false);
  };

  const saveSettings = async () => {
    setSettingsSaving(true);
    try {
      await api.botSettings({ ...settings, stopLossPct: settings.stopLossPct/100, takeProfitPct: settings.takeProfitPct/100, maxDrawdownPct: settings.maxDrawdownPct/100 });
      await refreshUser();
      setSettingsOpen(false);
    } catch(e) { alert(e.message); }
    setSettingsSaving(false);
  };

  const connectExchange = async () => {
    setExError(''); setExLoading(true);
    try {
      await api.connectEx(exForm);
      const d = await api.exchanges();
      setExchanges(d.exchanges||{});
      setExForm({ exchange:'coinbase', apiKey:'', apiSecret:'', label:'', mode:'PAPER' });
    } catch(e) { setExError(e.message); }
    setExLoading(false);
  };

  const disconnectExchange = async (ex) => {
    if (!confirm(`Disconnect ${ex}?`)) return;
    await api.disconnectEx(ex);
    const d = await api.exchanges();
    setExchanges(d.exchanges||{});
  };

  const goToBilling = async () => {
    try { const d = await (billing?.subscriptionStatus==='active'?api.billingPortal():api.billingCheckout()); window.location.href = d.url; } catch(e) { alert(e.message); }
  };

  if (!user || !botState) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:C.bg,flexDirection:'column',gap:16}}>
      <div style={{color:C.green,fontSize:22,fontWeight:800}}>NEXUS</div>
      <div style={{color:C.sub,fontSize:12}}>{connected?'Loading your dashboard...':'Connecting...'}</div>
    </div>
  );

  const bs         = botState;
  const totalValue = (() => { let v = bs.balance||0; for(const [s,p] of Object.entries(bs.portfolio||{})) v+=(p.qty||0)*(prices[s]?.price||0); return v; })();
  const pnl        = totalValue - (bs.startingBalance||100);
  const pnlPct     = (pnl/(bs.startingBalance||100))*100;
  const drawdown   = bs.peakValue>0?((bs.peakValue-totalValue)/bs.peakValue*100):0;
  const sells      = (bs.trades||[]).filter(t=>t.type==='SELL');
  const wins       = sells.filter(t=>t.pnl>0).length;
  const winRate    = sells.length>0?((wins/sells.length)*100).toFixed(0)+'%':'—';
  const isRunning  = ['running','cycling'].includes(bs.status);
  const trialDaysLeft = billing?.trialDaysLeft ?? 14;

  const inp2 = { background:'#03050c', border:`1px solid ${C.border}`, borderRadius:5, padding:'8px 10px', color:'#e8f4ff', fontFamily:'inherit', fontSize:13, width:'100%', boxSizing:'border-box', outline:'none' };

  return (
    <div style={{ minHeight:'100vh', background:C.bg, fontFamily:"'IBM Plex Mono',monospace" }}>

      {/* Trial banner */}
      {billing?.plan==='trial' && trialDaysLeft <= 7 && (
        <div style={{ background:`${C.amber}18`, borderBottom:`1px solid ${C.amber}33`, padding:'10px 20px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ color:C.amber, fontSize:12 }}>⏰ Your free trial ends in <strong>{trialDaysLeft} days</strong>. Add payment to keep trading.</span>
          <button onClick={goToBilling} style={{ background:C.amber, color:'#000', border:'none', borderRadius:5, padding:'6px 14px', fontSize:11, fontWeight:800, cursor:'pointer' }}>Subscribe Now</button>
        </div>
      )}

      {/* Risk disclaimer bar */}
      <div style={{ background:`${C.red}08`, borderBottom:`1px solid ${C.red}20`, padding:'6px 20px', textAlign:'center' }}>
        <span style={{ color:'#b06060', fontSize:10 }}>⚠ RISK WARNING: Crypto trading involves substantial risk of loss. NEXUS is not a financial adviser. Never invest more than you can afford to lose. All trades may result in losses.</span>
      </div>

      {/* Header */}
      <div style={{ background:C.card, borderBottom:`1px solid ${C.border}`, padding:'10px 20px', display:'flex', alignItems:'center', justifyContent:'space-between', position:'sticky', top:0, zIndex:100 }}>
        <div style={{ display:'flex', alignItems:'center', gap:14 }}>
          <span style={{ color:C.green, fontSize:18, fontWeight:800, fontFamily:'Sora' }}>NEXUS</span>
          <div style={{ display:'flex', alignItems:'center', gap:6, padding:'3px 10px', background:C.dim, borderRadius:4, border:`1px solid ${C.border}` }}>
            <div style={{ width:6, height:6, borderRadius:'50%', background:isRunning?C.green:C.sub, boxShadow:isRunning?`0 0 7px ${C.green}`:'none' }}/>
            <span style={{ color:isRunning?C.green:C.sub, fontSize:9, fontWeight:700 }}>{connected?(bs.status||'idle').toUpperCase():'OFFLINE'}</span>
          </div>
          <span style={{ color:C.sub, fontSize:9 }}>MODE: <span style={{ color:user.botMode==='LIVE'?C.amber:C.blue }}>{user.botMode||'PAPER'}</span></span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ textAlign:'right', marginRight:8 }}>
            <div style={{ color:pnl>=0?C.green:C.red, fontSize:18, fontWeight:800, fontFamily:'Sora' }}>{fUSD(totalValue)}</div>
            <div style={{ color:pnl>=0?C.green:C.red, fontSize:10 }}>{pnl>=0?'+':''}{fUSD(pnl)} ({fPct(pnlPct)})</div>
          </div>
          {isRunning
            ? <Btn onClick={()=>control('stop')}  color={C.red}   active>◼ STOP</Btn>
            : <Btn onClick={()=>control('start')} color={C.green} active>▶ START</Btn>
          }
          <Btn onClick={()=>control('reset')} color={C.sub} small>↺</Btn>
          <Btn onClick={()=>setSettingsOpen(!settingsOpen)} color={C.blue} small>⚙ SETTINGS</Btn>
          <Btn onClick={()=>setExchangesOpen(!exchangesOpen)} color={C.purple} small>🔗 EXCHANGES</Btn>
          <Btn onClick={goToBilling} color={C.amber} small>💳 BILLING</Btn>
          <button onClick={()=>{logout();nav('/');}} style={{ color:C.sub, background:'transparent', border:'none', cursor:'pointer', fontSize:11 }}>Sign Out</button>
        </div>
      </div>

      {/* Settings Panel */}
      {settingsOpen && settings && (
        <div style={{ background:'#050910', borderBottom:`1px solid ${C.border}`, padding:'20px', display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:16 }}>
          {[
            ['Max Trade ($)', 'maxTradeUSD', 'number', 5, 10000],
            ['Stop Loss (%)', 'stopLossPct', 'number', 1, 50],
            ['Take Profit (%)', 'takeProfitPct', 'number', 1, 100],
            ['Max Drawdown (%)', 'maxDrawdownPct', 'number', 5, 50],
            ['Starting Balance ($)', 'startingBalance', 'number', 10, 1000000],
            ['Max Leverage', 'maxLeverage', 'number', 2, 20],
          ].map(([label, key, type, min, max]) => (
            <div key={key}>
              <div style={{ color:C.sub, fontSize:10, marginBottom:5 }}>{label.toUpperCase()}</div>
              <input type={type} min={min} max={max} value={settings[key]} onChange={e=>setSettings(s=>({...s,[key]:parseFloat(e.target.value)||0}))} style={inp2} />
            </div>
          ))}
          <div>
            <div style={{ color:C.sub, fontSize:10, marginBottom:5 }}>TRADING MODE</div>
            <select value={settings.botMode} onChange={e=>setSettings(s=>({...s,botMode:e.target.value}))} style={inp2}>
              <option value="PAPER">Paper (Simulated)</option>
              <option value="LIVE">Live (Real Money)</option>
            </select>
          </div>
          <div>
            <div style={{ color:C.sub, fontSize:10, marginBottom:5 }}>LEVERAGE</div>
            <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', marginTop:8 }}>
              <input type="checkbox" checked={settings.leverageEnabled} onChange={e=>setSettings(s=>({...s,leverageEnabled:e.target.checked}))} style={{ accentColor:C.purple }} />
              <span style={{ color:C.text, fontSize:12 }}>Enable perpetuals</span>
            </label>
          </div>
          <div style={{ display:'flex', alignItems:'flex-end', gap:8 }}>
            <button onClick={saveSettings} disabled={settingsSaving} style={{ background:C.green, color:'#000', border:'none', borderRadius:5, padding:'8px 16px', fontWeight:800, cursor:'pointer', fontSize:12 }}>{settingsSaving?'Saving...':'Save Settings'}</button>
            <Btn onClick={()=>setSettingsOpen(false)} color={C.sub} small>Cancel</Btn>
          </div>
        </div>
      )}

      {/* Exchange Panel */}
      {exchangesOpen && (
        <div style={{ background:'#050910', borderBottom:`1px solid ${C.border}`, padding:'20px' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
            <div>
              <div style={{ color:'#e8f4ff', fontSize:13, fontWeight:700, marginBottom:16 }}>Connect Exchange</div>
              {exError && <div style={{ color:C.red, fontSize:12, marginBottom:12, padding:'8px 12px', background:`${C.red}15`, borderRadius:5 }}>{exError}</div>}
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                <select value={exForm.exchange} onChange={e=>setExForm(f=>({...f,exchange:e.target.value}))} style={inp2}>
                  <option value="coinbase">Coinbase Advanced Trade</option>
                  <option value="binance">Binance</option>
                  <option value="cryptocom">Crypto.com</option>
                </select>
                <input placeholder="API Key" value={exForm.apiKey} onChange={e=>setExForm(f=>({...f,apiKey:e.target.value}))} style={inp2} />
                <input placeholder="API Secret" type="password" value={exForm.apiSecret} onChange={e=>setExForm(f=>({...f,apiSecret:e.target.value}))} style={inp2} />
                <input placeholder="Label (optional)" value={exForm.label} onChange={e=>setExForm(f=>({...f,label:e.target.value}))} style={inp2} />
                <select value={exForm.mode} onChange={e=>setExForm(f=>({...f,mode:e.target.value}))} style={inp2}>
                  <option value="PAPER">Paper mode (test)</option>
                  <option value="LIVE">Live mode (real trades)</option>
                </select>
                <div style={{ color:'#b06060', fontSize:11, lineHeight:1.6 }}>⚠ Only grant Trade + Read permissions on your API key. Never grant withdrawal permissions.</div>
                <button onClick={connectExchange} disabled={exLoading} style={{ background:C.green, color:'#000', border:'none', borderRadius:5, padding:'9px', fontWeight:800, cursor:'pointer', fontSize:12 }}>{exLoading?'Connecting...':'Connect Exchange'}</button>
              </div>
              <div style={{ color:C.sub, fontSize:11, marginTop:12 }}>Note: Robinhood does not offer a public API and is not supported.</div>
            </div>
            <div>
              <div style={{ color:'#e8f4ff', fontSize:13, fontWeight:700, marginBottom:16 }}>Connected Exchanges</div>
              {Object.keys(exchanges).length === 0
                ? <div style={{ color:C.sub, fontSize:12 }}>No exchanges connected. Connect one to enable live trading.</div>
                : Object.entries(exchanges).map(([ex, data]) => (
                  <div key={ex} style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:8, padding:'14px', marginBottom:10, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div>
                      <div style={{ color:'#e8f4ff', fontWeight:700, fontSize:13, textTransform:'capitalize' }}>{ex}</div>
                      <div style={{ color:C.sub, fontSize:10 }}>{data.apiKeyMask} · {data.mode}</div>
                      <div style={{ color:data.connected?C.green:C.red, fontSize:10 }}>{data.connected?'Connected':'Disconnected'} · {fAge(data.connectedAt)}</div>
                    </div>
                    <button onClick={()=>disconnectExchange(ex)} style={{ color:C.red, background:'transparent', border:`1px solid ${C.red}44`, borderRadius:4, padding:'4px 10px', cursor:'pointer', fontSize:10 }}>Disconnect</button>
                  </div>
                ))
              }
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', borderBottom:`1px solid ${C.border}` }}>
        {[
          { label:'TOTAL VALUE',  value:fUSD(totalValue), sub:`started ${fUSD(bs.startingBalance)}`, color:pnl>=0?C.green:C.red, pulse:pnl>0 },
          { label:'CASH',         value:fUSD(bs.balance), sub:`${totalValue>0?((bs.balance/totalValue)*100).toFixed(0):0}% liquid` },
          { label:'ALL-TIME P&L', value:`${pnl>=0?'+':''}${fUSD(pnl)}`, sub:fPct(pnlPct), color:pnl>=0?C.green:C.red },
          { label:'WIN RATE',     value:winRate, sub:`${wins}W/${sells.length-wins}L`, color:parseInt(winRate)>=50?C.green:C.red },
          { label:'DRAWDOWN',     value:fPct(-drawdown), sub:`peak ${fUSD(bs.peakValue)}`, color:drawdown>15?C.red:drawdown>8?C.amber:C.green },
          { label:'FEES',         value:fUSD(bs.totalFeesUSD), sub:`${bs.cycleCount} cycles` },
          { label:'POSITIONS',    value:Object.keys(bs.portfolio||{}).length, sub:`${(bs.trades||[]).length} total trades` },
        ].map((s,i)=>(
          <div key={i} style={{ background:C.card, padding:'11px 14px', borderRight:`1px solid ${C.border}` }}>
            <div style={{ color:C.sub, fontSize:8, letterSpacing:'0.14em', marginBottom:4 }}>{s.label}</div>
            <div style={{ fontSize:17, fontWeight:800, color:s.color||C.text, fontFamily:'Sora' }}>{s.value}</div>
            <div style={{ color:C.sub, fontSize:9, marginTop:3 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ background:C.card, borderBottom:`1px solid ${C.border}`, padding:'0 20px', display:'flex' }}>
        {['overview','live log','trades','positions','market','analytics'].map(t=>(
          <button key={t} onClick={()=>setTab(t)} style={{ background:'transparent', border:'none', padding:'9px 14px', color:tab===t?C.green:C.sub, fontFamily:'inherit', fontSize:9, fontWeight:700, letterSpacing:'0.12em', cursor:'pointer', borderBottom:tab===t?`2px solid ${C.green}`:'2px solid transparent', textTransform:'uppercase' }}>{t}</button>
        ))}
      </div>

      <div style={{ padding:'16px 20px' }}>

        {/* OVERVIEW */}
        {tab==='overview' && (
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:14 }}>
              <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:8, overflow:'hidden' }}>
                <Head right={`${equityCurve.length} data pts`}>EQUITY CURVE</Head>
                <div style={{ padding:'14px', height:220 }}>
                  {equityCurve.length<2
                    ? <div style={{ color:C.sub, textAlign:'center', paddingTop:70, fontSize:12 }}>Equity curve builds after completed sell trades.</div>
                    : <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={equityCurve}>
                          <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={pnl>=0?C.green:C.red} stopOpacity={0.2}/><stop offset="95%" stopColor={pnl>=0?C.green:C.red} stopOpacity={0}/></linearGradient></defs>
                          <XAxis dataKey="i" hide/><YAxis domain={['auto','auto']} hide/>
                          <Tooltip contentStyle={{ background:C.card, border:`1px solid ${C.border}`, fontSize:10 }} formatter={v=>[fUSD(v),'Value']}/>
                          <ReferenceLine y={bs.startingBalance} stroke={C.sub} strokeDasharray="3 3"/>
                          <Area type="monotone" dataKey="value" stroke={pnl>=0?C.green:C.red} strokeWidth={2} fill="url(#g)"/>
                        </AreaChart>
                      </ResponsiveContainer>}
                </div>
              </div>
              <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:8, overflow:'hidden' }}>
                <Head>LAST DECISION</Head>
                {(()=>{ const t=(bs.trades||[])[0]; if(!t)return<div style={{padding:'20px',color:C.sub,fontSize:11}}>No decisions yet. Start the bot.</div>;
                  const ac=t.type==='BUY'?C.green:t.type==='SELL'?(t.pnl>=0?C.blue:C.red):C.amber;
                  return(
                    <div style={{padding:'12px 14px'}}>
                      <div style={{display:'flex',gap:7,alignItems:'center',marginBottom:8,flexWrap:'wrap'}}>
                        <Tag color={ac}>{t.type}</Tag>
                        {t.coin&&<span style={{color:COIN_COLORS[t.coin]||C.text,fontWeight:800,fontSize:16,fontFamily:'Sora'}}>{t.coin}</span>}
                        {t.strategy&&<Tag color={STRAT_COLORS[t.strategy]||C.sub} small>{t.strategy}</Tag>}
                        <span style={{marginLeft:'auto',color:C.sub,fontSize:9}}>{fAge(t.ts)}</span>
                      </div>
                      {t.type!=='HOLD'&&<div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:5,marginBottom:8}}>
                        {[['Price',fUSD(t.price)],['Amount',fUSD(t.gross)],['Fee',fUSD(t.fee)],t.pnl!=null?['PnL',`${t.pnl>=0?'+':''}${fUSD(t.pnl)}`]:['Qty',t.qty?.toFixed(6)]].map(([k,v])=>(
                          <div key={k} style={{background:C.dim,padding:'5px 8px',borderRadius:4}}><div style={{color:C.sub,fontSize:8}}>{k}</div><div style={{color:k==='PnL'?(t.pnl>=0?C.green:C.red):C.text,fontSize:11,fontWeight:700}}>{v}</div></div>
                        ))}
                      </div>}
                      <div style={{display:'flex',gap:3,flexWrap:'wrap',marginBottom:8}}>{(t.signals||[]).map((s,i)=><Tag key={i} color={C.cyan} small>{s}</Tag>)}</div>
                      <div style={{color:'#5a7a9a',fontSize:10,lineHeight:1.8,borderLeft:`2px solid ${C.border}`,paddingLeft:8}}>{t.reasoning}</div>
                      <div style={{marginTop:6,color:C.sub,fontSize:9}}>CONF: <span style={{color:(t.confidence||0)>=7?C.green:(t.confidence||0)>=5?C.amber:C.red}}>{t.confidence||'—'}/10</span></div>
                    </div>
                  );
                })()}
              </div>
            </div>

            <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:8, overflow:'hidden' }}>
              <Head right={`${(bs.trades||[]).length} total`}>DECISION FEED</Head>
              <div style={{ maxHeight:280, overflowY:'auto' }}>
                {(bs.trades||[]).slice(0,40).map((t,i)=>{
                  const ac=t.type==='BUY'?C.green:t.type==='SELL'?(t.pnl>=0?C.blue:C.red):C.amber;
                  return(
                    <div key={i} style={{padding:'7px 14px',borderBottom:`1px solid ${C.border}`,display:'flex',justifyContent:'space-between',alignItems:'center',background:i%2===0?'transparent':'#060b16'}}>
                      <div style={{display:'flex',gap:7,alignItems:'center',flex:1,minWidth:0}}>
                        <Tag color={ac} small>{t.type}</Tag>
                        {t.coin&&<span style={{color:COIN_COLORS[t.coin]||C.text,fontWeight:700,fontSize:11,minWidth:32}}>{t.coin}</span>}
                        {t.strategy&&<Tag color={STRAT_COLORS[t.strategy]||C.sub} small>{t.strategy}</Tag>}
                        <span style={{color:C.sub,fontSize:9,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:280}}>{t.reasoning?.slice(0,80)}…</span>
                      </div>
                      <div style={{display:'flex',gap:10,alignItems:'center',flexShrink:0}}>
                        {t.type!=='HOLD'&&<span style={{color:C.text,fontSize:10}}>{fUSD(t.gross)}</span>}
                        {t.pnl!=null&&<span style={{color:t.pnl>=0?C.green:C.red,fontSize:10}}>{t.pnl>=0?'+':''}{fUSD(t.pnl)}</span>}
                        <span style={{color:C.sub,fontSize:8}}>{fTime(t.ts)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* LIVE LOG */}
        {tab==='live log' && (
          <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:8, overflow:'hidden' }}>
            <Head right={`${(botLog||[]).length} entries · real-time`}>BOT REASONING LOG</Head>
            <div ref={logRef} style={{ height:'calc(100vh - 320px)', overflowY:'auto', background:'#03050c', padding:'4px 0' }}>
              {(!botLog||botLog.length===0)&&<div style={{padding:'20px',color:C.sub,fontSize:11}}>Log will appear when the bot starts.</div>}
              {(botLog||[]).map((e,i)=>{
                const lc=LOG_COLORS[e.level]||C.sub;
                const big=['TRADE','PROFIT','LOSS','REASONING','CYCLE'].includes(e.level);
                return(
                  <div key={i} style={{padding:big?'6px 14px':'3px 14px',borderBottom:big?`1px solid ${C.border}`:'none',background:big?'#050a15':'transparent'}}>
                    <span style={{color:'#152030',fontSize:9,marginRight:8}}>{fTime(e.ts)}</span>
                    <span style={{color:lc,fontSize:9,fontWeight:700,marginRight:6,display:'inline-block',minWidth:64}}>[{e.level}]</span>
                    <span style={{color:big?C.text:C.sub,fontSize:big?11:9,lineHeight:1.7}}>{e.msg}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TRADES */}
        {tab==='trades' && (
          <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:8, overflow:'hidden' }}>
            <Head right={`${(bs.trades||[]).length} records`}>FULL TRADE HISTORY</Head>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:10 }}>
                <thead><tr style={{ background:C.dim }}>
                  {['TIME','TYPE','COIN','STRATEGY','PRICE','AMOUNT','FEE','P&L','CONF','SIGNALS'].map(h=>(
                    <th key={h} style={{padding:'8px 12px',color:C.sub,fontWeight:700,fontSize:8,letterSpacing:'0.1em',textAlign:'left',borderBottom:`1px solid ${C.border}`}}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {(bs.trades||[]).map((t,i)=>(
                    <tr key={i} style={{borderBottom:`1px solid ${C.border}`,background:i%2===0?'transparent':'#07101c'}}>
                      <td style={{padding:'7px 12px',color:C.sub,fontSize:8}}>{fTime(t.ts)}</td>
                      <td style={{padding:'7px 12px'}}><Tag color={t.type==='BUY'?C.green:t.type==='SELL'?C.blue:C.amber} small>{t.type}</Tag></td>
                      <td style={{padding:'7px 12px',color:COIN_COLORS[t.coin]||C.text,fontWeight:700}}>{t.coin||'—'}</td>
                      <td style={{padding:'7px 12px'}}>{t.strategy&&<Tag color={STRAT_COLORS[t.strategy]||C.sub} small>{t.strategy}</Tag>}</td>
                      <td style={{padding:'7px 12px',color:C.text}}>{fUSD(t.price)}</td>
                      <td style={{padding:'7px 12px',color:C.text}}>{fUSD(t.gross)}</td>
                      <td style={{padding:'7px 12px',color:C.sub}}>{fUSD(t.fee)}</td>
                      <td style={{padding:'7px 12px',color:t.pnl==null?C.sub:t.pnl>=0?C.green:C.red}}>{t.pnl!=null?`${t.pnl>=0?'+':''}${fUSD(t.pnl)}`:'—'}</td>
                      <td style={{padding:'7px 12px'}}><span style={{color:(t.confidence||0)>=7?C.green:(t.confidence||0)>=5?C.amber:C.red}}>{t.confidence||'—'}/10</span></td>
                      <td style={{padding:'7px 12px'}}><div style={{display:'flex',gap:3,flexWrap:'wrap'}}>{(t.signals||[]).slice(0,2).map((s,j)=><Tag key={j} color={C.cyan} small>{s}</Tag>)}</div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* POSITIONS */}
        {tab==='positions' && (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {Object.keys(bs.portfolio||{}).length===0
              ? <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:'40px',color:C.sub,textAlign:'center'}}>No open positions. Bot is in cash, waiting for high-conviction setups.</div>
              : Object.entries(bs.portfolio||{}).map(([sym,pos])=>{
                  const px=prices[sym]?.price, posVal=px?pos.qty*px:0;
                  const pnl=px?(px-pos.avgCost)*pos.qty:0, pnlP=pos.avgCost>0?((px||0)-pos.avgCost)/pos.avgCost*100:0;
                  const col=pnl>=0?C.green:C.red;
                  return(
                    <div key={sym} style={{background:C.card,border:`1px solid ${pnl>=0?C.green+'33':C.red+'33'}`,borderRadius:8,padding:'18px 20px'}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
                        <div style={{display:'flex',alignItems:'center',gap:10}}>
                          <span style={{color:COIN_COLORS[sym]||C.text,fontWeight:800,fontSize:26,fontFamily:'Sora'}}>{sym}</span>
                          <span style={{color:C.sub,fontSize:9}}>entered {fAge(pos.entryTime)}</span>
                        </div>
                        <div style={{textAlign:'right'}}>
                          <div style={{color:C.text,fontSize:20,fontWeight:700,fontFamily:'Sora'}}>{fUSD(posVal)}</div>
                          <div style={{color:col,fontSize:13}}>{pnl>=0?'+':''}{fUSD(pnl)} ({fPct(pnlP)})</div>
                        </div>
                      </div>
                      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10}}>
                        {[['Quantity',pos.qty.toFixed(6)],['Avg Cost',fUSD(pos.avgCost)],['Current Price',fUSD(px)],['Position Value',fUSD(posVal)]].map(([k,v])=>(
                          <div key={k} style={{background:C.dim,padding:'8px 12px',borderRadius:5}}>
                            <div style={{color:C.sub,fontSize:8}}>{k}</div>
                            <div style={{color:C.text,fontSize:12,fontWeight:600,marginTop:2}}>{v}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })
            }
          </div>
        )}

        {/* MARKET */}
        {tab==='market' && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))', gap:12 }}>
            {Object.entries(prices).map(([sym,data])=>{
              if(!data) return null;
              const held=bs.portfolio?.[sym], cc=COIN_COLORS[sym]||C.text, chg=data.change24h||0;
              return(
                <div key={sym} style={{background:C.card,border:`1px solid ${held?cc+'44':C.border}`,borderRadius:8,padding:'16px'}}>
                  {held&&<div style={{float:'right'}}><Tag color={cc} small>HELD</Tag></div>}
                  <div style={{color:cc,fontWeight:800,fontSize:22,fontFamily:'Sora'}}>{sym}</div>
                  <div style={{color:'#e8f4ff',fontSize:20,fontWeight:700,margin:'6px 0'}}>{fUSD(data.price)}</div>
                  <div style={{color:chg>=0?C.green:C.red,fontSize:12,marginBottom:8}}>{fPct(chg)} 24h</div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:5}}>
                    {[['HIGH',fUSD(data.high24h)],['LOW',fUSD(data.low24h)],['VOLUME',fUSD(data.volume24h)],['OPEN',fUSD(data.openPrice)]].map(([k,v])=>(
                      <div key={k} style={{background:C.dim,padding:'5px 8px',borderRadius:4}}>
                        <div style={{color:C.sub,fontSize:8}}>{k}</div>
                        <div style={{color:C.text,fontSize:10,fontWeight:600,marginTop:2}}>{v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ANALYTICS */}
        {tab==='analytics' && (
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
              <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:8, overflow:'hidden' }}>
                <Head>STRATEGY BREAKDOWN</Head>
                <div style={{ padding:'14px' }}>
                  {(()=>{ const s={}; (bs.trades||[]).forEach(t=>{if(t.strategy&&t.type!=='HOLD')s[t.strategy]=(s[t.strategy]||0)+1;}); const tot=Object.values(s).reduce((a,b)=>a+b,0)||1;
                    return Object.entries(s).sort((a,b)=>b[1]-a[1]).map(([st,n])=>(
                      <div key={st} style={{marginBottom:10}}>
                        <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}><Tag color={STRAT_COLORS[st]||C.sub} small>{st}</Tag><span style={{color:C.text,fontSize:10}}>{n} ({((n/tot)*100).toFixed(0)}%)</span></div>
                        <div style={{height:4,background:C.border,borderRadius:2}}><div style={{height:'100%',width:`${(n/tot)*100}%`,background:STRAT_COLORS[st]||C.sub,borderRadius:2}}/></div>
                      </div>
                    ));
                  })()}
                </div>
              </div>
              <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:8, overflow:'hidden' }}>
                <Head>COIN PERFORMANCE</Head>
                <div style={{ padding:'14px' }}>
                  {(()=>{ const cp={}; (bs.trades||[]).filter(t=>t.type==='SELL'&&t.pnl!=null).forEach(t=>{cp[t.coin]=(cp[t.coin]||0)+t.pnl;});
                    return Object.entries(cp).sort((a,b)=>b[1]-a[1]).map(([c,p])=>(
                      <div key={c} style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:`1px solid ${C.border}`}}>
                        <span style={{color:COIN_COLORS[c]||C.text,fontWeight:700,fontSize:12}}>{c}</span>
                        <span style={{color:p>=0?C.green:C.red,fontSize:12}}>{p>=0?'+':''}{fUSD(p)}</span>
                      </div>
                    ));
                  })()}
                </div>
              </div>
            </div>
            <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:8, overflow:'hidden' }}>
              <Head>TRADE P&L HISTORY</Head>
              <div style={{ padding:'14px', height:200 }}>
                {(()=>{ const d=(bs.trades||[]).filter(t=>t.type==='SELL'&&t.pnl!=null).slice(0,30).reverse().map((t,i)=>({i:i+1,pnl:+t.pnl.toFixed(4)}));
                  if(!d.length) return <div style={{color:C.sub,textAlign:'center',paddingTop:70,fontSize:12}}>No closed trades yet.</div>;
                  return <ResponsiveContainer width="100%" height="100%"><BarChart data={d}><XAxis dataKey="i" hide/><YAxis hide/><Tooltip contentStyle={{background:C.card,border:`1px solid ${C.border}`,fontSize:10}} formatter={v=>[fUSD(v),'P&L']}/><ReferenceLine y={0} stroke={C.sub}/><Bar dataKey="pnl" fill={C.green} radius={[2,2,0,0]}/></BarChart></ResponsiveContainer>;
                })()}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer risk disclaimer */}
      <div style={{ padding:'12px 20px', borderTop:`1px solid ${C.border}`, textAlign:'center', color:C.sub, fontSize:9 }}>
        ⚠ PAPER TRADING MODE ACTIVE · Real trading involves substantial risk of loss · NEXUS is not a financial adviser · Past performance does not guarantee future results
      </div>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;700&family=Sora:wght@400;600;800&display=swap');::-webkit-scrollbar{width:3px}::-webkit-scrollbar-track{background:${C.bg}}::-webkit-scrollbar-thumb{background:${C.border}}`}</style>
    </div>
  );
}
