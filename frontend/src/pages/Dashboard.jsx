import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, BarChart, Bar } from 'recharts';
import { useAuth, useBotSocket } from '../lib/auth.jsx';
import { api } from '../lib/api.js';

// ── Design System ─────────────────────────────────────────────────────────────
const T = {
  bg:'#030407', card:'#08090e', card2:'#0c0e16',
  b:'#ffffff0a', b2:'#ffffff14',
  g:'#00d68f', r:'#f5365c', a:'#fb923c', bl:'#3b82f6', pu:'#8b5cf6', cy:'#06b6d4',
  tx:'#e2e8f0', mu:'#64748b', su:'#1e293b',
};
const CC = {BTC:'#f7931a',ETH:'#627eea',SOL:'#9945ff',XRP:'#00aae4',BNB:'#f0b90b',AVAX:'#e84142',DOT:'#e6007a',LINK:'#2a5ada',ADA:'#3cc8c8',LTC:'#bfbbbb',ATOM:'#6f7390',UNI:'#ff007a',MATIC:'#8247e5',NEAR:'#00c08b',APT:'#22c55e',ARB:'#12aaff',OP:'#ff0420',INJ:'#00b7e9',SUI:'#4da2ff',SEI:'#cc2936',TIA:'#7c3aed',DOGE:'#c2a633',FET:'#1d1d1b',RENDER:'#ff5c00',WLD:'#101010',JUP:'#c8f284',PYTH:'#9945ff',ENA:'#1a1a2e',ONDO:'#1a6aff',STRK:'#ec796b',EIGEN:'#1a1a1a',W:'#0052cc',SHIB:'#e85c0d'};
const SC = {PRECISION:T.bl,MOMENTUM:T.cy,REVERSAL:T.pu,BREAKOUT:T.a,SWING:T.g,AGGRESSIVE:T.r,DCA_PLUS:'#22c55e'};
const LC = {CYCLE:'#334155',MARKET:'#1a2535',AI:T.pu,SIGNAL:T.g,REASONING:T.tx,TRADE:T.g,PROFIT:T.g,LOSS:T.r,POSITION:T.a,HOLD:T.mu,WARN:T.a,ERROR:T.r,SYSTEM:T.bl,INFO:T.mu};

const fD = (n,d=2)=>n==null||isNaN(n)?'—':n.toFixed(d);
const fUSD = n=>{if(n==null||isNaN(n))return'$—';const a=Math.abs(n);if(a>=1e6)return`$${(n/1e6).toFixed(2)}M`;if(a>=1000)return`$${n.toLocaleString('en-US',{maximumFractionDigits:2})}`;if(a>=1)return`$${n.toFixed(2)}`;return`$${n.toFixed(4)}`;};
const fPct = n=>n==null?'—':`${n>=0?'+':''}${n.toFixed(2)}%`;
const fT = iso=>!iso?'—':new Date(iso).toLocaleTimeString('en-US',{hour12:false,hour:'2-digit',minute:'2-digit'});
const fAge = iso=>{if(!iso)return'—';const d=(Date.now()-new Date(iso))/1000;if(d<60)return`${~~d}s`;if(d<3600)return`${~~(d/60)}m`;return`${~~(d/3600)}h`;};

function useMobile(){const[m,s]=useState(window.innerWidth<768);useEffect(()=>{const h=()=>s(window.innerWidth<768);window.addEventListener('resize',h);return()=>window.removeEventListener('resize',h);},[]);return m;}

// ── Atoms ─────────────────────────────────────────────────────────────────────
const Chip=memo(({c,children,sm})=><span style={{background:c+'18',color:c,border:`1px solid ${c}25`,padding:sm?'2px 7px':'4px 10px',borderRadius:20,fontSize:sm?9:11,fontWeight:700,letterSpacing:'0.03em',display:'inline-block',whiteSpace:'nowrap'}}>{children}</span>);

const Btn=memo(({onClick,children,variant='ghost',color,size='md',disabled,full,active})=>{
  const bg=variant==='solid'?(active?color||T.g:color||T.g):active?`${color||T.g}18`:'transparent';
  const fg=variant==='solid'?'#000':(active?color||T.g:color||T.mu);
  const bd=`1px solid ${active?(color||T.g)+'44':T.b}`;
  const pad=size==='xs'?'4px 10px':size==='sm'?'6px 14px':'9px 18px';
  return <button onClick={onClick} disabled={disabled} style={{background:bg,color:fg,border:bd,padding:pad,borderRadius:8,cursor:disabled?'not-allowed':'pointer',fontFamily:'inherit',fontSize:size==='xs'?10:size==='sm'?12:13,fontWeight:700,opacity:disabled?0.35:1,width:full?'100%':'auto',transition:'background 0.15s,color 0.15s',whiteSpace:'nowrap'}}>{children}</button>;
});

const Card=memo(({label,value,sub,color,accent})=>(
  <div style={{background:T.card,borderRadius:12,padding:'14px 16px',border:`1px solid ${accent?color+'30':T.b}`,boxShadow:accent?`0 0 16px ${color}14`:'none'}}>
    <div style={{color:T.mu,fontSize:9,fontWeight:600,letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:5}}>{label}</div>
    <div style={{fontSize:20,fontWeight:800,color:color||T.tx,letterSpacing:'-0.02em',lineHeight:1}}>{value}</div>
    {sub&&<div style={{color:T.mu,fontSize:10,marginTop:4}}>{sub}</div>}
  </div>
));

