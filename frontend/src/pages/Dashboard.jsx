import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { useAuth, useBotSocket } from '../lib/auth.jsx';
import { api } from '../lib/api.js';

const T={bg:'#030407',card:'#08090e',card2:'#0c0e16',b:'#ffffff0a',b2:'#ffffff14',g:'#00d68f',r:'#f5365c',a:'#fb923c',bl:'#3b82f6',pu:'#8b5cf6',cy:'#06b6d4',tx:'#e2e8f0',mu:'#64748b',su:'#1e293b'};
const SC={PRECISION:T.bl,MOMENTUM:T.cy,REVERSAL:T.pu,BREAKOUT:T.a,SWING:T.g,AGGRESSIVE:T.r,DCA_PLUS:'#22c55e'};
const CC={BTC:'#f7931a',ETH:'#627eea',SOL:'#9945ff',XRP:'#00aae4',BNB:'#f0b90b',AVAX:'#e84142',DOT:'#e6007a',LINK:'#2a5ada',ADA:'#3cc8c8',DOGE:'#c2a633',NEAR:'#00c08b',APT:'#22c55e',ARB:'#12aaff',OP:'#ff0420',INJ:'#00b7e9',SUI:'#4da2ff'};
const EX_COLORS={coinbase:'#0052ff',binance:'#f0b90b',kraken:'#5741d9',paper:'#64748b'};
const EX_NAMES={coinbase:'Coinbase',binance:'Binance',kraken:'Kraken',paper:'Paper'};

const fUSD=n=>{if(n==null||isNaN(n))return'$—';const a=Math.abs(n);if(a>=1e6)return`$${(n/1e6).toFixed(2)}M`;if(a>=1000)return`$${n.toLocaleString('en-US',{maximumFractionDigits:2})}`;if(a>=1)return`$${n.toFixed(2)}`;return`$${n.toFixed(4)}`;};
const fPct=n=>n==null?'—':`${n>=0?'+':''}${n.toFixed(2)}%`;
const fT=iso=>!iso?'—':new Date(iso).toLocaleTimeString('en-US',{hour12:false,hour:'2-digit',minute:'2-digit'});
const fAge=iso=>{if(!iso)return'—';const d=(Date.now()-new Date(iso))/1000;if(d<60)return`${~~d}s`;if(d<3600)return`${~~(d/60)}m`;return`${~~(d/3600)}h`;};

function useMobile(){const[m,s]=useState(window.innerWidth<768);useEffect(()=>{const h=()=>s(window.innerWidth<768);window.addEventListener('resize',h);return()=>window.removeEventListener('resize',h);},[]);return m;}

const Chip=memo(({c,children,sm})=><span style={{background:c+'18',color:c,border:`1px solid ${c}25`,padding:sm?'2px 8px':'4px 11px',borderRadius:20,fontSize:sm?9:11,fontWeight:700,display:'inline-block',whiteSpace:'nowrap'}}>{children}</span>);
const Btn=memo(({onClick,children,variant='ghost',color,size='md',disabled,full,active})=>{const bg=variant==='solid'?(color||T.g):active?`${color||T.g}18`:'transparent';const fg=variant==='solid'?'#000':active?color||T.g:color||T.mu;return<button onClick={onClick} disabled={disabled} style={{background:bg,color:fg,border:`1px solid ${active?fg+'44':T.b}`,padding:size==='xs'?'4px 10px':size==='sm'?'6px 14px':'9px 18px',borderRadius:8,cursor:disabled?'not-allowed':'pointer',fontFamily:'inherit',fontSize:size==='xs'?10:size==='sm'?12:13,fontWeight:700,opacity:disabled?0.35:1,width:full?'100%':'auto',transition:'all 0.15s',whiteSpace:'nowrap'}}>{children}</button>;});
const Panel=memo(({title,right,children,pad=true})=><div style={{background:T.card,border:`1px solid ${T.b}`,borderRadius:12,overflow:'hidden'}}><div style={{padding:'9px 14px',borderBottom:`1px solid ${T.b}`,display:'flex',justifyContent:'space-between',alignItems:'center',background:'#050609'}}><span style={{color:T.mu,fontSize:9,fontWeight:700,letterSpacing:'0.1em',textTransform:'uppercase'}}>{title}</span>{right&&<span style={{color:T.mu,fontSize:9}}>{right}</span>}</div>{pad?<div style={{padding:14}}>{children}</div>:children}</div>);

// ── Bot Card ──────────────────────────────────────────────────────────────────
const BotCard=memo(({bot,prices,strategies,onStart,onStop,onReset,onEdit,onDelete,isSelected,onSelect})=>{
  const running=['running','cycling'].includes(bot.status);
  const tv=bot.totalValue||(bot.balance||0);
  const pnl=tv-(bot.startingBalance||100);
  const wr=bot.trades?.length?`${((bot.trades.filter(t=>t.type==='SELL'&&t.pnl>0).length/Math.max(bot.trades.filter(t=>t.type==='SELL').length,1))*100).toFixed(0)}%`:'—';
  const sc=SC[bot.strategy]||T.bl;
  return(
    <div onClick={onSelect} style={{background:T.card,border:`2px solid ${isSelected?sc:running?sc+'44':T.b}`,borderRadius:12,padding:16,cursor:'pointer',transition:'all 0.2s',boxShadow:running?`0 0 20px ${sc}12`:'none'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:12}}>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <div style={{width:10,height:10,borderRadius:'50%',background:running?bot.color||sc:T.mu,boxShadow:running?`0 0 8px ${bot.color||sc}`:'none',flexShrink:0,animation:running?'pulse 2s infinite':'none'}}/>
          <div>
            <div style={{color:T.tx,fontWeight:700,fontSize:14}}>{bot.name}</div>
            <Chip c={sc} sm>{bot.strategy}</Chip>
          </div>
        </div>
        <div style={{textAlign:'right'}}>
          <div style={{color:pnl>=0?T.g:T.r,fontWeight:800,fontSize:16}}>{fUSD(tv)}</div>
          <div style={{color:pnl>=0?T.g:T.r,fontSize:10}}>{pnl>=0?'+':''}{fUSD(pnl)}</div>
        </div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:6,marginBottom:12}}>
        {[['Cash',fUSD(bot.balance)],['Win Rate',wr],['Trades',bot.trades?.length||0]].map(([l,v])=>(
          <div key={l} style={{background:'#ffffff04',padding:'6px 8px',borderRadius:7}}>
            <div style={{color:T.mu,fontSize:8,marginBottom:2}}>{l}</div>
            <div style={{color:T.tx,fontSize:12,fontWeight:700}}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{display:'flex',gap:6,justifyContent:'space-between'}}>
        {running
          ?<Btn onClick={e=>{e.stopPropagation();onStop(bot.id);}} variant="outline" color={T.r} size="xs" full>◼ Stop</Btn>
          :<Btn onClick={e=>{e.stopPropagation();onStart(bot.id);}} variant="solid" color={sc} size="xs" full>▶ Start</Btn>
        }
        <Btn onClick={e=>{e.stopPropagation();onReset(bot.id);}} size="xs" color={T.mu}>↺</Btn>
        <Btn onClick={e=>{e.stopPropagation();onEdit(bot);}} size="xs">⚙</Btn>
        <Btn onClick={e=>{e.stopPropagation();onDelete(bot.id);}} size="xs" color={T.r}>✕</Btn>
      </div>
    </div>
  );
});