const Panel=memo(({title,right,children,pad=true})=>(
  <div style={{background:T.card,border:`1px solid ${T.b}`,borderRadius:12,overflow:'hidden'}}>
    <div style={{padding:'9px 14px',borderBottom:`1px solid ${T.b}`,display:'flex',justifyContent:'space-between',alignItems:'center',background:'#050609'}}>
      <span style={{color:T.mu,fontSize:9,fontWeight:700,letterSpacing:'0.1em',textTransform:'uppercase'}}>{title}</span>
      {right&&<span style={{color:T.mu,fontSize:9}}>{right}</span>}
    </div>
    {pad?<div style={{padding:14}}>{children}</div>:children}
  </div>
));

const Toggle=memo(({label,checked,onChange,color=T.pu})=>(
  <label style={{display:'flex',alignItems:'center',justifyContent:'space-between',cursor:'pointer',padding:'10px 0'}}>
    <span style={{color:T.tx,fontSize:13}}>{label}</span>
    <div onClick={()=>onChange(!checked)} style={{width:40,height:22,borderRadius:11,background:checked?color:'#1e293b',border:`1px solid ${checked?color:'#334155'}`,position:'relative',transition:'all 0.2s',cursor:'pointer',flexShrink:0}}>
      <div style={{width:16,height:16,borderRadius:'50%',background:'#fff',position:'absolute',top:2,left:checked?20:2,transition:'left 0.2s',boxShadow:'0 1px 4px #0004'}}/>
    </div>
  </label>
));

// ── Settings Modal ─────────────────────────────────────────────────────────────
const SettingsModal=memo(({user,strategies,onClose,onSave})=>{
  const [f,setF]=useState({
    maxTradeUSD:   user.maxTradeUSD||20,
    stopLossPct:   +((user.stopLossPct||0.05)*100).toFixed(1),
    takeProfitPct: +((user.takeProfitPct||0.08)*100).toFixed(1),
    maxDrawdownPct:+((user.maxDrawdownPct||0.20)*100).toFixed(0),
    maxPositionPct:+((user.maxPositionPct||0.35)*100).toFixed(0),
    startingBalance:user.startingBalance||100,
    botMode:       user.botMode||'PAPER',
    tradingStrategy:user.tradingStrategy||'PRECISION',
    leverageEnabled:user.leverageEnabled||false,
    maxLeverage:   user.maxLeverage||3,
  });
  const [saving,setSaving]=useState(false);
  const [err,setErr]=useState('');
  const set=(k,v)=>setF(p=>({...p,[k]:v}));

  async function save(){
    setSaving(true);setErr('');
    try{
      await onSave({
        maxTradeUSD:   +f.maxTradeUSD,
        stopLossPct:   +f.stopLossPct/100,
        takeProfitPct: +f.takeProfitPct/100,
        maxDrawdownPct:+f.maxDrawdownPct/100,
        maxPositionPct:+f.maxPositionPct/100,
        startingBalance:+f.startingBalance,
        botMode:f.botMode,
        tradingStrategy:f.tradingStrategy,
        leverageEnabled:f.leverageEnabled,
        maxLeverage:+f.maxLeverage,
      });
      onClose();
    }catch(e){setErr(e.message);}
    setSaving(false);
  }

  const inp={background:T.bg,border:`1px solid ${T.b2}`,borderRadius:8,padding:'9px 12px',color:T.tx,fontFamily:'inherit',fontSize:13,width:'100%',outline:'none',boxSizing:'border-box',fontWeight:500};
  const selectedStrat=strategies.find(s=>s.key===f.tradingStrategy);

  return(
    <div style={{position:'fixed',inset:0,background:'#000000d0',zIndex:500,display:'flex',alignItems:'center',justifyContent:'center',padding:16}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:T.card2,border:`1px solid ${T.b2}`,borderRadius:16,width:'100%',maxWidth:520,maxHeight:'90vh',overflowY:'auto',padding:24}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:22}}>
          <div style={{color:T.tx,fontSize:18,fontWeight:800}}>Bot Settings</div>
          <button onClick={onClose} style={{color:T.mu,background:'none',border:'none',fontSize:24,cursor:'pointer',lineHeight:1}}>×</button>
        </div>

        {err&&<div style={{color:T.r,fontSize:12,marginBottom:14,padding:'9px 12px',background:'#f5365c15',borderRadius:8}}>{err}</div>}

        {/* Strategy selector */}
        <div style={{marginBottom:20}}>
          <div style={{color:T.mu,fontSize:10,fontWeight:700,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:10}}>Trading Strategy</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            {strategies.map(s=>(
              <button key={s.key} onClick={()=>set('tradingStrategy',s.key)}
                style={{background:f.tradingStrategy===s.key?(SC[s.key]||T.bl)+'18':'#ffffff04',border:`1.5px solid ${f.tradingStrategy===s.key?(SC[s.key]||T.bl):'#ffffff0a'}`,borderRadius:10,padding:'10px 12px',cursor:'pointer',textAlign:'left',transition:'all 0.15s'}}>
                <div style={{color:f.tradingStrategy===s.key?(SC[s.key]||T.bl):T.tx,fontWeight:700,fontSize:12,marginBottom:3}}>{s.name}</div>
                <div style={{color:T.mu,fontSize:10,lineHeight:1.4}}>{s.description}</div>
              </button>
            ))}
          </div>
          {selectedStrat&&<div style={{marginTop:10,padding:'8px 12px',background:`${SC[selectedStrat.key]||T.bl}12`,borderRadius:8,border:`1px solid ${SC[selectedStrat.key]||T.bl}25`}}>
            <span style={{color:SC[selectedStrat.key]||T.bl,fontSize:11,fontWeight:600}}>Active: {selectedStrat.name} — {selectedStrat.description}</span>
          </div>}
        </div>

        {/* Trade parameters */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}}>
          {[['Max Trade ($)','maxTradeUSD',5,100000,'dollar'],['Start Balance ($)','startingBalance',1,1000000,'dollar'],['Stop Loss (%)','stopLossPct',0.1,50,'percent'],['Take Profit (%)','takeProfitPct',0.5,200,'percent'],['Max Drawdown (%)','maxDrawdownPct',5,90,'percent'],['Max Position (%)','maxPositionPct',5,100,'percent']].map(([l,k,mn,mx,t])=>(
            <div key={k}>
              <div style={{color:T.mu,fontSize:10,fontWeight:600,letterSpacing:'0.07em',textTransform:'uppercase',marginBottom:5}}>{l}</div>
              <input type="number" min={mn} max={mx} step="0.5" value={f[k]} onChange={e=>set(k,e.target.value)} style={inp}/>
            </div>
          ))}
        </div>

        {/* Mode */}
        <div style={{marginBottom:16}}>
          <div style={{color:T.mu,fontSize:10,fontWeight:700,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:8}}>Trading Mode</div>
          <div style={{display:'flex',gap:8}}>
            {['PAPER','LIVE'].map(m=>(
              <Btn key={m} onClick={()=>set('botMode',m)} active={f.botMode===m} color={m==='LIVE'?T.r:T.bl} variant="ghost" size="sm">{m==='LIVE'?'🔴 Live (Real Money)':'📄 Paper (Safe)'}</Btn>
            ))}
          </div>
          {f.botMode==='LIVE'&&<div style={{marginTop:8,padding:'8px 12px',background:'#f5365c12',borderRadius:7,border:'1px solid #f5365c25',color:'#f5365c',fontSize:11}}>⚠ Live mode executes real trades. Connect exchange API keys first.</div>}
        </div>

        {/* Leverage */}
        <div style={{borderTop:`1px solid ${T.b}`,paddingTop:14,marginBottom:16}}>
          <Toggle label="Enable Leverage / Perpetuals" checked={f.leverageEnabled} onChange={v=>set('leverageEnabled',v)} color={T.pu}/>
          {f.leverageEnabled&&(
            <div style={{marginTop:10}}>
              <div style={{color:T.mu,fontSize:10,fontWeight:600,marginBottom:6}}>MAX LEVERAGE</div>
              <div style={{display:'flex',gap:6}}>
                {[2,3,5,10,20].map(n=>(
                  <Btn key={n} onClick={()=>set('maxLeverage',n)} active={+f.maxLeverage===n} color={T.pu} size="xs">{n}x</Btn>
                ))}
              </div>
              <div style={{color:T.a,fontSize:11,marginTop:8}}>⚠ Leverage amplifies both gains and losses. Only enabled on confidence ≥8/10.</div>
            </div>
          )}
        </div>

        <div style={{display:'flex',gap:10}}>
          <Btn onClick={save} disabled={saving} variant="solid" color={T.g} full size="sm">{saving?'Saving…':'Save & Apply'}</Btn>
          <Btn onClick={onClose} size="sm">Cancel</Btn>
        </div>
      </div>
    </div>
  );
});