// ── Bot Edit Modal ────────────────────────────────────────────────────────────
const BotModal=memo(({bot,strategies,exchanges,onClose,onSave,isNew})=>{
  const BOT_COLORS=['#00d68f','#3b82f6','#f5365c','#fb923c','#8b5cf6','#06b6d4','#f59e0b'];
  const [f,setF]=useState(bot ? {
    name:bot.name, strategy:bot.strategy, botMode:bot.botMode, color:bot.color,
    startingBalance:bot.startingBalance, maxTradeUSD:bot.maxTradeUSD,
    stopLossPct:+(bot.stopLossPct*100).toFixed(1), takeProfitPct:+(bot.takeProfitPct*100).toFixed(1),
    maxDrawdownPct:+(bot.maxDrawdownPct*100).toFixed(0), exchangeId:bot.exchangeId||'paper',
  } : { name:'Bot '+(Math.floor(Math.random()*900)+100), strategy:'PRECISION', botMode:'PAPER', color:'#00d68f', startingBalance:100, maxTradeUSD:20, stopLossPct:5, takeProfitPct:8, maxDrawdownPct:20, exchangeId:'paper' });
  const [saving,setSaving]=useState(false);
  const [err,setErr]=useState('');
  const set=(k,v)=>setF(p=>({...p,[k]:v}));
  const inp={background:T.bg,border:`1px solid ${T.b2}`,borderRadius:8,padding:'9px 12px',color:T.tx,fontFamily:'inherit',fontSize:13,width:'100%',outline:'none',boxSizing:'border-box'};

  async function save(){
    setSaving(true);setErr('');
    try{
      await onSave({...f,stopLossPct:+f.stopLossPct/100,takeProfitPct:+f.takeProfitPct/100,maxDrawdownPct:+f.maxDrawdownPct/100,startingBalance:+f.startingBalance,maxTradeUSD:+f.maxTradeUSD});
      onClose();
    }catch(e){setErr(e.message);}
    setSaving(false);
  }

  return(
    <div style={{position:'fixed',inset:0,background:'#000000d0',zIndex:500,display:'flex',alignItems:'center',justifyContent:'center',padding:16}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:T.card2,border:`1px solid ${T.b2}`,borderRadius:16,width:'100%',maxWidth:460,maxHeight:'90vh',overflowY:'auto',padding:24}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
          <div style={{color:T.tx,fontSize:17,fontWeight:800}}>{isNew?'Create New Bot':'Edit Bot'}</div>
          <button onClick={onClose} style={{color:T.mu,background:'none',border:'none',fontSize:24,cursor:'pointer'}}>×</button>
        </div>
        {err&&<div style={{color:T.r,fontSize:12,marginBottom:14,padding:'9px',background:'#f5365c15',borderRadius:8}}>{err}</div>}

        {/* Name + Color */}
        <div style={{display:'grid',gridTemplateColumns:'1fr auto',gap:10,marginBottom:14}}>
          <div>
            <div style={{color:T.mu,fontSize:10,fontWeight:600,marginBottom:5,textTransform:'uppercase'}}>Bot Name</div>
            <input value={f.name} onChange={e=>set('name',e.target.value)} style={inp} maxLength={30}/>
          </div>
          <div>
            <div style={{color:T.mu,fontSize:10,fontWeight:600,marginBottom:5,textTransform:'uppercase'}}>Color</div>
            <div style={{display:'flex',gap:4,paddingTop:2}}>
              {BOT_COLORS.map(c=><div key={c} onClick={()=>set('color',c)} style={{width:28,height:28,borderRadius:'50%',background:c,cursor:'pointer',border:f.color===c?'2px solid #fff':'2px solid transparent',flexShrink:0}}/>)}
            </div>
          </div>
        </div>

        {/* Strategy */}
        <div style={{marginBottom:14}}>
          <div style={{color:T.mu,fontSize:10,fontWeight:600,marginBottom:8,textTransform:'uppercase'}}>Trading Strategy</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
            {strategies.map(s=>(
              <button key={s.key} onClick={()=>set('strategy',s.key)}
                style={{background:f.strategy===s.key?(SC[s.key]||T.bl)+'18':'#ffffff04',border:`1.5px solid ${f.strategy===s.key?(SC[s.key]||T.bl):'#ffffff0a'}`,borderRadius:9,padding:'9px 11px',cursor:'pointer',textAlign:'left'}}>
                <div style={{color:f.strategy===s.key?(SC[s.key]||T.bl):T.tx,fontWeight:700,fontSize:12,marginBottom:2}}>{s.name}</div>
                <div style={{color:T.mu,fontSize:9,lineHeight:1.4}}>{s.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Exchange */}
        <div style={{marginBottom:14}}>
          <div style={{color:T.mu,fontSize:10,fontWeight:600,marginBottom:8,textTransform:'uppercase'}}>Exchange</div>
          <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
            <button onClick={()=>set('exchangeId','paper')} style={{background:f.exchangeId==='paper'?'#64748b18':'transparent',border:`1px solid ${f.exchangeId==='paper'?'#64748b':'#ffffff0a'}`,borderRadius:8,padding:'7px 12px',cursor:'pointer',color:f.exchangeId==='paper'?'#94a3b8':T.mu,fontSize:12,fontWeight:600}}>📄 Paper</button>
            {exchanges.map(ex=>(
              <button key={ex.id} onClick={()=>set('exchangeId',ex.id)}
                style={{background:f.exchangeId===ex.id?(EX_COLORS[ex.exchange]||T.bl)+'18':'transparent',border:`1px solid ${f.exchangeId===ex.id?(EX_COLORS[ex.exchange]||T.bl):'#ffffff0a'}`,borderRadius:8,padding:'7px 12px',cursor:'pointer',color:f.exchangeId===ex.id?(EX_COLORS[ex.exchange]||T.bl):T.mu,fontSize:12,fontWeight:600}}>
                {EX_NAMES[ex.exchange]||ex.exchange} {ex.mode==='LIVE'?'🔴':'📄'}
              </button>
            ))}
            <button onClick={()=>{onClose();/* navigate to exchanges tab */}} style={{background:'transparent',border:`1px dashed ${T.b2}`,borderRadius:8,padding:'7px 12px',cursor:'pointer',color:T.mu,fontSize:12}}>+ Add Exchange</button>
          </div>
          {f.exchangeId==='paper'&&<div style={{color:T.mu,fontSize:11,marginTop:6}}>Paper mode simulates trades without real money.</div>}
        </div>

        {/* Numbers */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:14}}>
          {[['Starting Balance ($)','startingBalance',1,1e6],['Max Trade ($)','maxTradeUSD',5,1e5],['Stop Loss (%)','stopLossPct',0.1,50],['Take Profit (%)','takeProfitPct',0.5,200],['Max Drawdown (%)','maxDrawdownPct',5,95]].map(([l,k,mn,mx])=>(
            <div key={k}><div style={{color:T.mu,fontSize:10,fontWeight:600,marginBottom:5,textTransform:'uppercase',letterSpacing:'0.05em'}}>{l}</div><input type="number" min={mn} max={mx} step="0.5" value={f[k]} onChange={e=>set(k,e.target.value)} style={inp}/></div>
          ))}
          <div>
            <div style={{color:T.mu,fontSize:10,fontWeight:600,marginBottom:5,textTransform:'uppercase'}}>Mode</div>
            <div style={{display:'flex',gap:6}}>
              <Btn onClick={()=>set('botMode','PAPER')} active={f.botMode==='PAPER'} color={T.bl} size="sm">Paper</Btn>
              <Btn onClick={()=>set('botMode','LIVE')} active={f.botMode==='LIVE'} color={T.r} size="sm">Live</Btn>
            </div>
          </div>
        </div>

        <div style={{display:'flex',gap:10}}>
          <Btn onClick={save} disabled={saving} variant="solid" color={f.color||T.g} full size="sm">{saving?'Saving…':isNew?'Create Bot':'Save Changes'}</Btn>
          <Btn onClick={onClose} size="sm">Cancel</Btn>
        </div>
      </div>
    </div>
  );
});

// ── Settings Modal ────────────────────────────────────────────────────────────
const SettingsModal=memo(({user,strategies,onClose,onSave})=>{
  const [f,setF]=useState({
    maxTradeUSD:user.maxTradeUSD||20,
    stopLossPct:+((user.stopLossPct||0.05)*100).toFixed(1),
    takeProfitPct:+((user.takeProfitPct||0.08)*100).toFixed(1),
    maxDrawdownPct:+((user.maxDrawdownPct||0.20)*100).toFixed(0),
    startingBalance:user.startingBalance||100,
    botMode:user.botMode||'PAPER',
    tradingStrategy:user.tradingStrategy||'PRECISION',
    leverageEnabled:user.leverageEnabled||false,
    maxLeverage:user.maxLeverage||3,
  });
  const [saving,setSaving]=useState(false);
  const [err,setErr]=useState('');
  const set=(k,v)=>setF(p=>({...p,[k]:v}));
  const inp={background:T.bg,border:`1px solid ${T.b2}`,borderRadius:8,padding:'9px 12px',color:T.tx,fontFamily:'inherit',fontSize:13,width:'100%',outline:'none',boxSizing:'border-box'};

  async function save(){
    setSaving(true);setErr('');
    try{
      await onSave({maxTradeUSD:+f.maxTradeUSD,stopLossPct:+f.stopLossPct/100,takeProfitPct:+f.takeProfitPct/100,maxDrawdownPct:+f.maxDrawdownPct/100,startingBalance:+f.startingBalance,botMode:f.botMode,tradingStrategy:f.tradingStrategy,leverageEnabled:f.leverageEnabled,maxLeverage:+f.maxLeverage});
      onClose();
    }catch(e){setErr(e.message);}
    setSaving(false);
  }

  return(
    <div style={{position:'fixed',inset:0,background:'#000000d0',zIndex:500,display:'flex',alignItems:'center',justifyContent:'center',padding:16}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:T.card2,border:`1px solid ${T.b2}`,borderRadius:16,width:'100%',maxWidth:480,maxHeight:'90vh',overflowY:'auto',padding:24}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
          <div style={{color:T.tx,fontSize:17,fontWeight:800}}>Global Defaults</div>
          <button onClick={onClose} style={{color:T.mu,background:'none',border:'none',fontSize:24,cursor:'pointer'}}>×</button>
        </div>
        {err&&<div style={{color:T.r,fontSize:12,marginBottom:14,padding:'9px',background:'#f5365c15',borderRadius:8}}>{err}</div>}

        <div style={{color:T.mu,fontSize:11,marginBottom:16,lineHeight:1.6}}>These defaults apply when creating new bots. Each bot can be individually configured.</div>

        <div style={{marginBottom:14}}>
          <div style={{color:T.mu,fontSize:10,fontWeight:700,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:8}}>Default Strategy</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
            {strategies.map(s=>(
              <button key={s.key} onClick={()=>set('tradingStrategy',s.key)}
                style={{background:f.tradingStrategy===s.key?(SC[s.key]||T.bl)+'18':'#ffffff04',border:`1.5px solid ${f.tradingStrategy===s.key?(SC[s.key]||T.bl):'#ffffff0a'}`,borderRadius:9,padding:'8px 10px',cursor:'pointer',textAlign:'left'}}>
                <div style={{color:f.tradingStrategy===s.key?(SC[s.key]||T.bl):T.tx,fontWeight:700,fontSize:11}}>{s.name}</div>
              </button>
            ))}
          </div>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:14}}>
          {[['Starting Balance ($)','startingBalance',1,1e6],['Max Trade ($)','maxTradeUSD',5,1e5],['Stop Loss (%)','stopLossPct',0.1,50],['Take Profit (%)','takeProfitPct',0.5,200],['Max Drawdown (%)','maxDrawdownPct',5,95]].map(([l,k,mn,mx])=>(
            <div key={k}><div style={{color:T.mu,fontSize:10,fontWeight:600,marginBottom:5,textTransform:'uppercase'}}>{l}</div><input type="number" min={mn} max={mx} step="0.5" value={f[k]} onChange={e=>set(k,e.target.value)} style={inp}/></div>
          ))}
        </div>

        <div style={{marginBottom:16}}>
          <div style={{color:T.mu,fontSize:10,fontWeight:700,marginBottom:8,textTransform:'uppercase'}}>Default Mode</div>
          <div style={{display:'flex',gap:8}}>
            <Btn onClick={()=>set('botMode','PAPER')} active={f.botMode==='PAPER'} color={T.bl} size="sm">📄 Paper</Btn>
            <Btn onClick={()=>set('botMode','LIVE')} active={f.botMode==='LIVE'} color={T.r} size="sm">🔴 Live</Btn>
          </div>
        </div>

        <div style={{display:'flex',gap:10}}>
          <Btn onClick={save} disabled={saving} variant="solid" color={T.g} full size="sm">{saving?'Saving…':'Save Defaults'}</Btn>
          <Btn onClick={onClose} size="sm">Cancel</Btn>
        </div>
      </div>
    </div>
  );
});

// ── Main Dashboard ─────────────────────────────────────────────────────────────
export default function Dashboard(){
  const {user,logout,setUser}=useAuth();
  const {bots,prices,strategies,connected}=useBotSocket();
  const nav=useNavigate();
  const isMobile=useMobile();
  const [tab,setTab]=useState('bots');
  const [selectedBot,setSelectedBot]=useState(null);
  const [showSettings,setShowSettings]=useState(false);
  const [showNewBot,setShowNewBot]=useState(false);
  const [editingBot,setEditingBot]=useState(null);
  const [exchanges,setExchanges]=useState([]);
  const [busy,setBusy]=useState({});
  const [exForm,setExForm]=useState({exchange:'coinbase',apiKey:'',apiSecret:'',apiPassphrase:'',label:'',mode:'PAPER'});
  const [exErr,setExErr]=useState('');
  const [exLoading,setExLoading]=useState(false);
  const logRef=useRef(null);

  useEffect(()=>{if(!user){nav('/login');return;}api.exchanges().then(d=>setExchanges(d.exchanges||[])).catch(()=>{});if(strategies.length===0)api.strategies().catch(()=>{});},[user]);
  useEffect(()=>{if(!selectedBot&&bots.length>0)setSelectedBot(bots[0].id);},[bots]);
  useEffect(()=>{const el=logRef.current;if(el)el.scrollTop=el.scrollHeight;},[selectedBotData?.logs?.length]);

  const selectedBotData=bots.find(b=>b.id===selectedBot)||bots[0];
  const totalPortfolioValue=bots.reduce((s,b)=>s+(b.totalValue||b.balance||0),0);
  const totalPnl=bots.reduce((s,b)=>s+(b.pnl||0),0);
  const runningCount=bots.filter(b=>['running','cycling'].includes(b.status)).length;

  const setBusy2=(id,val)=>setBusy(p=>({...p,[id]:val}));

  const handleStart=async(id)=>{setBusy2(id,true);try{await api.startBot(id);}catch(e){alert(e.message);}setBusy2(id,false);};
  const handleStop=async(id)=>{setBusy2(id,true);try{await api.stopBot(id);}catch(e){alert(e.message);}setBusy2(id,false);};
  const handleReset=async(id)=>{if(!confirm('Reset this bot? All trades will be cleared.'))return;setBusy2(id,true);try{await api.resetBot(id);}catch(e){alert(e.message);}setBusy2(id,false);};
  const handleDelete=async(id)=>{if(!confirm('Delete this bot permanently?'))return;try{await api.deleteBot(id);if(selectedBot===id)setSelectedBot(null);}catch(e){alert(e.message);}};
  const handleCreateBot=async(data)=>{await api.createBot(data);};
  const handleEditBot=async(data)=>{await api.updateBot(editingBot.id,data);};
  const saveSettings=async(data)=>{const r=await api.botSettings(data);if(r.user&&setUser)setUser(r.user);};

  const connectExchange=async()=>{
    setExErr('');setExLoading(true);
    try{await api.connectEx(exForm);const d=await api.exchanges();setExchanges(d.exchanges||[]);setExForm({exchange:'coinbase',apiKey:'',apiSecret:'',apiPassphrase:'',label:'',mode:'PAPER'});}
    catch(e){setExErr(e.message);}
    setExLoading(false);
  };

  const disconnectExchange=async(id)=>{if(!confirm('Disconnect this exchange?'))return;await api.disconnectEx(id);const d=await api.exchanges();setExchanges(d.exchanges||[]);};

  if(!user) return null;

  const TABS=isMobile?['bots','log','market','exchanges']:['bots','live log','market','exchanges','analytics'];

  return(
    <div style={{minHeight:'100vh',background:T.bg,color:T.tx,fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"}}>
      <style>{`*{box-sizing:border-box}::-webkit-scrollbar{width:3px;height:3px}::-webkit-scrollbar-thumb{background:#1e293b;border-radius:2px}@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}button,input,select{font-family:inherit}.row-hover:hover{background:#ffffff05!important}.tab-btn:hover{color:#00d68f!important}`}</style>

      {showSettings&&<SettingsModal user={user} strategies={strategies} onClose={()=>setShowSettings(false)} onSave={saveSettings}/>}
      {showNewBot&&<BotModal isNew strategies={strategies} exchanges={exchanges} onClose={()=>setShowNewBot(false)} onSave={handleCreateBot}/>}
      {editingBot&&<BotModal bot={editingBot} strategies={strategies} exchanges={exchanges} onClose={()=>setEditingBot(null)} onSave={handleEditBot}/>}

      {/* Risk bar */}
      <div style={{background:'#f5365c06',borderBottom:'1px solid #f5365c15',padding:'4px 16px',textAlign:'center'}}>
        <span style={{color:'#f5365c50',fontSize:10}}>⚠ Crypto trading involves substantial risk. NEXUS is not a financial adviser. All trades may result in losses.</span>
      </div>

      {/* Header */}
      <header style={{background:T.card,borderBottom:`1px solid ${T.b}`,padding:isMobile?'10px 14px':'10px 20px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,position:'sticky',top:0,zIndex:100}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <div style={{display:'flex',alignItems:'center',gap:6}}>
            <div style={{width:8,height:8,borderRadius:'50%',background:runningCount>0?T.g:T.mu,boxShadow:runningCount>0?`0 0 8px ${T.g}`:'none',animation:runningCount>0?'pulse 2s infinite':'none'}}/>
            <span style={{color:T.g,fontWeight:800,fontSize:15,letterSpacing:'-0.02em'}}>NEXUS</span>
          </div>
          {!isMobile&&<>
            <span style={{color:T.mu,fontSize:11}}>{runningCount}/{bots.length} bots running</span>
            <div style={{display:'flex',gap:4}}>
              {bots.map(b=><div key={b.id} style={{width:6,height:6,borderRadius:'50%',background:['running','cycling'].includes(b.status)?b.color||T.g:T.mu}}/>)}
            </div>
          </>}
        </div>
        <div style={{display:'flex',alignItems:'center',gap:6,flexShrink:0}}>
          {!isMobile&&<div style={{textAlign:'right',marginRight:8}}>
            <div style={{color:totalPnl>=0?T.g:T.r,fontSize:16,fontWeight:800}}>{fUSD(totalPortfolioValue)}</div>
            <div style={{color:totalPnl>=0?T.g:T.r,fontSize:10}}>{totalPnl>=0?'+':''}{fUSD(totalPnl)} total</div>
          </div>}
          <Btn onClick={()=>setShowNewBot(true)} variant="solid" color={T.g} size="sm">+ New Bot</Btn>
          <Btn onClick={()=>setShowSettings(true)} size="sm">⚙{!isMobile&&' Defaults'}</Btn>
          <button onClick={()=>{logout();nav('/');}} style={{color:T.mu,background:'none',border:'none',fontSize:11,padding:'4px 8px',cursor:'pointer'}}>Out</button>
        </div>
      </header>

      {/* Summary stats */}
      {!isMobile&&bots.length>0&&(
        <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:1,background:T.b}}>
          {[
            {l:'TOTAL VALUE',v:fUSD(totalPortfolioValue),s:`${bots.length} bot${bots.length>1?'s':''}`,c:totalPnl>=0?T.g:T.r},
            {l:'TOTAL P&L',v:`${totalPnl>=0?'+':''}${fUSD(totalPnl)}`,s:fPct(bots.reduce((s,b)=>s+(b.pnlPct||0),0)/Math.max(bots.length,1)),c:totalPnl>=0?T.g:T.r},
            {l:'RUNNING BOTS',v:`${runningCount}/${bots.length}`,s:'active strategies'},
            {l:'TOTAL TRADES',v:bots.reduce((s,b)=>s+(b.trades?.length||0),0),s:'across all bots'},
            {l:'EXCHANGE',v:exchanges.length>0?`${exchanges.length} connected`:'Paper Only',s:exchanges.filter(e=>e.mode==='LIVE').length+' live'},
          ].map((s,i)=>(
            <div key={i} style={{background:T.card,padding:'11px 14px'}}>
              <div style={{color:T.mu,fontSize:8,fontWeight:700,letterSpacing:'0.1em',marginBottom:3,textTransform:'uppercase'}}>{s.l}</div>
              <div style={{fontSize:17,fontWeight:800,color:s.c||T.tx,letterSpacing:'-0.02em'}}>{s.v}</div>
              <div style={{color:T.mu,fontSize:9,marginTop:2}}>{s.s}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{background:T.card,borderBottom:`1px solid ${T.b}`,padding:`0 ${isMobile?'12px':'20px'}`,display:'flex',overflowX:'auto',WebkitOverflowScrolling:'touch'}}>
        {TABS.map(t=><button key={t} className="tab-btn" onClick={()=>setTab(t)} style={{background:'transparent',border:'none',padding:isMobile?'9px 11px':'9px 14px',color:tab===t?T.g:T.mu,fontSize:isMobile?10:11,fontWeight:700,cursor:'pointer',borderBottom:tab===t?`2px solid ${T.g}`:'2px solid transparent',whiteSpace:'nowrap',textTransform:'uppercase',letterSpacing:'0.06em',transition:'color 0.15s'}}>{t}</button>)}
      </div>

      <div style={{padding:isMobile?'12px':16}}>

        {/* BOTS TAB */}
        {tab==='bots'&&(
          <div style={{display:'flex',flexDirection:'column',gap:14}}>
            {/* Bot cards grid */}
            <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':`repeat(${Math.min(bots.length+1,3)},1fr)`,gap:12}}>
              {bots.map(bot=>(
                <BotCard key={bot.id} bot={bot} prices={prices} strategies={strategies}
                  isSelected={selectedBot===bot.id}
                  onSelect={()=>setSelectedBot(bot.id)}
                  onStart={handleStart} onStop={handleStop} onReset={handleReset}
                  onEdit={setEditingBot} onDelete={handleDelete}/>
              ))}
              {bots.length<3&&(
                <button onClick={()=>setShowNewBot(true)} style={{background:'transparent',border:`2px dashed ${T.b2}`,borderRadius:12,padding:24,cursor:'pointer',color:T.mu,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:8,minHeight:160,transition:'border-color 0.2s'}}
                  onMouseEnter={e=>e.target.style.borderColor=T.g+'44'} onMouseLeave={e=>e.target.style.borderColor=T.b2}>
                  <span style={{fontSize:28}}>+</span>
                  <span style={{fontSize:12,fontWeight:600}}>New Bot</span>
                  <span style={{fontSize:10,textAlign:'center'}}>Run multiple strategies simultaneously</span>
                </button>
              )}
            </div>

            {/* Selected bot detail */}
            {selectedBotData&&(
              <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'2fr 1fr',gap:14}}>
                <Panel title={`${selectedBotData.name} — Trade Feed`} right={`${selectedBotData.trades?.length||0} trades`} pad={false}>
                  <div style={{maxHeight:280,overflowY:'auto'}}>
                    {!selectedBotData.trades?.length&&<div style={{padding:'24px 14px',color:T.mu,fontSize:13}}>No trades yet. Start the bot.</div>}
                    {(selectedBotData.trades||[]).slice(0,50).map((t,i)=>{
                      const ac=t.type==='BUY'?T.g:t.type==='SELL'?(t.pnl>=0?T.bl:T.r):T.mu;
                      return<div key={i} className="row-hover" style={{padding:'7px 14px',borderBottom:`1px solid ${T.b}`,display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}>
                        <div style={{display:'flex',gap:7,alignItems:'center',flex:1,minWidth:0}}>
                          <Chip c={ac} sm>{t.type}</Chip>
                          {t.coin&&<span style={{color:CC[t.coin]||T.tx,fontWeight:700,fontSize:12,minWidth:32,flexShrink:0}}>{t.coin}</span>}
                          {!isMobile&&t.strategy&&<Chip c={SC[t.strategy]||T.mu} sm>{t.strategy}</Chip>}
                          {!isMobile&&<span style={{color:T.mu,fontSize:10,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.reasoning?.slice(0,60)}…</span>}
                        </div>
                        <div style={{display:'flex',gap:8,alignItems:'center',flexShrink:0}}>
                          {t.pnl!=null&&<span style={{color:t.pnl>=0?T.g:T.r,fontSize:11,fontWeight:700}}>{t.pnl>=0?'+':''}{fUSD(t.pnl)}</span>}
                          <span style={{color:'#334155',fontSize:9}}>{fT(t.ts)}</span>
                        </div>
                      </div>;
                    })}
                  </div>
                </Panel>

                <Panel title="Positions" pad={false}>
                  {!Object.keys(selectedBotData.portfolio||{}).length
                    ?<div style={{padding:'24px 14px',color:T.mu,fontSize:12}}>No open positions.</div>
                    :Object.entries(selectedBotData.portfolio||{}).map(([sym,pos])=>{
                      const px=prices[sym]?.price,pv=px?pos.qty*px:0,pp=px?(px-pos.avgCost)*pos.qty:0;
                      return<div key={sym} style={{padding:'10px 14px',borderBottom:`1px solid ${T.b}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                        <div><div style={{color:CC[sym]||T.tx,fontWeight:700,fontSize:14}}>{sym}</div><div style={{color:T.mu,fontSize:10}}>{pos.qty.toFixed(4)} @ {fUSD(pos.avgCost)}</div></div>
                        <div style={{textAlign:'right'}}><div style={{color:T.tx,fontSize:13,fontWeight:700}}>{fUSD(pv)}</div><div style={{color:pp>=0?T.g:T.r,fontSize:10}}>{pp>=0?'+':''}{fUSD(pp)}</div></div>
                      </div>;
                    })
                  }
                </Panel>
              </div>
            )}
          </div>
        )}

        {/* LIVE LOG */}
        {(tab==='live log'||tab==='log')&&(
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {bots.length>1&&<div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
              {bots.map(b=><Btn key={b.id} onClick={()=>setSelectedBot(b.id)} active={selectedBot===b.id} color={b.color||SC[b.strategy]||T.bl} size="sm">{b.name}</Btn>)}
            </div>}
            <Panel title={`${selectedBotData?.name||'Bot'} — Reasoning Log`} right={`${selectedBotData?.logs?.length||0} entries`} pad={false}>
              <div ref={logRef} style={{height:isMobile?'calc(100vh-260px)':'calc(100vh-300px)',overflowY:'auto',background:'#020306',fontFamily:"'SF Mono','Fira Code',monospace",padding:'4px 0'}}>
                {(!selectedBotData?.logs?.length)&&<div style={{padding:20,color:T.mu,fontSize:12}}>Log appears when bot starts.</div>}
                {(selectedBotData?.logs||[]).map((e,i)=>{
                  const lc={CYCLE:'#334155',AI:T.pu,SIGNAL:T.g,REASONING:T.tx,TRADE:T.g,PROFIT:T.g,LOSS:T.r,POSITION:T.a,HOLD:T.mu,WARN:T.a,ERROR:T.r,SYSTEM:T.bl,INFO:T.mu}[e.level]||T.mu;
                  const big=['TRADE','PROFIT','LOSS','REASONING','CYCLE'].includes(e.level);
                  return<div key={i} style={{padding:big?'6px 14px':'2px 14px',borderBottom:big?`1px solid ${T.b}`:'none',background:big?'#050a18':'transparent',display:'flex',gap:8}}>
                    <span style={{color:'#1e293b',fontSize:9,flexShrink:0}}>{fT(e.ts)}</span>
                    <span style={{color:lc,fontSize:9,fontWeight:700,minWidth:54,flexShrink:0}}>[{e.level}]</span>
                    <span style={{color:big?T.tx:'#475569',fontSize:big?11:9,lineHeight:1.6}}>{e.msg}</span>
                  </div>;
                })}
              </div>
            </Panel>
          </div>
        )}

        {/* MARKET */}
        {tab==='market'&&(
          <div style={{display:'grid',gridTemplateColumns:`repeat(${isMobile?2:4},1fr)`,gap:10}}>
            {Object.entries(prices).map(([sym,d])=>{
              if(!d)return null;
              const held=bots.some(b=>b.portfolio?.[sym]);
              const cc=CC[sym]||T.tx,chg=d.change24h||0;
              return<div key={sym} style={{background:T.card,border:`1px solid ${held?cc+'30':T.b}`,borderRadius:10,padding:isMobile?'12px':'15px'}}>
                {held&&<div style={{float:'right'}}><Chip c={cc} sm>HELD</Chip></div>}
                <div style={{color:cc,fontWeight:800,fontSize:isMobile?14:16,marginBottom:2}}>{sym}</div>
                <div style={{color:T.tx,fontSize:isMobile?14:17,fontWeight:700,marginBottom:2}}>{fUSD(d.price)}</div>
                <div style={{color:chg>=0?T.g:T.r,fontSize:11}}>{fPct(chg)} 24h</div>
                {!isMobile&&<div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:4,marginTop:8}}>
                  {[['H',fUSD(d.high24h)],['L',fUSD(d.low24h)],['VOL',fUSD(d.volume24h)],['O',fUSD(d.openPrice)]].map(([k,v])=>(
                    <div key={k} style={{background:'#ffffff04',padding:'4px 7px',borderRadius:5}}><div style={{color:T.mu,fontSize:7,fontWeight:700,marginBottom:1}}>{k}</div><div style={{color:T.mu,fontSize:9}}>{v}</div></div>
                  ))}
                </div>}
              </div>;
            })}
          </div>
        )}

        {/* EXCHANGES */}
        {tab==='exchanges'&&(
          <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 1fr',gap:16}}>
            <div>
              <Panel title="Connect Exchange">
                {exErr&&<div style={{color:T.r,fontSize:12,marginBottom:12,padding:'8px 12px',background:'#f5365c12',borderRadius:7}}>{exErr}</div>}
                <div style={{display:'flex',flexDirection:'column',gap:10}}>
                  <div>
                    <div style={{color:T.mu,fontSize:10,fontWeight:600,marginBottom:5,textTransform:'uppercase'}}>Exchange</div>
                    <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                      {[['coinbase','Coinbase','#0052ff'],['binance','Binance','#f0b90b'],['kraken','Kraken','#5741d9']].map(([id,name,color])=>(
                        <button key={id} onClick={()=>setExForm(f=>({...f,exchange:id}))} style={{background:exForm.exchange===id?color+'18':'transparent',border:`1px solid ${exForm.exchange===id?color:T.b}`,borderRadius:8,padding:'7px 14px',cursor:'pointer',color:exForm.exchange===id?color:T.mu,fontSize:12,fontWeight:600}}>{name}</button>
                      ))}
                    </div>
                  </div>
                  {[['API Key','apiKey','text'],['API Secret','apiSecret','password'],exForm.exchange==='coinbase'?['API Passphrase (if required)','apiPassphrase','password']:null,['Label (optional)','label','text']].filter(Boolean).map(([l,k,t])=>(
                    <div key={k}>
                      <div style={{color:T.mu,fontSize:10,fontWeight:600,marginBottom:5,textTransform:'uppercase'}}>{l}</div>
                      <input type={t} value={exForm[k]} onChange={e=>setExForm(f=>({...f,[k]:e.target.value}))} placeholder={l} style={{background:T.bg,border:`1px solid ${T.b2}`,borderRadius:8,padding:'9px 12px',color:T.tx,fontFamily:'inherit',fontSize:13,width:'100%',outline:'none',boxSizing:'border-box'}}/>
                    </div>
                  ))}
                  <div style={{display:'flex',gap:6}}>
                    <Btn onClick={()=>setExForm(f=>({...f,mode:'PAPER'}))} active={exForm.mode==='PAPER'} color={T.bl} size="sm">📄 Paper</Btn>
                    <Btn onClick={()=>setExForm(f=>({...f,mode:'LIVE'}))} active={exForm.mode==='LIVE'} color={T.r} size="sm">🔴 Live</Btn>
                  </div>
                  <div style={{color:'#9a6a10',fontSize:11,lineHeight:1.6,padding:'8px 10px',background:'#fb923c0a',borderRadius:7}}>⚠ Only grant <strong>Trade + Read</strong> permissions. Never grant withdrawal permissions. NEXUS never holds your funds.</div>
                  <Btn onClick={connectExchange} disabled={exLoading} variant="solid" color={T.g} full>{exLoading?'Connecting…':'Connect Exchange'}</Btn>
                </div>
              </Panel>
            </div>

            <div>
              <Panel title={`Connected Exchanges (${exchanges.length})`}>
                {!exchanges.length&&<div style={{color:T.mu,fontSize:13,padding:'16px 0',textAlign:'center'}}>No exchanges connected.<br/><span style={{fontSize:11}}>Connect one to enable live trading on real accounts.</span></div>}
                {exchanges.map(ex=>(
                  <div key={ex.id} style={{background:'#ffffff04',borderRadius:10,padding:'14px',marginBottom:10,border:`1px solid ${EX_COLORS[ex.exchange]||T.bl}22`}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
                      <div>
                        <div style={{color:EX_COLORS[ex.exchange]||T.tx,fontWeight:700,fontSize:14,textTransform:'capitalize'}}>{EX_NAMES[ex.exchange]||ex.exchange}</div>
                        <div style={{color:T.mu,fontSize:10}}>{ex.label||''} · {ex.apiKeyMask||'Wallet'}</div>
                      </div>
                      <Chip c={ex.mode==='LIVE'?T.r:T.bl} sm>{ex.mode}</Chip>
                    </div>
                    <div style={{display:'flex',gap:6}}>
                      <Chip c={ex.isActive?T.g:T.mu} sm>{ex.isActive?'Connected':'Inactive'}</Chip>
                      <span style={{color:T.mu,fontSize:9,alignSelf:'center'}}>since {fAge(ex.connectedAt)} ago</span>
                      <button onClick={()=>disconnectExchange(ex.id)} style={{marginLeft:'auto',color:T.r,background:'transparent',border:`1px solid ${T.r}30`,borderRadius:6,padding:'3px 10px',cursor:'pointer',fontSize:10}}>Remove</button>
                    </div>
                  </div>
                ))}
                <div style={{marginTop:16,padding:'12px',background:'#ffffff04',borderRadius:8}}>
                  <div style={{color:T.mu,fontSize:11,lineHeight:1.7}}>
                    <strong style={{color:T.tx}}>Supported exchanges:</strong><br/>
                    • Coinbase Advanced Trade API<br/>
                    • Binance Spot API<br/>
                    • Kraken REST API<br/>
                    <span style={{color:T.mu,fontSize:10}}>More exchanges coming soon. API keys are AES-256 encrypted and never transmitted off-server.</span>
                  </div>
                </div>
              </Panel>
            </div>
          </div>
        )}

        {/* ANALYTICS */}
        {tab==='analytics'&&!isMobile&&(
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:14}}>
            {bots.map(bot=>{
              const sells=bot.trades?.filter(t=>t.type==='SELL')||[];
              const wins=sells.filter(t=>t.pnl>0).length;
              const wr=sells.length?`${((wins/sells.length)*100).toFixed(0)}%`:'—';
              const tv=bot.totalValue||bot.balance||0;
              const pnl=tv-(bot.startingBalance||100);
              return(
                <Panel key={bot.id} title={bot.name} right={<Chip c={bot.color||SC[bot.strategy]||T.bl} sm>{bot.strategy}</Chip>}>
                  <div style={{marginBottom:12,padding:'10px',background:'#ffffff04',borderRadius:8}}>
                    <div style={{color:pnl>=0?T.g:T.r,fontSize:20,fontWeight:800}}>{fUSD(tv)}</div>
                    <div style={{color:pnl>=0?T.g:T.r,fontSize:11}}>{pnl>=0?'+':''}{fUSD(pnl)} ({fPct(((tv/(bot.startingBalance||100))-1)*100)})</div>
                  </div>
                  {[['Win Rate',wr],['Trades',bot.trades?.length||0],['Wins',wins],['Losses',sells.length-wins],['Fees',fUSD(bot.totalFees||0)],['Cycles',bot.cycleCount||0]].map(([k,v])=>(
                    <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'5px 0',borderBottom:`1px solid ${T.b}`}}>
                      <span style={{color:T.mu,fontSize:11}}>{k}</span><span style={{color:T.tx,fontSize:11,fontWeight:600}}>{v}</span>
                    </div>
                  ))}
                </Panel>
              );
            })}
          </div>
        )}
      </div>

      <div style={{padding:'7px 20px',borderTop:`1px solid ${T.b}`,textAlign:'center',color:'#334155',fontSize:9}}>
        {runningCount} bot{runningCount!==1?'s':''} running · Paper mode · Crypto trading involves substantial risk · NEXUS is not a financial adviser
      </div>
    </div>
  );
}