// ── Main Dashboard ─────────────────────────────────────────────────────────────
export default function Dashboard(){
  const { user, logout, refreshUser, setUser } = useAuth();
  const { botState, prices, botLog, strategies, connected } = useBotSocket();
  const nav = useNavigate();
  const isMobile = useMobile();
  const [tab, setTab]       = useState('overview');
  const [showSet, setShowSet] = useState(false);
  const [curve, setCurve]   = useState([]);
  const [busy, setBusy]     = useState(false);
  const [billing, setBilling] = useState(null);
  const logRef = useRef(null);

  useEffect(()=>{ if(!user){nav('/login');return;} api.billingStatus().then(setBilling).catch(()=>{}); },[user]);
  useEffect(()=>{
    if(!botState?.trades)return;
    let v=botState.startingBalance||100;
    const c=[{i:0,v}];
    [...botState.trades].reverse().forEach((t,i)=>{if(t.type==='SELL'&&t.pnl!=null){v+=t.pnl;c.push({i:i+1,v:+v.toFixed(4)});}});
    setCurve(c);
  },[botState?.trades?.length]);
  useEffect(()=>{if(logRef.current)logRef.current.scrollTop=logRef.current.scrollHeight;},[botLog?.length]);

  const ctrl=useCallback(async act=>{
    setBusy(true);
    try{act==='start'?await api.botStart():act==='stop'?await api.botStop():await api.botReset();}catch(e){alert(e.message);}
    setTimeout(()=>setBusy(false),800);
  },[]);

  const saveSettings=useCallback(async data=>{
    const r=await api.botSettings(data);
    if(r.user&&setUser)setUser(r.user);
  },[setUser]);

  if(!user)return null;

  const bs=botState||{};
  const port=bs.portfolio||{};
  const trades=bs.trades||[];
  let tv=bs.balance||0;
  for(const[s,p]of Object.entries(port))tv+=(p.qty||0)*(prices[s]?.price||0);
  const pnl=tv-(bs.startingBalance||100);
  const pnlPct=(pnl/(bs.startingBalance||100))*100;
  const dd=bs.peakValue>0?((bs.peakValue-tv)/bs.peakValue*100):0;
  const sells=trades.filter(t=>t.type==='SELL');
  const wins=sells.filter(t=>t.pnl>0).length;
  const wr=sells.length?`${((wins/sells.length)*100).toFixed(0)}%`:'—';
  const running=['running','cycling'].includes(bs.status);
  const strat=user.tradingStrategy||'PRECISION';
  const stratColor=SC[strat]||T.bl;
  const tdl=billing?.trialDaysLeft??14;
  const TABS=isMobile?['overview','log','trades','market']:['overview','live log','trades','positions','market','analytics'];

  return(
    <div style={{minHeight:'100vh',background:T.bg,color:T.tx,fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"}}>
      <style>{`
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:3px;height:3px}::-webkit-scrollbar-thumb{background:#1e293b;border-radius:2px}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
        @keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
        button{font-family:inherit}
        input,select{font-family:inherit}
        .tab-btn:hover{color:#00d68f!important}
        .row-hover:hover{background:#ffffff05!important}
      `}</style>

      {showSet&&strategies.length>0&&<SettingsModal user={user} strategies={strategies} onClose={()=>setShowSet(false)} onSave={saveSettings}/>}

      {/* Trial banner */}
      {billing?.plan==='trial'&&tdl<=5&&(
        <div style={{background:'#fb923c12',borderBottom:'1px solid #fb923c20',padding:'8px 16px',display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8}}>
          <span style={{color:T.a,fontSize:12}}>⏰ Trial ends in <strong>{tdl} days</strong></span>
          <button onClick={async()=>{const d=await api.billingCheckout();location.href=d.url;}} style={{background:T.a,color:'#000',border:'none',borderRadius:6,padding:'5px 14px',fontWeight:800,cursor:'pointer',fontSize:11}}>Subscribe $29.99/mo →</button>
        </div>
      )}

      {/* Risk bar */}
      <div style={{background:'#f5365c06',borderBottom:'1px solid #f5365c15',padding:'4px 16px',textAlign:'center'}}>
        <span style={{color:'#f5365c60',fontSize:10}}>⚠ Crypto trading involves substantial risk. NEXUS is not a financial adviser. All trades may result in losses.</span>
      </div>

      {/* Header */}
      <header style={{background:T.card,borderBottom:`1px solid ${T.b}`,padding:isMobile?'10px 14px':'10px 20px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,position:'sticky',top:0,zIndex:100}}>
        <div style={{display:'flex',alignItems:'center',gap:10,minWidth:0}}>
          <div style={{display:'flex',alignItems:'center',gap:6}}>
            <div style={{width:8,height:8,borderRadius:'50%',background:running?T.g:T.mu,boxShadow:running?`0 0 8px ${T.g}`:'none',animation:running?'pulse 2s infinite':'none',flexShrink:0}}/>
            <span style={{color:T.g,fontWeight:800,fontSize:15,letterSpacing:'-0.02em'}}>NEXUS</span>
          </div>
          {!isMobile&&<>
            <Chip c={stratColor} sm>{strat}</Chip>
            <span style={{color:T.mu,fontSize:11}}>MODE: <span style={{color:user.botMode==='LIVE'?T.r:T.bl,fontWeight:600}}>{user.botMode||'PAPER'}</span></span>
            <span style={{color:running?T.g:T.mu,fontSize:11,fontWeight:600}}>{(bs.status||'idle').toUpperCase()}</span>
          </>}
        </div>
        <div style={{display:'flex',alignItems:'center',gap:6,flexShrink:0}}>
          {!isMobile&&<div style={{textAlign:'right',marginRight:6}}>
            <div style={{color:pnl>=0?T.g:T.r,fontSize:16,fontWeight:800,letterSpacing:'-0.02em'}}>{fUSD(tv)}</div>
            <div style={{color:pnl>=0?T.g:T.r,fontSize:10}}>{pnl>=0?'+':''}{fUSD(pnl)} ({fPct(pnlPct)})</div>
          </div>}
          {running
            ?<Btn onClick={()=>ctrl('stop')} variant="ghost" color={T.r} size="sm" disabled={busy}>◼ Stop</Btn>
            :<Btn onClick={()=>ctrl('start')} variant="solid" color={T.g} size="sm" disabled={busy}>▶ Start</Btn>
          }
          <Btn onClick={()=>setShowSet(true)} size="sm">⚙{!isMobile&&' Settings'}</Btn>
          {!isMobile&&<Btn onClick={()=>ctrl('reset')} size="sm" color={T.mu}>↺</Btn>}
          <button onClick={()=>{logout();nav('/');}} style={{color:T.mu,background:'none',border:'none',fontSize:11,padding:'4px 8px',cursor:'pointer'}}>Out</button>
        </div>
      </header>

      {/* Mobile value strip */}
      {isMobile&&(
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:6,padding:'10px 12px',borderBottom:`1px solid ${T.b}`}}>
          {[{l:'VALUE',v:fUSD(tv),c:pnl>=0?T.g:T.r},{l:'P&L',v:`${pnl>=0?'+':''}${fUSD(pnl)}`,c:pnl>=0?T.g:T.r},{l:'WIN',v:wr,c:T.tx},{l:strat,v:running?'●':'○',c:running?T.g:T.mu}].map(s=>(
            <div key={s.l} style={{background:T.card,borderRadius:8,padding:'8px 10px',textAlign:'center'}}>
              <div style={{color:T.mu,fontSize:8,fontWeight:700,marginBottom:2,textTransform:'uppercase'}}>{s.l}</div>
              <div style={{color:s.c,fontSize:13,fontWeight:800}}>{s.v}</div>
            </div>
          ))}
        </div>
      )}

      {/* Desktop stats */}
      {!isMobile&&(
        <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:1,background:T.b}}>
          {[
            {label:'PORTFOLIO',value:fUSD(tv),sub:`started ${fUSD(bs.startingBalance)}`,color:pnl>=0?T.g:T.r,accent:pnl>0},
            {label:'CASH',value:fUSD(bs.balance),sub:`${tv>0?((bs.balance/tv)*100).toFixed(0):0}% liquid`},
            {label:'ALL-TIME P&L',value:`${pnl>=0?'+':''}${fUSD(pnl)}`,sub:fPct(pnlPct),color:pnl>=0?T.g:T.r},
            {label:'WIN RATE',value:wr,sub:`${wins}W / ${sells.length-wins}L`,color:parseInt(wr)>=60?T.g:T.r},
            {label:'DRAWDOWN',value:fPct(-dd),sub:`peak ${fUSD(bs.peakValue)}`,color:dd>15?T.r:dd>8?T.a:T.g},
            {label:'FEES',value:fUSD(bs.totalFeesUSD),sub:`${bs.cycleCount||0} cycles`},
            {label:'OPEN POS',value:Object.keys(port).length,sub:`${trades.length} trades · ${strat}`},
          ].map((s,i)=>(
            <div key={i} style={{background:T.card,padding:'11px 14px'}}>
              <div style={{color:T.mu,fontSize:8,fontWeight:700,letterSpacing:'0.1em',marginBottom:3,textTransform:'uppercase'}}>{s.label}</div>
              <div style={{fontSize:17,fontWeight:800,color:s.color||T.tx,letterSpacing:'-0.02em'}}>{s.value}</div>
              <div style={{color:T.mu,fontSize:9,marginTop:2}}>{s.sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{background:T.card,borderBottom:`1px solid ${T.b}`,padding:`0 ${isMobile?'12px':'20px'}`,display:'flex',overflowX:'auto',gap:0,WebkitOverflowScrolling:'touch'}}>
        {TABS.map(t=>(
          <button key={t} className="tab-btn" onClick={()=>setTab(t)}
            style={{background:'transparent',border:'none',padding:isMobile?'9px 11px':'9px 14px',color:tab===t?T.g:T.mu,fontSize:isMobile?10:11,fontWeight:700,cursor:'pointer',borderBottom:tab===t?`2px solid ${T.g}`:'2px solid transparent',whiteSpace:'nowrap',textTransform:'uppercase',letterSpacing:'0.06em',transition:'color 0.15s'}}>
            {t}
          </button>
        ))}
      </div>

      <div style={{padding:isMobile?'12px':16}}>

        {/* OVERVIEW */}
        {tab==='overview'&&(
          <div style={{display:'flex',flexDirection:'column',gap:14}}>
            <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'5fr 3fr',gap:14}}>
              <Panel title="Equity Curve" right={`${curve.length} pts`} pad={false}>
                <div style={{padding:'12px 14px',height:200}}>
                  {curve.length<2
                    ?<div style={{color:T.mu,textAlign:'center',paddingTop:60,fontSize:13}}>Equity curve builds after first sell trades.</div>
                    :<ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={curve}>
                        <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={pnl>=0?T.g:T.r} stopOpacity={0.2}/><stop offset="95%" stopColor={pnl>=0?T.g:T.r} stopOpacity={0}/></linearGradient></defs>
                        <XAxis dataKey="i" hide/><YAxis domain={['auto','auto']} hide/>
                        <Tooltip contentStyle={{background:T.card2,border:`1px solid ${T.b2}`,borderRadius:8,fontSize:11,color:T.tx}} formatter={v=>[fUSD(v),'Value']}/>
                        <ReferenceLine y={bs.startingBalance} stroke={T.su} strokeDasharray="4 4"/>
                        <Area type="monotone" dataKey="v" stroke={pnl>=0?T.g:T.r} strokeWidth={2} fill="url(#g)"/>
                      </AreaChart>
                    </ResponsiveContainer>}
                </div>
              </Panel>

              <Panel title="Last Decision" pad={false}>
                {(()=>{
                  const t=trades[0];
                  if(!t)return<div style={{padding:'24px 14px',color:T.mu,fontSize:13}}>Start bot to see decisions.</div>;
                  const ac=t.type==='BUY'?T.g:t.type==='SELL'?(t.pnl>=0?T.bl:T.r):T.mu;
                  return(
                    <div style={{padding:'12px 14px'}}>
                      <div style={{display:'flex',gap:7,alignItems:'center',flexWrap:'wrap',marginBottom:10}}>
                        <Chip c={ac}>{t.type}</Chip>
                        {t.coin&&<span style={{color:CC[t.coin]||T.tx,fontWeight:800,fontSize:18}}>{t.coin}</span>}
                        {t.strategy&&<Chip c={SC[t.strategy]||T.mu} sm>{t.strategy}</Chip>}
                        <span style={{color:T.mu,fontSize:9,marginLeft:'auto'}}>{fAge(t.ts)} ago</span>
                      </div>
                      {t.type!=='HOLD'&&(
                        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,marginBottom:10}}>
                          {[['Price',fUSD(t.price),''],['Amount',fUSD(t.gross),''],['Fee',fUSD(t.fee),''],['P&L',t.pnl!=null?`${t.pnl>=0?'+':''}${fUSD(t.pnl)}`:fD(t.qty,5),t.pnl!=null?(t.pnl>=0?T.g:T.r):'']].map(([k,v,c])=>(
                            <div key={k} style={{background:'#ffffff04',padding:'6px 9px',borderRadius:7}}>
                              <div style={{color:T.mu,fontSize:8,marginBottom:2}}>{k}</div>
                              <div style={{color:c||T.tx,fontSize:12,fontWeight:700}}>{v}</div>
                            </div>
                          ))}
                        </div>
                      )}
                      <div style={{display:'flex',gap:4,flexWrap:'wrap',marginBottom:8}}>
                        {(t.signals||[]).slice(0,3).map((s,i)=><Chip key={i} c={T.cy} sm>{s}</Chip>)}
                      </div>
                      <div style={{color:'#475569',fontSize:10,lineHeight:1.8,borderLeft:`2px solid ${T.su}`,paddingLeft:9}}>{t.reasoning}</div>
                    </div>
                  );
                })()}
              </Panel>
            </div>

            <Panel title="Decision Feed" right={`${trades.length} total`} pad={false}>
              <div style={{maxHeight:300,overflowY:'auto'}}>
                {trades.slice(0,60).map((t,i)=>{
                  const ac=t.type==='BUY'?T.g:t.type==='SELL'?(t.pnl>=0?T.bl:T.r):T.mu;
                  return(
                    <div key={i} className="row-hover" style={{padding:isMobile?'9px 12px':'7px 14px',borderBottom:`1px solid ${T.b}`,display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}>
                      <div style={{display:'flex',gap:7,alignItems:'center',flex:1,minWidth:0}}>
                        <Chip c={ac} sm>{t.type}</Chip>
                        {t.coin&&<span style={{color:CC[t.coin]||T.tx,fontWeight:700,fontSize:12,minWidth:32,flexShrink:0}}>{t.coin}</span>}
                        {!isMobile&&t.strategy&&<Chip c={SC[t.strategy]||T.mu} sm>{t.strategy}</Chip>}
                        {!isMobile&&<span style={{color:T.mu,fontSize:10,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.reasoning?.slice(0,70)}…</span>}
                      </div>
                      <div style={{display:'flex',gap:8,alignItems:'center',flexShrink:0}}>
                        {t.type!=='HOLD'&&<span style={{color:T.mu,fontSize:10}}>{fUSD(t.gross)}</span>}
                        {t.pnl!=null&&<span style={{color:t.pnl>=0?T.g:T.r,fontSize:11,fontWeight:700}}>{t.pnl>=0?'+':''}{fUSD(t.pnl)}</span>}
                        <span style={{color:'#334155',fontSize:9}}>{fT(t.ts)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Panel>
          </div>
        )}

        {/* LIVE LOG */}
        {(tab==='live log'||tab==='log')&&(
          <Panel title="Bot Reasoning Log · Real-Time" right={`${botLog?.length||0} entries`} pad={false}>
            <div ref={logRef} style={{height:isMobile?'calc(100vh-260px)':'calc(100vh-300px)',overflowY:'auto',background:'#020306',fontFamily:"'SF Mono','Fira Code',monospace",padding:'4px 0'}}>
              {(!botLog||!botLog.length)&&<div style={{padding:20,color:T.mu,fontSize:12}}>Log appears when bot starts.</div>}
              {(botLog||[]).map((e,i)=>{
                const lc=LC[e.level]||T.mu,big=['TRADE','PROFIT','LOSS','REASONING','CYCLE'].includes(e.level);
                return(
                  <div key={i} style={{padding:big?'6px 14px':'2px 14px',borderBottom:big?`1px solid ${T.b}`:'none',background:big?'#050a18':'transparent',display:'flex',gap:8,alignItems:'flex-start'}}>
                    <span style={{color:'#1e293b',fontSize:9,flexShrink:0,paddingTop:1}}>{fT(e.ts)}</span>
                    <span style={{color:lc,fontSize:9,fontWeight:700,minWidth:56,flexShrink:0}}>[{e.level}]</span>
                    <span style={{color:big?T.tx:'#475569',fontSize:big?11:9,lineHeight:1.6}}>{e.msg}</span>
                  </div>
                );
              })}
            </div>
          </Panel>
        )}

        {/* TRADES */}
        {tab==='trades'&&(
          <Panel title="Trade History" right={`${trades.length} records`} pad={false}>
            <div style={{overflowX:'auto',WebkitOverflowScrolling:'touch'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
                <thead><tr style={{background:'#050609'}}>
                  {(isMobile?['TIME','TYPE','COIN','P&L']:['TIME','TYPE','COIN','STRATEGY','PRICE','AMOUNT','FEE','P&L','CONF']).map(h=>(
                    <th key={h} style={{padding:'8px 11px',color:T.mu,fontWeight:700,fontSize:8,letterSpacing:'0.1em',textAlign:'left',borderBottom:`1px solid ${T.b}`,whiteSpace:'nowrap'}}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {trades.map((t,i)=>(
                    <tr key={i} className="row-hover" style={{borderBottom:`1px solid ${T.b}`}}>
                      <td style={{padding:'7px 11px',color:T.mu,fontSize:9,whiteSpace:'nowrap'}}>{fT(t.ts)}</td>
                      <td style={{padding:'7px 11px'}}><Chip c={t.type==='BUY'?T.g:t.type==='SELL'?T.bl:T.mu} sm>{t.type}</Chip></td>
                      <td style={{padding:'7px 11px',color:CC[t.coin]||T.tx,fontWeight:700}}>{t.coin||'—'}</td>
                      {!isMobile&&<td style={{padding:'7px 11px'}}>{t.strategy&&<Chip c={SC[t.strategy]||T.mu} sm>{t.strategy}</Chip>}</td>}
                      {!isMobile&&<td style={{padding:'7px 11px',color:T.tx}}>{fUSD(t.price)}</td>}
                      {!isMobile&&<td style={{padding:'7px 11px',color:T.tx}}>{fUSD(t.gross)}</td>}
                      {!isMobile&&<td style={{padding:'7px 11px',color:T.mu}}>{fUSD(t.fee)}</td>}
                      <td style={{padding:'7px 11px',color:t.pnl==null?T.mu:t.pnl>=0?T.g:T.r,fontWeight:700}}>{t.pnl!=null?`${t.pnl>=0?'+':''}${fUSD(t.pnl)}`:'—'}</td>
                      {!isMobile&&<td style={{padding:'7px 11px',color:(t.confidence||0)>=7?T.g:(t.confidence||0)>=5?T.a:T.r}}>{t.confidence||'—'}/10</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        )}

        {/* POSITIONS */}
        {tab==='positions'&&(
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            {!Object.keys(port).length
              ?<Panel title="Open Positions"><div style={{color:T.mu,fontSize:13,padding:'24px 0',textAlign:'center'}}>No open positions. Bot waiting for {strat} setup.</div></Panel>
              :Object.entries(port).map(([sym,pos])=>{
                const px=prices[sym]?.price,pv=px?pos.qty*px:0;
                const pp=px?(px-pos.avgCost)*pos.qty:0,ppp=pos.avgCost>0?((px||0)-pos.avgCost)/pos.avgCost*100:0;
                return(
                  <div key={sym} style={{background:T.card,border:`1px solid ${pp>=0?T.g+'28':T.r+'28'}`,borderRadius:12,padding:'16px 18px',display:'grid',gridTemplateColumns:isMobile?'1fr 1fr':'auto 1fr 1fr 1fr 1fr 1fr',gap:12,alignItems:'center'}}>
                    <div style={{width:38,height:38,borderRadius:10,background:(CC[sym]||T.tx)+'18',display:'flex',alignItems:'center',justifyContent:'center',color:CC[sym]||T.tx,fontWeight:800,fontSize:10}}>{sym.slice(0,3)}</div>
                    <div><div style={{color:CC[sym]||T.tx,fontWeight:800,fontSize:18}}>{sym}</div><div style={{color:T.mu,fontSize:10}}>{fAge(pos.entryTime)} ago</div></div>
                    {[['Qty',pos.qty.toFixed(5),''],['Avg',fUSD(pos.avgCost),''],['Now',fUSD(px),''],['Value',fUSD(pv),''],['P&L',`${pp>=0?'+':''}${fUSD(pp)} (${fPct(ppp)})`,pp>=0?T.g:T.r]].map(([k,v,c])=>(
                      <div key={k}><div style={{color:T.mu,fontSize:8,fontWeight:600,marginBottom:2,textTransform:'uppercase'}}>{k}</div><div style={{color:c||T.tx,fontSize:12,fontWeight:700}}>{v}</div></div>
                    ))}
                  </div>
                );
              })
            }
          </div>
        )}

        {/* MARKET */}
        {tab==='market'&&(
          <div style={{display:'grid',gridTemplateColumns:`repeat(${isMobile?2:4},1fr)`,gap:10}}>
            {Object.entries(prices).map(([sym,d])=>{
              if(!d)return null;
              const held=port[sym],cc=CC[sym]||T.tx,chg=d.change24h||0;
              return(
                <div key={sym} style={{background:T.card,border:`1px solid ${held?cc+'30':T.b}`,borderRadius:10,padding:isMobile?'12px':'15px',transition:'border-color 0.15s'}}>
                  {held&&<div style={{float:'right'}}><Chip c={cc} sm>HELD</Chip></div>}
                  <div style={{color:cc,fontWeight:800,fontSize:isMobile?14:16,marginBottom:2}}>{sym}</div>
                  <div style={{color:T.tx,fontSize:isMobile?14:17,fontWeight:700,marginBottom:2}}>{fUSD(d.price)}</div>
                  <div style={{color:chg>=0?T.g:T.r,fontSize:11,marginBottom:isMobile?0:8}}>{fPct(chg)} 24h</div>
                  {!isMobile&&(
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:4,marginTop:8}}>
                      {[['H',fUSD(d.high24h)],['L',fUSD(d.low24h)],['VOL',fUSD(d.volume24h)],['O',fUSD(d.openPrice)]].map(([k,v])=>(
                        <div key={k} style={{background:'#ffffff04',padding:'4px 7px',borderRadius:5}}>
                          <div style={{color:T.mu,fontSize:7,fontWeight:700,marginBottom:1}}>{k}</div>
                          <div style={{color:T.mu,fontSize:9}}>{v}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ANALYTICS */}
        {tab==='analytics'&&!isMobile&&(
          <div style={{display:'flex',flexDirection:'column',gap:14}}>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:14}}>
              <Panel title="Strategy Breakdown">
                {(()=>{const s={};trades.forEach(t=>{if(t.strategy&&t.type!=='HOLD')s[t.strategy]=(s[t.strategy]||0)+1;});const tot=Object.values(s).reduce((a,b)=>a+b,0)||1;
                  return Object.entries(s).sort((a,b)=>b[1]-a[1]).map(([st,n])=>(
                    <div key={st} style={{marginBottom:10}}>
                      <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}><Chip c={SC[st]||T.mu} sm>{st}</Chip><span style={{color:T.mu,fontSize:10}}>{n} ({((n/tot)*100).toFixed(0)}%)</span></div>
                      <div style={{height:3,background:'#ffffff08',borderRadius:2}}><div style={{height:'100%',width:`${(n/tot)*100}%`,background:SC[st]||T.mu,borderRadius:2,transition:'width 0.5s'}}/></div>
                    </div>
                  ));
                })()}
              </Panel>
              <Panel title="Coin P&L">
                {(()=>{const cp={};trades.filter(t=>t.type==='SELL'&&t.pnl!=null).forEach(t=>{cp[t.coin]=(cp[t.coin]||0)+t.pnl;});
                  return Object.entries(cp).sort((a,b)=>b[1]-a[1]).slice(0,12).map(([c,p])=>(
                    <div key={c} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 0',borderBottom:`1px solid ${T.b}`}}>
                      <span style={{color:CC[c]||T.tx,fontWeight:700,fontSize:12}}>{c}</span>
                      <span style={{color:p>=0?T.g:T.r,fontSize:12,fontWeight:700}}>{p>=0?'+':''}{fUSD(p)}</span>
                    </div>
                  ));
                })()}
              </Panel>
              <Panel title="Performance">
                {[['Total Trades',trades.length],['Win Rate',wr],['Wins',wins],['Losses',sells.length-wins],['Avg Win',fUSD(sells.filter(t=>t.pnl>0).reduce((s,t)=>s+t.pnl,0)/Math.max(wins,1))],['Avg Loss',fUSD(sells.filter(t=>t.pnl<0).reduce((s,t)=>s+t.pnl,0)/Math.max(sells.length-wins,1))],['Total Fees',fUSD(bs.totalFeesUSD)],['Strategy',strat]].map(([k,v])=>(
                  <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'5px 0',borderBottom:`1px solid ${T.b}`}}>
                    <span style={{color:T.mu,fontSize:11}}>{k}</span><span style={{color:T.tx,fontSize:11,fontWeight:600}}>{v}</span>
                  </div>
                ))}
              </Panel>
            </div>
            <Panel title="Trade P&L History" pad={false}>
              <div style={{padding:'12px 14px',height:180}}>
                {(()=>{const d=trades.filter(t=>t.type==='SELL'&&t.pnl!=null).slice(0,40).reverse().map((t,i)=>({i,p:+t.pnl.toFixed(4)}));
                  if(!d.length)return<div style={{color:T.mu,textAlign:'center',paddingTop:60,fontSize:13}}>No closed trades yet.</div>;
                  return<ResponsiveContainer width="100%" height="100%"><BarChart data={d}><XAxis dataKey="i" hide/><YAxis hide/><Tooltip contentStyle={{background:T.card2,border:`1px solid ${T.b2}`,borderRadius:8,fontSize:11}} formatter={v=>[fUSD(v),'P&L']}/><ReferenceLine y={0} stroke={T.su}/><Bar dataKey="p" radius={[3,3,0,0]} fill={T.g}/></BarChart></ResponsiveContainer>;
                })()}
              </div>
            </Panel>
          </div>
        )}
      </div>

      <div style={{padding:'7px 20px',borderTop:`1px solid ${T.b}`,textAlign:'center',color:'#334155',fontSize:9}}>
        {user.botMode==='PAPER'?'PAPER MODE · ':''}{strat} strategy · Crypto trading involves substantial risk · NEXUS is not a financial adviser
      </div>
    </div>
  );
}
