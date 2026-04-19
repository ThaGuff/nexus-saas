import{useState,useEffect,useRef,memo,useMemo}from'react';
import{useNavigate}from'react-router-dom';
import{AreaChart,Area,XAxis,YAxis,Tooltip,ResponsiveContainer,LineChart,Line,ReferenceLine}from'recharts';
import{useAuth,useBotSocket}from'../lib/auth.jsx';
import{api}from'../lib/api.js';

// ─────────────────────────────────────────────
//  DESIGN TOKENS
// ─────────────────────────────────────────────
const C={
  bg:'#05070f',bg2:'#080b18',bg3:'#0c1024',
  card:'rgba(255,255,255,0.035)',card2:'rgba(255,255,255,0.055)',
  b:'rgba(255,255,255,0.08)',b2:'rgba(255,255,255,0.13)',
  amber:'#ffb800',amber2:'#ff8c00',
  green:'#00e5a0',red:'#ff4757',cyan:'#00d2ff',violet:'#a855f7',
  tx:'#e8edf5',tx2:'#94a3b8',tx3:'#475569',
};
const SC={
  PRECISION:{c:'#00d2ff',icon:'⊕',tier:'basic'},
  DCA_PLUS: {c:'#22c55e',icon:'◎',tier:'basic'},
  MOMENTUM: {c:'#39ff14',icon:'▲',tier:'premium'},
  SWING:    {c:'#00e5a0',icon:'⌇',tier:'premium'},
  REVERSAL: {c:'#a855f7',icon:'↩',tier:'premium'},
  BREAKOUT: {c:'#ffb800',icon:'⊞',tier:'premium'},
  AGGRESSIVE:{c:'#ff4757',icon:'⚡',tier:'premium'},
};
const STRAT_DESC={
  PRECISION:'RSI + MACD + Bollinger Band triple confirmation. Highest win rate, patient entries. Best for steady growth.',
  DCA_PLUS:'Systematic dip buying on Tier-1 blue chips only (BTC/ETH/SOL). Most consistent. Great for accumulation.',
  MOMENTUM:'EMA cascade + RSI momentum zone (42-70). Rides established uptrends. Best in bull markets.',
  SWING:'Pullback entries within confirmed uptrends. EMA21>EMA50 required. Multi-day holds.',
  REVERSAL:'Extreme oversold bounces. RSI<35 + BB lower band required. High risk/reward.',
  BREAKOUT:'BB squeeze <6% width + volume surge >1.4x. Captures explosive moves before they happen.',
  AGGRESSIVE:'External catalyst entries only. Requires volume >2.5x OR extreme 24h price move.',
};
const CC={BTC:'#f7931a',ETH:'#627eea',SOL:'#9945ff',XRP:'#00aae4',BNB:'#f0b90b',AVAX:'#e84142',LINK:'#2a5ada',DOGE:'#c2a633',NEAR:'#00c08b',ARB:'#12aaff',INJ:'#00b7e9'};

const fu=n=>{if(n==null||isNaN(n))return'$—';const a=Math.abs(n);if(a>=1e9)return`$${(n/1e9).toFixed(2)}B`;if(a>=1e6)return`$${(n/1e6).toFixed(2)}M`;if(a>=1000)return`$${n.toLocaleString('en-US',{maximumFractionDigits:2})}`;if(a>=1)return`$${n.toFixed(2)}`;return`$${n.toFixed(5)}`;};
const fp=n=>n==null?'—':`${n>=0?'+':''}${n.toFixed(2)}%`;
const ft=iso=>iso?new Date(iso).toLocaleTimeString('en-US',{hour12:false,hour:'2-digit',minute:'2-digit'}):'—';
const fa=iso=>{if(!iso)return'—';const d=(Date.now()-new Date(iso))/1e3;if(d<60)return`${~~d}s`;if(d<3600)return`${~~(d/60)}m`;return`${~~(d/3600)}h`;};

// ─────────────────────────────────────────────
//  ATOMS
// ─────────────────────────────────────────────
const css=`
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:#05070f;color:#e8edf5;font-family:'Space Grotesk',sans-serif}
button,input,select,textarea{font-family:inherit}
::-webkit-scrollbar{width:3px;height:3px}
::-webkit-scrollbar-thumb{background:#1e293b;border-radius:2px}
@keyframes breathe{0%,100%{opacity:1}50%{opacity:0.3}}
@keyframes pulse-ring{0%{box-shadow:0 0 0 0 rgba(0,229,160,0.4)}70%{box-shadow:0 0 0 8px rgba(0,229,160,0)}100%{box-shadow:0 0 0 0 rgba(0,229,160,0)}}
@keyframes shimmer{0%{transform:translateX(-100%)}100%{transform:translateX(200%)}}
@keyframes ticker{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
@keyframes slide-up{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
@keyframes modal-in{from{opacity:0;transform:scale(0.96) translateY(8px)}to{opacity:1;transform:scale(1) translateY(0)}}
.row:hover{background:rgba(255,255,255,0.025)!important}
.card-hover:hover{border-color:rgba(255,184,0,0.25)!important;transform:translateY(-1px)}

/* Responsive bot grid */
.bot-grid{display:grid;gap:16px;grid-template-columns:repeat(3,1fr)}
.detail-grid{display:grid;gap:16px;grid-template-columns:1fr 340px}
.hero-prices{display:flex;gap:10px;flex-wrap:wrap}

@media(max-width:1100px){
  .bot-grid{grid-template-columns:repeat(2,1fr)!important}
  .detail-grid{grid-template-columns:1fr 300px!important}
}
@media(max-width:700px){
  .bot-grid{grid-template-columns:1fr!important}
  .detail-grid{grid-template-columns:1fr!important}
  .hero-prices{display:none!important}
}
`;

const Pill=({c,children,dot})=><span style={{display:'inline-flex',alignItems:'center',gap:4,padding:'3px 9px',borderRadius:20,background:`${c}15`,border:`1px solid ${c}28`,color:c,fontSize:9,fontWeight:600,fontFamily:"'DM Mono',monospace",whiteSpace:'nowrap'}}>{dot&&<span style={{width:5,height:5,borderRadius:'50%',background:c,animation:dot==='pulse'?'breathe 2s infinite':undefined,flexShrink:0}}/>}{children}</span>;

const Stat=({label,value,sub,color,icon})=>(
  <div style={{background:C.card,border:`1px solid ${C.b}`,borderRadius:14,padding:'16px 18px'}}>
    <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:8}}>
      {icon&&<span style={{fontSize:14}}>{icon}</span>}
      <span style={{color:C.tx3,fontSize:9,fontWeight:600,letterSpacing:'0.12em',textTransform:'uppercase',fontFamily:"'DM Mono',monospace"}}>{label}</span>
    </div>
    <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:22,letterSpacing:'-0.02em',color:color||C.tx,lineHeight:1,marginBottom:4}}>{value}</div>
    {sub&&<div style={{color:C.tx3,fontSize:10,fontFamily:"'DM Mono',monospace"}}>{sub}</div>}
  </div>
);

const Card=({children,accent,onClick,selected,running,style:sx})=>(
  <div onClick={onClick} className={onClick?'card-hover':''} style={{background:C.card,border:`2px solid ${selected?accent||C.amber:running?`${accent||C.green}30`:C.b}`,borderRadius:16,overflow:'hidden',position:'relative',transition:'all 0.2s',cursor:onClick?'pointer':undefined,boxShadow:running?`0 0 24px ${accent||C.green}10`:undefined,...sx}}>
    {running&&<div style={{position:'absolute',top:0,left:0,right:0,height:2,background:`linear-gradient(90deg,transparent,${accent||C.green},transparent)`,animation:'shimmer 2.5s ease-in-out infinite',zIndex:1}}/>}
    {accent&&<div style={{position:'absolute',left:0,top:0,bottom:0,width:3,background:accent,borderRadius:'3px 0 0 3px'}}/>}
    {children}
  </div>
);

const Inp=({label,value,onChange,type='text',min,max,step,placeholder,suffix,prefix,note})=>(
  <div>
    {label&&<div style={{color:C.tx3,fontSize:9,fontWeight:600,letterSpacing:'0.12em',textTransform:'uppercase',marginBottom:6,fontFamily:"'DM Mono',monospace"}}>{label}</div>}
    <div style={{position:'relative'}}>
      {prefix&&<span style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:C.tx3,fontSize:12,fontFamily:"'DM Mono',monospace",pointerEvents:'none'}}>{prefix}</span>}
      <input type={type}value={value}onChange={e=>onChange(e.target.value)}min={min}max={max}step={step||'any'}placeholder={placeholder||''}
        style={{width:'100%',background:'rgba(0,0,0,0.35)',border:`1px solid ${C.b2}`,borderRadius:9,padding:`10px ${suffix?'36px':'13px'} 10px ${prefix?'26px':'13px'}`,color:C.tx,fontSize:13,outline:'none',boxSizing:'border-box',transition:'border-color 0.2s'}}
        onFocus={e=>e.target.style.borderColor=C.amber} onBlur={e=>e.target.style.borderColor=C.b2}/>
      {suffix&&<span style={{position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',color:C.tx3,fontSize:11,fontFamily:"'DM Mono',monospace",pointerEvents:'none'}}>{suffix}</span>}
    </div>
    {note&&<div style={{color:C.tx3,fontSize:10,marginTop:5,lineHeight:1.5}}>{note}</div>}
  </div>
);

const Toggle=({label,desc,checked,onChange,color=C.green})=>(
  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',padding:'12px 0',borderBottom:`1px solid ${C.b}`,gap:16}}>
    <div><div style={{color:C.tx,fontSize:13,fontWeight:500,marginBottom:desc?2:0}}>{label}</div>{desc&&<div style={{color:C.tx3,fontSize:11,lineHeight:1.4}}>{desc}</div>}</div>
    <div onClick={()=>onChange(!checked)} style={{width:44,height:24,borderRadius:12,background:checked?color:'#1e293b',border:`1px solid ${checked?color:'#2d3748'}`,position:'relative',cursor:'pointer',flexShrink:0,transition:'all 0.2s',marginTop:2}}>
      <div style={{width:18,height:18,borderRadius:'50%',background:'#fff',position:'absolute',top:2,left:checked?22:2,transition:'left 0.2s',boxShadow:'0 2px 4px rgba(0,0,0,0.3)'}}/>
    </div>
  </div>
);

// Modal wrapper
const Modal=({title,onClose,children,width=520,footer})=>(
  <div onClick={e=>{if(e.target===e.currentTarget)onClose();}} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.82)',zIndex:500,display:'flex',alignItems:'center',justifyContent:'center',padding:16,backdropFilter:'blur(10px)'}}>
    <div style={{background:C.bg3,border:`1px solid ${C.b2}`,borderRadius:20,width:'100%',maxWidth:width,maxHeight:'92vh',display:'flex',flexDirection:'column',boxShadow:'0 40px 80px rgba(0,0,0,0.7)',animation:'modal-in 0.2s ease-out'}}>
      <div style={{padding:'20px 22px',borderBottom:`1px solid ${C.b}`,display:'flex',justifyContent:'space-between',alignItems:'center',flexShrink:0}}>
        <span style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:17,color:C.tx}}>{title}</span>
        <button onClick={onClose} style={{background:'rgba(255,255,255,0.06)',border:`1px solid ${C.b}`,borderRadius:8,width:30,height:30,color:C.tx2,cursor:'pointer',fontSize:16,display:'flex',alignItems:'center',justifyContent:'center'}}>×</button>
      </div>
      <div style={{overflowY:'auto',flex:1,padding:'20px 22px'}}>{children}</div>
      {footer&&<div style={{padding:'16px 22px',borderTop:`1px solid ${C.b}`,flexShrink:0}}>{footer}</div>}
    </div>
  </div>
);

// ─────────────────────────────────────────────
//  BOT CONFIG MODAL
// ─────────────────────────────────────────────
const BotModal=memo(({bot,onClose,onSave,isNew,userPlan,exchanges=[]})=>{
  const isPremium=['premium','pro','trial'].includes(userPlan);
  const COLORS=['#00e5a0','#00d2ff','#ff4757','#ffb800','#a855f7','#39ff14','#ec4899','#f97316'];
  const[f,setF]=useState(bot?{
    name:bot.name,strategy:bot.strategy,botMode:bot.botMode,color:bot.color||'#00e5a0',
    startingBalance:bot.startingBalance,maxTradeUSD:bot.maxTradeUSD,
    stopLossPct:+(bot.stopLossPct*100).toFixed(1),takeProfitPct:+(bot.takeProfitPct*100).toFixed(1),
    maxDrawdownPct:+(bot.maxDrawdownPct*100).toFixed(0),maxPositionPct:+(bot.maxPositionPct*100).toFixed(0),
    leverageEnabled:bot.leverageEnabled,maxLeverage:bot.maxLeverage,
  }:{name:`Bot ${~~(Math.random()*900+100)}`,strategy:'PRECISION',botMode:'PAPER',color:'#00e5a0',
    startingBalance:10000,maxTradeUSD:500,stopLossPct:5,takeProfitPct:8,maxDrawdownPct:20,maxPositionPct:35,leverageEnabled:false,maxLeverage:3});
  const[tab,setTab]=useState('general');
  const[saving,setSaving]=useState(false);
  const[err,setErr]=useState('');
  const set=(k,v)=>setF(p=>({...p,[k]:v}));
  const sc=SC[f.strategy]||SC.PRECISION;

  async function save(){
    setSaving(true);setErr('');
    try{
      await onSave({...f,
        stopLossPct:+f.stopLossPct/100,takeProfitPct:+f.takeProfitPct/100,
        maxDrawdownPct:+f.maxDrawdownPct/100,maxPositionPct:+f.maxPositionPct/100,
        startingBalance:+f.startingBalance,maxTradeUSD:+f.maxTradeUSD,maxLeverage:+f.maxLeverage
      });
      onClose();
    }catch(e){setErr(e.message);}
    setSaving(false);
  }

  const TABS=['General','Strategy','Risk','Perps'];

  return(
    <Modal title={isNew?'Create New Bot':'Configure Bot'} onClose={onClose}
      footer={<div style={{display:'flex',gap:10}}>
        <button onClick={save} disabled={saving} style={{flex:1,padding:'11px',borderRadius:10,background:`linear-gradient(135deg,${f.color},${f.color}bb)`,border:'none',color:'#000',fontWeight:700,fontSize:13,cursor:saving?'wait':'pointer'}}>{saving?'Saving…':isNew?'Create Bot':'Save Changes'}</button>
        <button onClick={onClose} style={{padding:'11px 18px',borderRadius:10,background:'transparent',border:`1px solid ${C.b}`,color:C.tx2,cursor:'pointer',fontSize:13}}>Cancel</button>
      </div>}>

      {err&&<div style={{marginBottom:14,padding:'10px 13px',background:'rgba(255,71,87,0.1)',border:'1px solid rgba(255,71,87,0.3)',borderRadius:9,color:C.red,fontSize:12}}>{err}</div>}

      {/* Modal tabs */}
      <div style={{display:'flex',gap:0,borderBottom:`1px solid ${C.b}`,marginBottom:20,marginTop:-6}}>
        {TABS.map(t=><button key={t}onClick={()=>setTab(t)}style={{background:'transparent',border:'none',padding:'9px 14px',color:tab===t?C.amber:C.tx3,fontSize:11,fontWeight:700,cursor:'pointer',borderBottom:tab===t?`2px solid ${C.amber}`:'2px solid transparent',textTransform:'uppercase',letterSpacing:'0.07em',transition:'color 0.15s'}}>{t}</button>)}
      </div>

      {/* GENERAL */}
      {tab==='General'&&<div style={{display:'flex',flexDirection:'column',gap:16}}>
        <div style={{display:'grid',gridTemplateColumns:'1fr auto',gap:12,alignItems:'end'}}>
          <Inp label="Bot Name" value={f.name} onChange={v=>set('name',v)} placeholder="My Bot"/>
          <div>
            <div style={{color:C.tx3,fontSize:9,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:7,fontFamily:"'DM Mono',monospace"}}>Color</div>
            <div style={{display:'flex',gap:5}}>
              {COLORS.map(c=><div key={c}onClick={()=>set('color',c)}style={{width:24,height:24,borderRadius:'50%',background:c,cursor:'pointer',border:f.color===c?'2.5px solid #fff':'2px solid transparent',transform:f.color===c?'scale(1.2)':'scale(1)',transition:'transform 0.15s'}}/>)}
            </div>
          </div>
        </div>
        <div>
          <div style={{color:C.tx3,fontSize:9,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:8,fontFamily:"'DM Mono',monospace"}}>Trading Mode</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            {[['PAPER','📄 Paper Mode','Safe — simulated trades',C.cyan],['LIVE','🔴 Live Mode','Real money on exchange',C.red]].map(([m,label,desc,c])=>(
              <button key={m}onClick={()=>set('botMode',m)}style={{padding:'12px',borderRadius:10,border:`1.5px solid ${f.botMode===m?c+'66':C.b}`,background:f.botMode===m?`${c}10`:'transparent',cursor:'pointer',textAlign:'left',transition:'all 0.15s'}}>
                <div style={{fontWeight:700,fontSize:13,color:f.botMode===m?c:C.tx,marginBottom:3}}>{label}</div>
                <div style={{fontSize:10,color:C.tx3}}>{desc}</div>
              </button>
            ))}
          </div>
          {f.botMode==='LIVE'&&<div style={{marginTop:10,padding:'10px 13px',background:'rgba(255,71,87,0.08)',border:'1px solid rgba(255,71,87,0.2)',borderRadius:9,color:C.red,fontSize:11,lineHeight:1.5}}>⚠ Live mode executes real trades with real money. Connect an exchange first in the Exchanges tab.</div>}
        </div>
      </div>}

      {/* STRATEGY */}
      {tab==='Strategy'&&<div style={{display:'flex',flexDirection:'column',gap:10}}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
          {Object.entries(SC).map(([key,s])=>{
            const locked=s.tier==='premium'&&!isPremium;
            return(
              <button key={key}onClick={()=>!locked&&set('strategy',key)}
                style={{background:f.strategy===key?`${s.c}15`:'rgba(255,255,255,0.02)',border:`1.5px solid ${f.strategy===key?s.c:C.b}`,borderRadius:11,padding:'12px 13px',cursor:locked?'not-allowed':'pointer',textAlign:'left',opacity:locked?0.5:1,transition:'all 0.15s',position:'relative'}}>
                <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:5}}>
                  <span style={{fontSize:15}}>{s.icon}</span>
                  <span style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:12,color:f.strategy===key?s.c:C.tx}}>{key.replace('_',' ')}</span>
                  <span style={{marginLeft:'auto',fontSize:8,padding:'1px 6px',borderRadius:4,background:s.tier==='basic'?'rgba(0,229,160,0.12)':'rgba(255,184,0,0.12)',color:s.tier==='basic'?C.green:C.amber,border:`1px solid ${s.tier==='basic'?C.green+'40':C.amber+'40'}`,fontFamily:"'DM Mono',monospace"}}>{s.tier==='basic'?'FREE':'PRO'}</span>
                </div>
                <div style={{fontSize:10,color:C.tx3,lineHeight:1.4}}>{STRAT_DESC[key]?.slice(0,72)}…</div>
              </button>
            );
          })}
        </div>
        {f.strategy&&<div style={{padding:'12px 14px',background:`${SC[f.strategy]?.c||C.amber}0d`,border:`1px solid ${SC[f.strategy]?.c||C.amber}25`,borderRadius:10}}>
          <div style={{fontWeight:700,fontSize:11,color:SC[f.strategy]?.c||C.amber,marginBottom:4}}>Selected: {f.strategy.replace('_',' ')}</div>
          <div style={{color:C.tx3,fontSize:11,lineHeight:1.6}}>{STRAT_DESC[f.strategy]}</div>
        </div>}
        {!isPremium&&<div style={{padding:'12px 14px',background:'rgba(255,184,0,0.06)',border:'1px solid rgba(255,184,0,0.2)',borderRadius:10}}>
          <div style={{color:C.amber,fontSize:12,fontWeight:600,marginBottom:3}}>🔒 Premium Strategies Locked</div>
          <div style={{color:C.tx3,fontSize:11}}>MOMENTUM, SWING, REVERSAL, BREAKOUT, and AGGRESSIVE require a Premium subscription ($69.99/mo).</div>
        </div>}
      </div>}

      {/* RISK */}
      {tab==='Risk'&&<div style={{display:'flex',flexDirection:'column',gap:14}}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
          <Inp label="Starting Balance" value={f.startingBalance} onChange={v=>set('startingBalance',v)} type="number" min={1} prefix="$" note="Capital allocated to this bot"/>
          <Inp label="Max Trade Size" value={f.maxTradeUSD} onChange={v=>set('maxTradeUSD',v)} type="number" min={5} prefix="$" note="Max USD per single entry"/>
          <Inp label="Stop Loss" value={f.stopLossPct} onChange={v=>set('stopLossPct',v)} type="number" min={0.1} max={50} step={0.1} suffix="%" note="Exit at this % loss"/>
          <Inp label="Take Profit" value={f.takeProfitPct} onChange={v=>set('takeProfitPct',v)} type="number" min={0.5} max={200} step={0.5} suffix="%" note="Start taking profit here"/>
          <Inp label="Max Drawdown" value={f.maxDrawdownPct} onChange={v=>set('maxDrawdownPct',v)} type="number" min={5} max={95} suffix="%" note="Emergency liquidation"/>
          <Inp label="Max Position %" value={f.maxPositionPct} onChange={v=>set('maxPositionPct',v)} type="number" min={5} max={100} suffix="%" note="Max % in one coin"/>
        </div>
        <div style={{padding:'12px 14px',background:'rgba(255,184,0,0.06)',border:'1px solid rgba(255,184,0,0.15)',borderRadius:10,fontSize:11,color:C.tx2,lineHeight:1.7}}>
          <strong style={{color:C.amber}}>Tip:</strong> For AGGRESSIVE, use wider stops (8–12%) and higher targets (15–25%). For DCA+, smaller positions (5–15%) work best for systematic accumulation.
        </div>
      </div>}

      {/* PERPS */}
      {tab==='Perps'&&<div>
        <Toggle label="Enable Leverage / Perpetuals" desc="Trade perpetual futures with leverage on Binance Futures or Kraken Pro." checked={f.leverageEnabled} onChange={v=>set('leverageEnabled',v)} color={C.violet}/>
        {f.leverageEnabled?<div style={{marginTop:16}}>
          <div style={{color:C.tx3,fontSize:9,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:10,fontFamily:"'DM Mono',monospace"}}>Max Leverage</div>
          <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:16}}>
            {[2,3,5,10,15,20].map(n=>(
              <button key={n}onClick={()=>set('maxLeverage',n)}style={{padding:'9px 18px',borderRadius:9,border:`1.5px solid ${+f.maxLeverage===n?C.violet+'66':C.b}`,background:+f.maxLeverage===n?`${C.violet}14`:'transparent',color:+f.maxLeverage===n?C.violet:C.tx2,fontWeight:700,fontSize:14,cursor:'pointer',fontFamily:"'DM Mono',monospace",transition:'all 0.15s'}}>{n}x</button>
            ))}
          </div>
          <div style={{padding:'14px',background:`${C.violet}0a`,border:`1px solid ${C.violet}25`,borderRadius:10,fontSize:11,color:C.tx2,lineHeight:1.8}}>
            <div style={{color:C.violet,fontWeight:700,marginBottom:8}}>⚡ How Leverage Works</div>
            Effective stop loss: <strong style={{color:C.tx}}>{(+f.stopLossPct/+f.maxLeverage).toFixed(2)}%</strong> (SL ÷ leverage)<br/>
            Position size reduced <strong style={{color:C.tx}}>{+f.maxLeverage}×</strong> automatically<br/>
            Only activates on trades with confidence ≥ 8/10
          </div>
        </div>:<div style={{textAlign:'center',padding:'32px 20px',color:C.tx3}}>
          <div style={{fontSize:36,marginBottom:12,opacity:0.25}}>⚡</div>
          <div style={{fontSize:14,fontWeight:600,color:C.tx2,marginBottom:6}}>Leverage Disabled</div>
          <div style={{fontSize:12,lineHeight:1.6}}>Enable to trade perpetual futures with up to 20x leverage on supported exchanges. High risk — use with caution and only with exchange-connected bots.</div>
        </div>}
      </div>}
    </Modal>
  );
});

// ─────────────────────────────────────────────
//  AI CHAT
// ─────────────────────────────────────────────
const AIChat=memo(({onClose})=>{
  const[msgs,setMsgs]=useState([{role:'a',text:"Hi! I'm ARIA, your NEXUS AI assistant. Ask me anything about strategies, indicators, bot setup, or crypto markets."}]);
  const[input,setInput]=useState('');
  const[loading,setLoading]=useState(false);
  const end=useRef(null);
  useEffect(()=>end.current?.scrollIntoView({behavior:'smooth'}),[msgs]);

  const SUGGESTIONS=['How does PRECISION strategy work?','Best strategy for a bear market?','Explain RSI and stop loss setup','What is a Bollinger Band squeeze?'];

  async function send(msg){
    const m=(msg||input).trim();if(!m||loading)return;setInput('');
    setMsgs(p=>[...p,{role:'u',text:m}]);setLoading(true);
    try{const r=await api.aiChat(m);setMsgs(p=>[...p,{role:'a',text:r.reply}]);}
    catch(e){setMsgs(p=>[...p,{role:'a',text:'Error: '+e.message}]);}
    setLoading(false);
  }

  return(
    <div style={{position:'fixed',bottom:80,right:16,width:'min(380px,calc(100vw-32px))',height:500,background:C.bg3,border:`1px solid ${C.b2}`,borderRadius:18,display:'flex',flexDirection:'column',zIndex:400,boxShadow:'0 20px 60px rgba(0,0,0,0.7)',animation:'slide-up 0.2s ease-out'}}>
      <div style={{padding:'14px 16px',borderBottom:`1px solid ${C.b}`,display:'flex',alignItems:'center',gap:10,background:'rgba(255,184,0,0.04)',borderRadius:'18px 18px 0 0',flexShrink:0}}>
        <div style={{width:32,height:32,background:`linear-gradient(135deg,${C.amber},${C.amber2})`,borderRadius:9,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:14,color:'#000',boxShadow:`0 0 14px ${C.amber}40`}}>A</div>
        <div style={{flex:1}}>
          <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:14,color:C.tx}}>ARIA</div>
          <div style={{fontSize:9,color:C.amber,fontFamily:"'DM Mono',monospace"}}>AI Trading Assistant</div>
        </div>
        <button onClick={onClose} style={{background:'none',border:'none',color:C.tx3,fontSize:20,cursor:'pointer',padding:'0 4px'}}>×</button>
      </div>
      <div style={{flex:1,overflowY:'auto',padding:'14px',display:'flex',flexDirection:'column',gap:10}}>
        {msgs.map((m,i)=>(
          <div key={i} style={{display:'flex',justifyContent:m.role==='u'?'flex-end':'flex-start'}}>
            <div style={{maxWidth:'85%',padding:'10px 13px',borderRadius:m.role==='u'?'14px 14px 3px 14px':'14px 14px 14px 3px',background:m.role==='u'?`linear-gradient(135deg,${C.amber},${C.amber2})`:'rgba(255,255,255,0.06)',color:m.role==='u'?'#000':C.tx,fontSize:13,lineHeight:1.6}}>{m.text}</div>
          </div>
        ))}
        {loading&&<div style={{display:'flex',gap:5,padding:'10px 13px',background:'rgba(255,255,255,0.06)',borderRadius:'14px 14px 14px 3px',width:'fit-content'}}>
          {[0,1,2].map(i=><div key={i}style={{width:6,height:6,borderRadius:'50%',background:C.amber,animation:`breathe 1.2s ${i*0.2}s infinite`}}/>)}
        </div>}
        <div ref={end}/>
      </div>
      {msgs.length===1&&<div style={{padding:'0 14px 10px',display:'flex',flexDirection:'column',gap:5,flexShrink:0}}>
        {SUGGESTIONS.map(s=><button key={s}onClick={()=>send(s)}style={{textAlign:'left',padding:'8px 11px',borderRadius:8,border:`1px solid ${C.b}`,background:C.card,color:C.tx3,fontSize:11,cursor:'pointer',lineHeight:1.4,transition:'all 0.15s'}}>{s}</button>)}
      </div>}
      <div style={{padding:'12px 14px',borderTop:`1px solid ${C.b}`,display:'flex',gap:8,flexShrink:0}}>
        <input value={input}onChange={e=>setInput(e.target.value)}onKeyDown={e=>e.key==='Enter'&&!e.shiftKey&&send()}placeholder="Ask ARIA anything…"
          style={{flex:1,background:'rgba(0,0,0,0.3)',border:`1px solid ${C.b2}`,borderRadius:9,padding:'10px 13px',color:C.tx,fontSize:13,outline:'none'}}/>
        <button onClick={()=>send()} disabled={!input.trim()||loading} style={{padding:'10px 16px',borderRadius:9,background:`linear-gradient(135deg,${C.amber},${C.amber2})`,border:'none',color:'#000',fontWeight:700,fontSize:12,cursor:'pointer',opacity:!input.trim()||loading?0.4:1}}>↑</button>
      </div>
    </div>
  );
});

// ─────────────────────────────────────────────
//  SETTINGS MODAL
// ─────────────────────────────────────────────
const SettingsModal=memo(({user,plans=[],onClose})=>{
  const[tab,setTab]=useState('account');
  const isPremium=['premium','pro'].includes(user?.plan);

  return(
    <Modal title="Settings" onClose={onClose} width={640}>
      {/* Sidebar tabs */}
      <div style={{display:'flex',gap:0,borderBottom:`1px solid ${C.b}`,marginBottom:20,marginTop:-6,overflowX:'auto'}}>
        {['account','subscription','privacy','preferences'].map(t=>(
          <button key={t}onClick={()=>setTab(t)}style={{background:'transparent',border:'none',padding:'9px 16px',color:tab===t?C.amber:C.tx3,fontSize:11,fontWeight:700,cursor:'pointer',borderBottom:tab===t?`2px solid ${C.amber}`:'2px solid transparent',textTransform:'capitalize',letterSpacing:'0.04em',transition:'color 0.15s',whiteSpace:'nowrap'}}>{t}</button>
        ))}
      </div>

      {tab==='account'&&<div style={{display:'flex',flexDirection:'column',gap:16}}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
          <Inp label="First Name" value={user?.firstName||''} onChange={()=>{}} placeholder="First name"/>
          <Inp label="Last Name" value={user?.lastName||''} onChange={()=>{}} placeholder="Last name"/>
        </div>
        <Inp label="Email" value={user?.email||''} onChange={()=>{}} placeholder="email@example.com"/>
        <div style={{padding:'14px',background:C.card,borderRadius:11,border:`1px solid ${C.b}`}}>
          <div style={{color:C.tx3,fontSize:9,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:12,fontFamily:"'DM Mono',monospace"}}>Account Status</div>
          {[['Plan',<Pill c={isPremium?C.amber:C.cyan}>{user?.plan?.toUpperCase()||'TRIAL'}</Pill>],['Status',<Pill c={C.green} dot="pulse">ACTIVE</Pill>],['Max Bots',isPremium?'3':'1'],['Member Since',user?.createdAt?new Date(user.createdAt).toLocaleDateString():'—']].map(([k,v])=>(
            <div key={k}style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:`1px solid ${C.b}`,fontSize:13}}>
              <span style={{color:C.tx3}}>{k}</span>
              <span style={{color:C.tx,fontWeight:500}}>{typeof v==='string'||typeof v==='number'?v:<>{v}</>}</span>
            </div>
          ))}
        </div>
        <button style={{padding:'11px',borderRadius:10,background:`linear-gradient(135deg,${C.amber},${C.amber2})`,border:'none',color:'#000',fontWeight:700,fontSize:13,cursor:'pointer'}}>Save Changes</button>
      </div>}

      {tab==='subscription'&&<div style={{display:'flex',flexDirection:'column',gap:14}}>
        <div style={{color:C.tx3,fontSize:12,marginBottom:4}}>Choose the plan that's right for you. Upgrade anytime.</div>
        {plans.map(p=>(
          <div key={p.id}style={{border:`1.5px solid ${p.popular?`${C.amber}44`:C.b}`,borderRadius:14,padding:'18px',background:p.popular?`${C.amber}04`:C.card,position:'relative'}}>
            {p.popular&&<div style={{position:'absolute',top:-10,right:16,background:`linear-gradient(135deg,${C.amber},${C.amber2})`,color:'#000',fontSize:9,fontWeight:800,padding:'3px 12px',borderRadius:20,fontFamily:"'Syne',sans-serif",letterSpacing:'0.05em'}}>MOST POPULAR</div>}
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:12}}>
              <div>
                <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:18,color:C.tx,marginBottom:3}}>{p.name}</div>
                <div style={{color:C.tx3,fontSize:12}}>{p.bots} bot{p.bots!==1?'s':''} · {p.bots===1?'Basic strategies':'All 7 strategies'}</div>
              </div>
              <div style={{textAlign:'right'}}>
                <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:26,color:p.popular?C.amber:C.tx}}>${p.price}<span style={{fontSize:12,fontWeight:400,color:C.tx3}}>/mo</span></div>
              </div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:4,marginBottom:14}}>
              {(p.features||[]).map(f=><div key={f}style={{display:'flex',alignItems:'center',gap:5,fontSize:11,color:C.tx2}}><span style={{color:C.green}}>✓</span>{f}</div>)}
            </div>
            <button onClick={async()=>{try{await api.billingCheckout(p.id);}catch(e){alert(e.message);}}}
              style={{width:'100%',padding:'11px',borderRadius:10,background:user?.plan===p.id?'transparent':`linear-gradient(135deg,${p.popular?C.amber:C.cyan},${p.popular?C.amber2:C.cyan+'bb'})`,border:`1px solid ${user?.plan===p.id?C.b:p.popular?C.amber:C.cyan}`,color:user?.plan===p.id?C.tx2:'#000',fontWeight:700,fontSize:13,cursor:'pointer'}}>
              {user?.plan===p.id?'Current Plan':`Upgrade to ${p.name}`}
            </button>
          </div>
        ))}
        {!plans.length&&<div style={{textAlign:'center',padding:'32px',color:C.tx3,fontSize:12}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
            {[{name:'Basic',price:'29.99',bots:1,features:['1 trading bot','PRECISION strategy','DCA+ strategy','Paper trading','Email support']},
              {name:'Premium',price:'69.99',bots:3,popular:true,features:['3 simultaneous bots','All 7 strategies','Manual trading','AI assistant (ARIA)','Custom strategies','Priority support']}].map(p=>(
              <div key={p.name}style={{border:`1.5px solid ${p.popular?`${C.amber}44`:C.b}`,borderRadius:14,padding:16,background:p.popular?`${C.amber}04`:C.card,textAlign:'left',position:'relative'}}>
                {p.popular&&<div style={{position:'absolute',top:-9,right:12,background:`linear-gradient(135deg,${C.amber},${C.amber2})`,color:'#000',fontSize:8,fontWeight:800,padding:'2px 10px',borderRadius:20,fontFamily:"'Syne',sans-serif"}}>POPULAR</div>}
                <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:16,marginBottom:2}}>{p.name}</div>
                <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:22,color:p.popular?C.amber:C.tx,marginBottom:10}}>${p.price}<span style={{fontSize:11,fontWeight:400,color:C.tx3}}>/mo</span></div>
                {p.features.map(f=><div key={f}style={{display:'flex',gap:5,fontSize:11,color:C.tx2,marginBottom:4}}><span style={{color:C.green}}>✓</span>{f}</div>)}
              </div>
            ))}
          </div>
        </div>}
      </div>}

      {tab==='privacy'&&<div style={{color:C.tx2,fontSize:13,lineHeight:1.8}}>
        {[['Data Collection','NEXUS collects your email, trading activity, and bot configuration to provide the service. We never sell your personal information.'],['API Key Security','Exchange API keys are encrypted with AES-256-CBC and never leave our servers. They are used solely to execute trades on your behalf.'],['Trading Data','Your trading history and performance data are stored securely and used only to provide analytics within your account.'],['Your Rights','Request deletion of your account and all data at any time: privacy@nexustrader.io. Processed within 30 days.']].map(([t,d])=>(
          <div key={t}style={{marginBottom:16,paddingBottom:16,borderBottom:`1px solid ${C.b}`}}>
            <div style={{fontWeight:700,color:C.tx,marginBottom:5,fontSize:14}}>{t}</div>
            <div>{d}</div>
          </div>
        ))}
      </div>}

      {tab==='preferences'&&<div style={{display:'flex',flexDirection:'column',gap:2}}>
        <Toggle label="Trade Notifications" desc="Get notified when bots execute trades" checked={true} onChange={()=>{}}/>
        <Toggle label="Email Performance Reports" desc="Weekly P&L summary via email" checked={false} onChange={()=>{}}/>
        <Toggle label="AI Trade Confirmation" desc="Use Gemini AI to confirm high-confidence entries" checked={true} onChange={()=>{}}/>
        <Toggle label="Sound Alerts" desc="Play sound on trade execution" checked={false} onChange={()=>{}}/>
      </div>}
    </Modal>
  );
});

// ─────────────────────────────────────────────
//  MAIN DASHBOARD
// ─────────────────────────────────────────────
export default function Dashboard(){
  const{user,logout,setUser,loading:authLoading}=useAuth();
  const{bots,prices,strategies,connected}=useBotSocket();
  const nav=useNavigate();
  const[tab,setTab]=useState('bots');
  const[showNewBot,setShowNewBot]=useState(false);
  const[editBot,setEditBot]=useState(null);
  const[selBotId,setSelBotId]=useState(null);
  const[exchanges,setExchanges]=useState([]);
  const[busy,setBusy]=useState({});
  const[showAI,setShowAI]=useState(false);
  const[showSettings,setShowSettings]=useState(false);
  const[plans,setPlans]=useState([]);
  const[news,setNews]=useState([]);
  const[fearGreed,setFearGreed]=useState(null);
  const[globalMkt,setGlobalMkt]=useState(null);
  const[exForm,setExForm]=useState({exchange:'coinbase',apiKey:'',apiSecret:'',apiPassphrase:'',label:'',mode:'PAPER'});
  const[exLoading,setExLoading]=useState(false);
  const[exErr,setExErr]=useState('');
  const logRef=useRef(null);

  useEffect(()=>{
    if(!authLoading&&!user){nav('/login');return;}
    if(!user)return;
    api.exchanges().then(d=>setExchanges(d.exchanges||[])).catch(()=>{});
    api.plans().then(d=>setPlans(d.plans||[])).catch(()=>{});
    api.news().then(d=>setNews(d.articles||[])).catch(()=>{});
    api.fearGreed().then(setFearGreed).catch(()=>{});
    api.globalMkt().then(setGlobalMkt).catch(()=>{});
  },[user,authLoading]);

  useEffect(()=>{if(!selBotId&&bots.length)setSelBotId(bots[0].id);},[bots,selBotId]);
  const selBot=useMemo(()=>bots.find(b=>b.id===selBotId)||bots[0]||null,[bots,selBotId]);
  const logLen=selBot?.logs?.length||0;
  useEffect(()=>{const el=logRef.current;if(el)el.scrollTop=el.scrollHeight;},[logLen]);

  const totalVal=useMemo(()=>bots.reduce((s,b)=>s+(b.totalValue||b.balance||0),0),[bots]);
  const totalPnl=useMemo(()=>bots.reduce((s,b)=>s+(b.pnl||0),0),[bots]);
  const totalTrades=useMemo(()=>bots.reduce((s,b)=>s+(b.trades?.length||0),0),[bots]);
  const running=useMemo(()=>bots.filter(b=>['running','cycling'].includes(b.status)).length,[bots]);
  const overallWR=useMemo(()=>{const s=bots.flatMap(b=>b.trades?.filter(t=>t.type==='SELL')||[]);const w=s.filter(t=>t.pnl>0).length;return s.length?`${((w/s.length)*100).toFixed(0)}%`:'—';},[bots]);

  const isPremium=['premium','pro','trial'].includes(user?.plan);
  const maxBots=isPremium?3:1;

  const ctrl=async(action,id)=>{
    setBusy(p=>({...p,[id]:true}));
    try{
      if(action==='start')await api.startBot(id);
      else if(action==='stop')await api.stopBot(id);
      else if(action==='reset'){if(!confirm('Reset bot? All trades cleared.'))return;await api.resetBot(id);}
      else if(action==='delete'){if(!confirm('Delete this bot permanently?'))return;await api.deleteBot(id);if(selBotId===id)setSelBotId(null);}
    }catch(e){alert(e.message);}
    setBusy(p=>({...p,[id]:false}));
  };

  const connectEx=async()=>{
    setExErr('');setExLoading(true);
    try{await api.connectEx(exForm);const d=await api.exchanges();setExchanges(d.exchanges||[]);setExForm({exchange:'coinbase',apiKey:'',apiSecret:'',apiPassphrase:'',label:'',mode:'PAPER'});}
    catch(e){setExErr(e.message);}
    setExLoading(false);
  };

  if(authLoading||!user)return(
    <div style={{height:'100vh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:C.bg,gap:16}}>
      <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:24,color:C.amber}}>NEXUS</div>
      <div style={{color:C.tx3,fontSize:13}}>Loading your dashboard…</div>
      <style>{css}</style>
    </div>
  );

  const TABS=['bots','log','market','news','exchanges','analytics'];

  return(
    <div style={{minHeight:'100vh',background:C.bg,color:C.tx,fontFamily:"'Space Grotesk',sans-serif"}}>
      <style>{css}</style>

      {showNewBot&&<BotModal isNew onClose={()=>setShowNewBot(false)} onSave={async d=>{await api.createBot(d);setShowNewBot(false);}} userPlan={user?.plan} exchanges={exchanges}/>}
      {editBot&&<BotModal bot={editBot} onClose={()=>setEditBot(null)} onSave={async d=>{await api.updateBot(editBot.id,d);setEditBot(null);}} userPlan={user?.plan} exchanges={exchanges}/>}
      {showSettings&&<SettingsModal user={user} plans={plans} onClose={()=>setShowSettings(false)}/>}
      {showAI&&<AIChat onClose={()=>setShowAI(false)}/>}

      {/* ── TOP NAV ── */}
      <nav style={{position:'sticky',top:0,zIndex:100,background:'rgba(5,7,15,0.94)',backdropFilter:'blur(20px)',borderBottom:`1px solid ${C.b}`,padding:'0 16px',height:56,display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <div style={{width:32,height:32,background:`linear-gradient(135deg,${C.amber},${C.amber2})`,borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:13,color:'#000',boxShadow:`0 0 14px ${C.amber}35`}}>NX</div>
          <div>
            <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:15,lineHeight:1}}>NEX<span style={{color:C.amber}}>US</span></div>
            <div style={{display:'flex',alignItems:'center',gap:4,marginTop:1}}>
              <div style={{width:5,height:5,borderRadius:'50%',background:running>0?C.green:C.tx3,animation:running>0?'breathe 2s infinite':undefined}}/>
              <span style={{fontSize:9,color:C.tx3,fontFamily:"'DM Mono',monospace"}}>{running}/{bots.length} · {connected?'live':'reconnecting'}</span>
            </div>
          </div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <button onClick={()=>setShowAI(v=>!v)} style={{background:showAI?`${C.amber}15`:'transparent',border:`1px solid ${showAI?`${C.amber}55`:C.b}`,borderRadius:8,padding:'6px 12px',color:showAI?C.amber:C.tx3,cursor:'pointer',fontSize:11,fontWeight:600,display:'flex',alignItems:'center',gap:5,transition:'all 0.15s'}}>
            ✦ ARIA
          </button>
          <button onClick={()=>setShowSettings(true)} style={{background:'transparent',border:`1px solid ${C.b}`,borderRadius:8,width:34,height:34,color:C.tx3,cursor:'pointer',fontSize:16,display:'flex',alignItems:'center',justifyContent:'center'}}>⚙</button>
          <button onClick={()=>setShowNewBot(true)} style={{background:`linear-gradient(135deg,${C.amber},${C.amber2})`,border:'none',borderRadius:8,padding:'7px 14px',color:'#000',cursor:'pointer',fontSize:12,fontWeight:700}}>+ Bot</button>
        </div>
      </nav>

      {/* ── PORTFOLIO HERO ── */}
      <div style={{background:C.bg2,borderBottom:`1px solid ${C.b}`}}>
        <div style={{maxWidth:1200,margin:'0 auto',padding:'20px 20px 20px'}}>

          {/* Top row: big number + P&L */}
          <div style={{display:'flex',alignItems:'flex-end',justifyContent:'space-between',flexWrap:'wrap',gap:12,marginBottom:20}}>
            <div>
              <div style={{fontSize:10,color:C.tx3,fontFamily:"'DM Mono',monospace",letterSpacing:'0.12em',textTransform:'uppercase',marginBottom:8}}>Total Portfolio Value</div>
              <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:42,letterSpacing:'-0.03em',color:totalPnl>=0?C.green:C.red,lineHeight:1}}>{fu(totalVal)}</div>
              <div style={{display:'flex',alignItems:'center',gap:8,marginTop:8}}>
                <Pill c={totalPnl>=0?C.green:C.red}>{totalPnl>=0?'+':''}{fu(totalPnl)} today</Pill>
                <Pill c={totalPnl>=0?C.green:C.red}>{fp(bots.reduce((s,b)=>s+(b.pnlPct||0),0)/Math.max(bots.length,1))}</Pill>
              </div>
            </div>
            {/* BTC/ETH/SOL quick prices — right side on desktop */}
            <div className="hero-prices">
              {['BTC','ETH','SOL'].map(s=>{const p=prices[s];if(!p)return null;return(
                <div key={s}style={{background:C.card,borderRadius:12,padding:'12px 16px',border:`1px solid ${C.b}`,minWidth:100,textAlign:'center'}}>
                  <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:12,color:CC[s]||C.tx,marginBottom:4}}>{s}</div>
                  <div style={{fontFamily:"'DM Mono',monospace",fontSize:13,fontWeight:600,color:C.tx,marginBottom:3}}>{fu(p.price)}</div>
                  <div style={{fontSize:10,color:p.change24h>=0?C.green:C.red,fontFamily:"'DM Mono',monospace"}}>{p.change24h>=0?'▲':'▼'}{Math.abs(p.change24h).toFixed(2)}%</div>
                </div>
              );})}
            </div>
          </div>

          {/* Stat grid — 3 columns on mobile, 6 on desktop, all equal height */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10}}>
            {[
              {icon:'🎯',l:'Win Rate',   v:overallWR,                                            c:parseInt(overallWR)>=60?C.green:parseInt(overallWR)>=45?C.amber:C.red},
              {icon:'📈',l:'Total Trades',v:totalTrades,                                          c:C.cyan},
              {icon:'⚡',l:'Running',    v:`${running} of ${bots.length}`,                        c:running>0?C.green:C.tx3},
              {icon:'🔗',l:'Exchanges',  v:exchanges.length?`${exchanges.length} connected`:'None',c:exchanges.length?C.green:C.tx3},
              {icon:'💸',l:'Fees Paid',  v:fu(bots.reduce((s,b)=>s+(b.totalFees||0),0)),          c:C.tx3},
              {icon:'🤖',l:'Bots Active',v:`${bots.length} / ${maxBots}`,                         c:C.amber},
            ].map((s,i)=>(
              <div key={i} style={{background:C.card,borderRadius:12,padding:'14px 16px',border:`1px solid ${C.b}`,display:'flex',flexDirection:'column',gap:6}}>
                <div style={{display:'flex',alignItems:'center',gap:6}}>
                  <span style={{fontSize:14,lineHeight:1}}>{s.icon}</span>
                  <span style={{fontSize:9,color:C.tx3,fontFamily:"'DM Mono',monospace",letterSpacing:'0.1em',textTransform:'uppercase',fontWeight:600}}>{s.l}</span>
                </div>
                <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:18,color:s.c,letterSpacing:'-0.01em',lineHeight:1}}>{s.v}</div>
              </div>
            ))}
          </div>

        </div>
      </div>

      {/* ── TABS ── */}
      <div style={{background:C.bg2,borderBottom:`1px solid ${C.b}`}}>
        <div style={{maxWidth:1200,margin:'0 auto',display:'flex',overflowX:'auto',padding:'0 20px',gap:0}}>
          {TABS.map(t=>(
            <button key={t}onClick={()=>setTab(t)}style={{background:'transparent',border:'none',padding:'13px 16px',color:tab===t?C.amber:C.tx3,fontSize:11,fontWeight:700,cursor:'pointer',borderBottom:tab===t?`2px solid ${C.amber}`:'2px solid transparent',textTransform:'capitalize',letterSpacing:'0.05em',whiteSpace:'nowrap',transition:'color 0.15s'}}>{t}</button>
          ))}
        </div>
      </div>

      {/* ── CONTENT ── */}
      <div style={{maxWidth:1200,margin:'0 auto',padding:'20px',paddingBottom:100}}>

        {/* ━━━ BOTS TAB ━━━ */}
        {tab==='bots'&&(
          <div style={{display:'flex',flexDirection:'column',gap:20}}>

            {/* Bot cards grid — equal columns, never overflow */}
            <div className="bot-grid">
              {bots.map(bot=>{
                const isRunning=['running','cycling'].includes(bot.status);
                const tv=bot.totalValue||bot.balance||0;
                const pnl=tv-(bot.startingBalance||100);
                const sc=SC[bot.strategy]||SC.PRECISION;
                const sells=(bot.trades||[]).filter(t=>t.type==='SELL');
                const wins=sells.filter(t=>t.pnl>0).length;
                const wr=sells.length?`${((wins/sells.length)*100).toFixed(0)}%`:'—';
                const isSel=selBotId===bot.id;

                // Mini equity sparkline data
                let eqV=bot.startingBalance||100;
                const eqData=[{i:0,v:eqV}];
                [...(bot.trades||[])].reverse().forEach((t,i)=>{if(t.type==='SELL'&&t.pnl!=null){eqV+=t.pnl;eqData.push({i:i+1,v:+eqV.toFixed(2)});}});

                return(
                  <Card key={bot.id} accent={sc.c} running={isRunning} selected={isSel}
                    onClick={()=>setSelBotId(bot.id)}>

                    {/* Bot header */}
                    <div style={{padding:'16px 16px 12px',paddingLeft:19}}>
                      {/* Name + value row */}
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8,marginBottom:10}}>
                        <div style={{minWidth:0,flex:1}}>
                          <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:15,color:C.tx,marginBottom:6,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{bot.name}</div>
                          <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
                            <Pill c={sc.c}>{sc.icon} {bot.strategy.replace('_',' ')}</Pill>
                            {bot.leverageEnabled&&<Pill c={C.violet}>⚡{bot.maxLeverage}x</Pill>}
                            <Pill c={bot.botMode==='LIVE'?C.red:C.cyan}>{bot.botMode}</Pill>
                            {isRunning&&<Pill c={C.green} dot="pulse">LIVE</Pill>}
                          </div>
                        </div>
                        <div style={{textAlign:'right',flexShrink:0}}>
                          <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:18,color:pnl>=0?C.green:C.red,letterSpacing:'-0.02em',lineHeight:1,whiteSpace:'nowrap'}}>{fu(tv)}</div>
                          <div style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:pnl>=0?C.green:C.red,marginTop:4,whiteSpace:'nowrap'}}>{pnl>=0?'+':''}{fu(pnl)} ({fp(((tv/(bot.startingBalance||100))-1)*100)})</div>
                        </div>
                      </div>

                      {/* 4-stat row — always equal columns */}
                      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:6}}>
                        {[['Cash',fu(bot.balance),''],['Win',wr,parseInt(wr)>=50?C.green:parseInt(wr)>0?C.amber:C.tx3],['Trades',bot.trades?.length||0,C.cyan],['Cycles',bot.cycleCount||0,'']].map(([l,v,c])=>(
                          <div key={l}style={{background:'rgba(255,255,255,0.04)',borderRadius:8,padding:'8px 6px',textAlign:'center'}}>
                            <div style={{fontFamily:"'DM Mono',monospace",fontSize:8,color:C.tx3,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:3}}>{l}</div>
                            <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:12,color:c||C.tx,overflow:'hidden',textOverflow:'ellipsis'}}>{v}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Sparkline */}
                    {eqData.length>=2&&<div style={{height:48,padding:'0 0 4px',background:'rgba(0,0,0,0.15)'}}>
                      <ResponsiveContainer width="100%"height="100%">
                        <AreaChart data={eqData} margin={{top:4,right:0,left:0,bottom:0}}>
                          <defs><linearGradient id={`eq${bot.id.slice(0,4)}`}x1="0"y1="0"x2="0"y2="1"><stop offset="0%"stopColor={sc.c}stopOpacity={0.3}/><stop offset="100%"stopColor={sc.c}stopOpacity={0}/></linearGradient></defs>
                          <XAxis dataKey="i"hide/><YAxis domain={['auto','auto']}hide/>
                          <Area type="monotone"dataKey="v"stroke={sc.c}strokeWidth={1.5}fill={`url(#eq${bot.id.slice(0,4)})`}dot={false}/>
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>}

                    {/* Most recent trade */}
                    {bot.trades?.length>0&&(()=>{
                      const t=bot.trades[0];
                      const ac=t.type==='BUY'?C.green:t.pnl>=0?C.cyan:C.red;
                      return<div style={{padding:'8px 18px',borderTop:`1px solid ${C.b}`,display:'flex',alignItems:'center',gap:8,background:'rgba(0,0,0,0.1)'}}>
                        <Pill c={ac}>{t.type}</Pill>
                        <span style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:11,color:CC[t.coin]||C.tx}}>{t.coin}</span>
                        <span style={{color:C.tx3,fontSize:10,flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.reasoning?.slice(0,50)}</span>
                        {t.pnl!=null&&<span style={{fontFamily:"'DM Mono',monospace",fontSize:10,fontWeight:600,color:t.pnl>=0?C.green:C.red,flexShrink:0}}>{t.pnl>=0?'+':''}{fu(t.pnl)}</span>}
                      </div>;
                    })()}

                    {/* Controls */}
                    <div style={{padding:'10px 16px',paddingLeft:18,borderTop:`1px solid ${C.b}`,display:'flex',gap:6}}>
                      {isRunning
                        ?<button onClick={e=>{e.stopPropagation();ctrl('stop',bot.id);}}disabled={busy[bot.id]}style={{flex:1,padding:'8px',borderRadius:8,border:`1px solid ${C.red}44`,background:`${C.red}10`,color:C.red,cursor:'pointer',fontSize:11,fontWeight:700,transition:'all 0.15s'}}>◼ Stop</button>
                        :<button onClick={e=>{e.stopPropagation();ctrl('start',bot.id);}}disabled={busy[bot.id]}style={{flex:1,padding:'8px',borderRadius:8,border:`1px solid ${sc.c}44`,background:`${sc.c}10`,color:sc.c,cursor:'pointer',fontSize:11,fontWeight:700,transition:'all 0.15s'}}>▶ Start</button>
                      }
                      <button onClick={e=>{e.stopPropagation();ctrl('reset',bot.id);}}disabled={busy[bot.id]}style={{padding:'8px 11px',borderRadius:8,border:`1px solid ${C.b}`,background:'transparent',color:C.tx3,cursor:'pointer',fontSize:12,title:'Reset'}}>↺</button>
                      <button onClick={e=>{e.stopPropagation();setEditBot(bot);}}style={{padding:'8px 11px',borderRadius:8,border:`1px solid ${C.b}`,background:'transparent',color:C.tx3,cursor:'pointer',fontSize:12}}>⚙</button>
                      <button onClick={e=>{e.stopPropagation();ctrl('delete',bot.id);}}style={{padding:'8px 11px',borderRadius:8,border:'1px solid rgba(255,71,87,0.2)',background:'transparent',color:C.red,cursor:'pointer',fontSize:12}}>✕</button>
                    </div>
                  </Card>
                );
              })}

              {/* Add bot card */}
              {bots.length<maxBots&&(
                <button onClick={()=>setShowNewBot(true)}
                  style={{background:'transparent',border:`2px dashed ${C.b2}`,borderRadius:16,padding:'32px 20px',cursor:'pointer',color:C.tx3,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:12,minHeight:220,transition:'all 0.2s'}}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor=`${C.amber}55`;e.currentTarget.style.color=C.tx2;}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor=C.b2;e.currentTarget.style.color=C.tx3;}}>
                  <div style={{width:52,height:52,borderRadius:14,background:`${C.amber}12`,border:`1px solid ${C.amber}25`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:26,color:C.amber}}>+</div>
                  <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:15}}>Add Bot</div>
                  <div style={{fontSize:12,textAlign:'center',lineHeight:1.6,maxWidth:180}}>{maxBots-bots.length} slot{maxBots-bots.length!==1?'s':''} remaining. Run multiple strategies simultaneously.</div>
                </button>
              )}
            </div>{/* end bot cards grid */}

            {/* Selected bot detail — trade history + positions + config */}
            {selBot&&(
              <div className="detail-grid">

                {/* LEFT: Trade history */}
                <div style={{background:C.card,border:`1px solid ${C.b}`,borderRadius:14,overflow:'hidden'}}>
                  <div style={{padding:'12px 16px',borderBottom:`1px solid ${C.b}`,display:'flex',justifyContent:'space-between',alignItems:'center',background:'rgba(0,0,0,0.2)'}}>
                    <span style={{fontSize:9,fontWeight:700,letterSpacing:'0.12em',textTransform:'uppercase',color:C.tx3,fontFamily:"'DM Mono',monospace",display:'flex',alignItems:'center',gap:6}}>
                      <span style={{width:4,height:4,borderRadius:'50%',background:C.amber,display:'inline-block'}}/>
                      {selBot.name} · Trade History
                    </span>
                    <span style={{color:C.tx3,fontSize:9,fontFamily:"'DM Mono',monospace"}}>{selBot.trades?.length||0} trades</span>
                  </div>
                  {!selBot.trades?.length
                    ?<div style={{padding:'36px',textAlign:'center',color:C.tx3}}>
                      <div style={{fontSize:32,marginBottom:10,opacity:0.2}}>🤖</div>
                      <div style={{fontWeight:600,fontSize:14,color:C.tx2,marginBottom:6}}>No trades yet</div>
                      <div style={{fontSize:12,lineHeight:1.7}}>Start the bot to begin trading with the <strong style={{color:C.tx}}>{selBot.strategy}</strong> strategy.</div>
                    </div>
                    :<div style={{maxHeight:360,overflowY:'auto'}}>
                      {(selBot.trades||[]).slice(0,80).map((t,i)=>{
                        const ac=t.type==='BUY'?C.green:t.pnl>=0?C.cyan:C.red;
                        return<div key={i}className="row"style={{padding:'9px 16px',borderBottom:`1px solid ${C.b}`,display:'flex',alignItems:'center',gap:8,transition:'background 0.1s'}}>
                          <Pill c={ac}>{t.type}</Pill>
                          <span style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:11,color:CC[t.coin]||C.tx,minWidth:34,flexShrink:0}}>{t.coin}</span>
                          <span style={{color:C.tx3,fontSize:9,fontFamily:"'DM Mono',monospace",flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.reasoning?.slice(0,64)}</span>
                          <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',flexShrink:0,gap:1}}>
                            {t.pnl!=null&&<span style={{fontFamily:"'DM Mono',monospace",fontSize:10,fontWeight:600,color:t.pnl>=0?C.green:C.red}}>{t.pnl>=0?'+':''}{fu(t.pnl)}</span>}
                            <span style={{color:C.tx3,fontSize:9,fontFamily:"'DM Mono',monospace"}}>{ft(t.ts)}</span>
                          </div>
                        </div>;
                      })}
                    </div>
                  }
                </div>

                {/* RIGHT: Positions + Config stacked */}
                <div style={{display:'flex',flexDirection:'column',gap:14}}>
                  {/* Open Positions */}
                  <div style={{background:C.card,border:`1px solid ${C.b}`,borderRadius:14,overflow:'hidden'}}>
                    <div style={{padding:'12px 16px',borderBottom:`1px solid ${C.b}`,display:'flex',justifyContent:'space-between',alignItems:'center',background:'rgba(0,0,0,0.2)'}}>
                      <span style={{fontSize:9,fontWeight:700,letterSpacing:'0.12em',textTransform:'uppercase',color:C.tx3,fontFamily:"'DM Mono',monospace",display:'flex',alignItems:'center',gap:6}}><span style={{width:4,height:4,borderRadius:'50%',background:C.green,display:'inline-block'}}/>Open Positions</span>
                      <span style={{color:C.tx3,fontSize:9,fontFamily:"'DM Mono',monospace"}}>{Object.keys(selBot.portfolio||{}).length} open</span>
                    </div>
                    {!Object.keys(selBot.portfolio||{}).length
                      ?<div style={{padding:'20px 16px',textAlign:'center',color:C.tx3,fontSize:12}}>No open positions</div>
                      :<div>
                        {Object.entries(selBot.portfolio||{}).map(([sym,pos])=>{
                          const px=prices[sym]?.price,pv=px?pos.qty*px:0,pp=px?(px-pos.avgCost)*pos.qty:0;
                          return<div key={sym}style={{padding:'11px 16px',borderBottom:`1px solid ${C.b}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                            <div>
                              <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:13,color:CC[sym]||C.tx}}>{sym}{pos.leverage>1&&<span style={{fontSize:9,color:C.violet}}> ⚡{pos.leverage}x</span>}</div>
                              <div style={{fontSize:10,color:C.tx3,fontFamily:"'DM Mono',monospace",marginTop:2}}>{pos.qty.toFixed(4)} @ {fu(pos.avgCost)}</div>
                            </div>
                            <div style={{textAlign:'right'}}>
                              <div style={{fontFamily:"'DM Mono',monospace",fontSize:12,fontWeight:600,color:C.tx}}>{fu(pv)}</div>
                              <div style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:pp>=0?C.green:C.red}}>{pp>=0?'+':''}{fu(pp)}</div>
                            </div>
                          </div>;
                        })}
                      </div>
                    }
                  </div>
                  {/* Config */}
                  <div style={{background:C.card,border:`1px solid ${C.b}`,borderRadius:14,padding:'16px'}}>
                    <div style={{fontSize:9,fontWeight:700,letterSpacing:'0.12em',textTransform:'uppercase',color:C.tx3,fontFamily:"'DM Mono',monospace",marginBottom:12,display:'flex',alignItems:'center',gap:5}}><span style={{width:4,height:4,borderRadius:'50%',background:C.amber,display:'inline-block'}}/>Configuration</div>
                    {[['Strategy',<Pill c={SC[selBot.strategy]?.c||C.cyan}>{selBot.strategy.replace('_',' ')}</Pill>],['Mode',<Pill c={selBot.botMode==='LIVE'?C.red:C.cyan}>{selBot.botMode}</Pill>],['Balance',fu(selBot.balance)],['Stop / Take',`${fp(-selBot.stopLossPct*100)} / ${fp(selBot.takeProfitPct*100)}`],['Max Trade',fu(selBot.maxTradeUSD)],['Leverage',selBot.leverageEnabled?`⚡ ${selBot.maxLeverage}x`:'Off'],['Cycles',selBot.cycleCount||0]].map(([k,v])=>(
                      <div key={k}style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:`1px solid ${C.b}`,fontSize:12}}>
                        <span style={{color:C.tx3}}>{k}</span>
                        <span style={{color:C.tx,fontWeight:500}}>{typeof v==='string'||typeof v==='number'?v:<>{v}</>}</span>
                      </div>
                    ))}
                    <button onClick={()=>setEditBot(selBot)}
                      style={{width:'100%',marginTop:12,padding:'10px',borderRadius:9,border:`1px solid ${C.b2}`,background:'transparent',color:C.tx2,fontSize:12,cursor:'pointer',fontWeight:600,transition:'all 0.15s'}}
                      onMouseEnter={e=>e.currentTarget.style.borderColor=C.amber}
                      onMouseLeave={e=>e.currentTarget.style.borderColor=C.b2}>
                      ⚙ Configure Bot
                    </button>
                  </div>
                </div>
              </div>
            )}{/* end selBot detail */}

            {/* Empty state */}
            {!bots.length&&(
              <div style={{textAlign:'center',padding:'60px 20px'}}>
                <div style={{fontSize:48,marginBottom:16,opacity:0.2}}>🤖</div>
                <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:22,marginBottom:8}}>No Bots Yet</div>
                <div style={{color:C.tx3,fontSize:14,lineHeight:1.7,maxWidth:360,margin:'0 auto 24px'}}>Create your first trading bot. Choose a strategy, set your risk parameters, and let NEXUS trade 24/7.</div>
                <button onClick={()=>setShowNewBot(true)}style={{padding:'12px 28px',borderRadius:11,background:`linear-gradient(135deg,${C.amber},${C.amber2})`,border:'none',color:'#000',fontWeight:700,fontSize:14,cursor:'pointer'}}>+ Create First Bot</button>
              </div>
            )}
          </div>
        )}

        {/* ━━━ LIVE LOG ━━━ */}
        {tab==='log'&&(
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {bots.length>1&&<div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
              {bots.map(b=>{const sc=SC[b.strategy]||SC.PRECISION;return<button key={b.id}onClick={()=>setSelBotId(b.id)}style={{padding:'7px 14px',borderRadius:8,border:`1.5px solid ${selBotId===b.id?sc.c:C.b}`,background:selBotId===b.id?`${sc.c}14`:'transparent',color:selBotId===b.id?sc.c:C.tx3,fontSize:12,fontWeight:600,cursor:'pointer',transition:'all 0.15s'}}>{b.name}</button>;})}
            </div>}
            <div style={{background:C.card,border:`1px solid ${C.b}`,borderRadius:14,overflow:'hidden'}}>
              <div style={{padding:'11px 14px',borderBottom:`1px solid ${C.b}`,display:'flex',justifyContent:'space-between',alignItems:'center',background:'rgba(0,0,0,0.2)'}}>
                <span style={{fontSize:9,fontWeight:700,letterSpacing:'0.12em',textTransform:'uppercase',color:C.tx3,fontFamily:"'DM Mono',monospace",display:'flex',alignItems:'center',gap:6}}><span style={{width:4,height:4,borderRadius:'50%',background:C.green,animation:'breathe 2s infinite',display:'inline-block'}}/>LIVE AI Reasoning Log · {selBot?.name}</span>
                <span style={{color:C.tx3,fontSize:9,fontFamily:"'DM Mono',monospace"}}>{selBot?.logs?.length||0} entries</span>
              </div>
              <div ref={logRef}style={{height:'calc(100vh - 340px)',overflowY:'auto',background:'rgba(0,0,0,0.25)',fontFamily:"'DM Mono',monospace",fontSize:10,lineHeight:1.8}}>
                {!selBot?.logs?.length&&<div style={{padding:28,textAlign:'center',color:C.tx3}}><div style={{fontSize:24,marginBottom:8,opacity:0.3}}>📋</div>Log appears when a bot starts running.</div>}
                {(selBot?.logs||[]).map((e,i)=>{
                  const lc={CYCLE:'#2d3748',AI:C.violet,SIGNAL:C.green,TRADE:C.green,PROFIT:C.green,LOSS:C.red,HOLD:C.tx3,WARN:C.amber,ERROR:C.red,SYSTEM:C.cyan,INFO:C.tx3}[e.level]||C.tx3;
                  const big=['TRADE','PROFIT','LOSS','CYCLE','SIGNAL'].includes(e.level);
                  return<div key={i}style={{padding:big?'6px 14px':'2px 14px',borderBottom:big?`1px solid ${C.b}`:'none',background:big?'rgba(255,255,255,0.015)':'transparent',display:'flex',gap:10}}>
                    <span style={{color:'#2d3748',fontSize:9,flexShrink:0}}>{ft(e.ts)}</span>
                    <span style={{color:lc,fontSize:9,fontWeight:700,minWidth:54,flexShrink:0}}>[{e.level}]</span>
                    <span style={{color:big?C.tx:C.tx3,fontSize:big?11:9,lineHeight:1.6}}>{e.msg}</span>
                  </div>;
                })}
              </div>
            </div>
          </div>
        )}

        {/* ━━━ MARKET ━━━ */}
        {tab==='market'&&(
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))',gap:10}}>
            {Object.entries(prices).sort((a,b)=>Math.abs(b[1]?.change24h||0)-Math.abs(a[1]?.change24h||0)).map(([sym,d])=>{
              const held=bots.some(b=>b.portfolio?.[sym]);
              const cc=CC[sym]||C.tx;
              return<div key={sym}style={{background:C.card,border:`1px solid ${held?cc+'35':C.b}`,borderRadius:12,padding:'13px',transition:'transform 0.15s',cursor:'default'}}
                onMouseEnter={e=>e.currentTarget.style.transform='translateY(-2px)'}
                onMouseLeave={e=>e.currentTarget.style.transform=''}>
                {held&&<div style={{marginBottom:5}}><Pill c={cc}>HELD</Pill></div>}
                <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:13,color:cc,marginBottom:3}}>{sym}</div>
                <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:15,letterSpacing:'-0.01em',marginBottom:5}}>{fu(d.price)}</div>
                <div style={{display:'inline-flex',alignItems:'center',gap:3,background:d.change24h>=0?'rgba(0,229,160,0.1)':'rgba(255,71,87,0.1)',padding:'2px 8px',borderRadius:20}}>
                  <span style={{fontSize:10,color:d.change24h>=0?C.green:C.red,fontFamily:"'DM Mono',monospace"}}>{d.change24h>=0?'▲':'▼'}{Math.abs(d.change24h).toFixed(2)}%</span>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:3,marginTop:8}}>
                  {[['Vol',fu(d.volume24h)],['H',fu(d.high24h)]].map(([l,v])=>(
                    <div key={l}style={{background:'rgba(255,255,255,0.04)',padding:'4px 6px',borderRadius:5}}>
                      <div style={{fontSize:7,color:C.tx3,fontFamily:"'DM Mono',monospace",textTransform:'uppercase'}}>{l}</div>
                      <div style={{fontSize:9,color:C.tx3,fontFamily:"'DM Mono',monospace"}}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>;
            })}
          </div>
        )}

        {/* ━━━ NEWS ━━━ */}
        {tab==='news'&&(
          <div style={{display:'flex',flexDirection:'column',gap:14}}>
            {/* Fear & Greed + Global Market */}
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:12}}>
              {fearGreed?.current&&(()=>{const fi={label:'—',c:C.tx3,...(+fearGreed.current.value<=25?{label:'Extreme Fear',c:'#ff2020'}:+fearGreed.current.value<=45?{label:'Fear',c:'#ff6b35'}:+fearGreed.current.value<=55?{label:'Neutral',c:C.amber}:+fearGreed.current.value<=75?{label:'Greed',c:C.cyan}:{label:'Extreme Greed',c:C.green})};return(
                <div style={{background:C.card,border:`1px solid ${fi.c}28`,borderRadius:14,padding:'16px',textAlign:'center'}}>
                  <div style={{fontSize:9,color:C.tx3,fontFamily:"'DM Mono',monospace",letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:8}}>Fear & Greed</div>
                  <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:42,color:fi.c,lineHeight:1}}>{fearGreed.current.value}</div>
                  <div style={{color:fi.c,fontSize:12,marginTop:5,marginBottom:10}}>{fi.label}</div>
                  <div style={{display:'flex',gap:3,justifyContent:'center',alignItems:'flex-end',height:28}}>
                    {(fearGreed.history||[]).map((d,i)=>{const h=(+fearGreed.current.value<=25?{c:'#ff2020'}:+fearGreed.current.value<=45?{c:'#ff6b35'}:+fearGreed.current.value<=55?{c:C.amber}:+fearGreed.current.value<=75?{c:C.cyan}:{c:C.green});return<div key={i}style={{width:7,background:fi.c,borderRadius:2,height:`${+d.value/100*28}px`,opacity:i===0?1:0.4}}/>;})}
                  </div>
                </div>
              );})()}
              {globalMkt&&(
                <div style={{background:C.card,border:`1px solid ${C.b}`,borderRadius:14,padding:'16px'}}>
                  <div style={{fontSize:9,color:C.tx3,fontFamily:"'DM Mono',monospace",letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:12}}>Global Market</div>
                  {[['Total Market Cap',fu(globalMkt.totalMarketCap)],['24h Volume',fu(globalMkt.totalVolume)],['BTC Dominance',`${globalMkt.btcDominance?.toFixed(1)||'—'}%`],['ETH Dominance',`${globalMkt.ethDominance?.toFixed(1)||'—'}%`],['MCap Change',fp(globalMkt.marketCapChange)]].map(([k,v])=>(
                    <div key={k}style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:`1px solid ${C.b}`,fontSize:12}}>
                      <span style={{color:C.tx3}}>{k}</span>
                      <span style={{fontFamily:"'DM Mono',monospace",fontWeight:600,color:C.tx}}>{v}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* News articles */}
            <div style={{background:C.card,border:`1px solid ${C.b}`,borderRadius:14,overflow:'hidden'}}>
              <div style={{padding:'11px 14px',borderBottom:`1px solid ${C.b}`,display:'flex',justifyContent:'space-between',alignItems:'center',background:'rgba(0,0,0,0.2)'}}>
                <span style={{fontSize:9,fontWeight:700,letterSpacing:'0.12em',textTransform:'uppercase',color:C.tx3,fontFamily:"'DM Mono',monospace",display:'flex',alignItems:'center',gap:6}}><span style={{width:4,height:4,borderRadius:'50%',background:C.amber,display:'inline-block'}}/>Crypto News</span>
                <span style={{color:C.tx3,fontSize:9,fontFamily:"'DM Mono',monospace"}}>Live · CryptoPanic</span>
              </div>
              {!news.length&&<div style={{padding:24,textAlign:'center',color:C.tx3,fontSize:12}}>Loading news…</div>}
              {news.map(a=>(
                <a key={a.id}href={a.url}target="_blank"rel="noreferrer"style={{display:'block',padding:'13px 14px',borderBottom:`1px solid ${C.b}`,textDecoration:'none',transition:'background 0.1s'}}
                  onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.025)'}
                  onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  <div style={{display:'flex',gap:8,alignItems:'flex-start',marginBottom:6}}>
                    <div style={{flex:1,color:C.tx,fontSize:13,fontWeight:500,lineHeight:1.45}}>{a.title}</div>
                    {a.sentiment&&<span style={{flexShrink:0,fontSize:8,padding:'2px 7px',borderRadius:4,background:a.sentiment==='bullish'?'rgba(0,229,160,0.1)':a.sentiment==='bearish'?'rgba(255,71,87,0.1)':'rgba(255,184,0,0.1)',color:a.sentiment==='bullish'?C.green:a.sentiment==='bearish'?C.red:C.amber,border:`1px solid currentColor`,fontFamily:"'DM Mono',monospace",opacity:0.8}}>{a.sentiment}</span>}
                  </div>
                  <div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
                    <span style={{color:C.tx3,fontSize:10,fontFamily:"'DM Mono',monospace"}}>{a.source}</span>
                    <span style={{color:C.tx3,fontSize:9}}>·</span>
                    <span style={{color:C.tx3,fontSize:10,fontFamily:"'DM Mono',monospace"}}>{fa(a.published)}</span>
                    {(a.coins||[]).map(c=><span key={c}style={{fontSize:9,padding:'1px 6px',borderRadius:4,background:`${C.amber}10`,color:C.amber,fontFamily:"'DM Mono',monospace"}}>{c}</span>)}
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* ━━━ EXCHANGES ━━━ */}
        {tab==='exchanges'&&(
          <div style={{display:'flex',flexDirection:'column',gap:14}}>
            {exErr&&<div style={{padding:'11px 14px',background:'rgba(255,71,87,0.08)',border:'1px solid rgba(255,71,87,0.25)',borderRadius:10,color:C.red,fontSize:12}}>{exErr}</div>}
            <div style={{background:C.card,border:`1px solid ${C.b}`,borderRadius:14,padding:'16px'}}>
              <div style={{fontSize:9,fontWeight:700,letterSpacing:'0.12em',textTransform:'uppercase',color:C.tx3,fontFamily:"'DM Mono',monospace",marginBottom:14,display:'flex',alignItems:'center',gap:5}}><span style={{width:4,height:4,borderRadius:'50%',background:C.amber,display:'inline-block'}}/>Connect Exchange</div>
              <div style={{display:'flex',gap:6,marginBottom:14}}>
                {[['coinbase','Coinbase','#0052ff'],['binance','Binance','#f0b90b'],['kraken','Kraken','#5741d9']].map(([id,name,c])=>(
                  <button key={id}onClick={()=>setExForm(f=>({...f,exchange:id}))}style={{flex:1,padding:'10px 6px',borderRadius:9,border:`1.5px solid ${exForm.exchange===id?c:C.b}`,background:exForm.exchange===id?`${c}14`:'transparent',color:exForm.exchange===id?c:C.tx3,fontSize:12,fontWeight:600,cursor:'pointer',transition:'all 0.15s'}}>{name}</button>
                ))}
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:12}}>
                {[['API Key','apiKey','text'],['API Secret','apiSecret','password'],exForm.exchange==='coinbase'?['Passphrase','apiPassphrase','password']:null,['Label (optional)','label','text']].filter(Boolean).map(([l,k,t])=>(
                  <Inp key={k} label={l} value={exForm[k]} onChange={v=>setExForm(f=>({...f,[k]:v}))} type={t} placeholder={`Your ${l.toLowerCase()}`}/>
                ))}
                <div style={{display:'flex',gap:8}}>
                  {[['PAPER','📄 Paper',C.cyan],['LIVE','🔴 Live',C.red]].map(([m,label,c])=>(
                    <button key={m}onClick={()=>setExForm(f=>({...f,mode:m}))}style={{flex:1,padding:'10px',borderRadius:9,border:`1.5px solid ${exForm.mode===m?c+'55':C.b}`,background:exForm.mode===m?`${c}12`:'transparent',color:exForm.mode===m?c:C.tx3,fontSize:12,fontWeight:600,cursor:'pointer',transition:'all 0.15s'}}>{label}</button>
                  ))}
                </div>
                <div style={{padding:'11px 13px',background:'rgba(255,184,0,0.06)',border:'1px solid rgba(255,184,0,0.15)',borderRadius:9,fontSize:11,color:'#b38800',lineHeight:1.6}}>⚠ Only grant <strong>Trade + Read</strong> permissions. Never grant withdrawal access. All keys are AES-256 encrypted.</div>
                <button onClick={connectEx}disabled={exLoading}style={{padding:'12px',borderRadius:10,background:`linear-gradient(135deg,${C.green},${C.green}bb)`,border:'none',color:'#000',fontWeight:700,fontSize:13,cursor:'pointer',opacity:exLoading?0.6:1}}>{exLoading?'Connecting…':'Connect Exchange'}</button>
              </div>
            </div>

            {exchanges.length>0&&<div style={{background:C.card,border:`1px solid ${C.b}`,borderRadius:14,overflow:'hidden'}}>
              <div style={{padding:'11px 14px',borderBottom:`1px solid ${C.b}`,background:'rgba(0,0,0,0.2)'}}><span style={{fontSize:9,fontWeight:700,letterSpacing:'0.12em',textTransform:'uppercase',color:C.tx3,fontFamily:"'DM Mono',monospace"}}>Connected ({exchanges.length})</span></div>
              {exchanges.map(ex=>(
                <div key={ex.id}style={{padding:'14px',borderBottom:`1px solid ${C.b}`,display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                  <div>
                    <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:14,marginBottom:4,textTransform:'capitalize'}}>{ex.exchange}</div>
                    <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                      <Pill c={ex.isActive?C.green:C.tx3} dot="pulse">{ex.isActive?'Active':'Inactive'}</Pill>
                      <Pill c={ex.mode==='LIVE'?C.red:C.cyan}>{ex.mode}</Pill>
                      {ex.label&&<span style={{color:C.tx3,fontSize:11}}>{ex.label}</span>}
                    </div>
                  </div>
                  <button onClick={async()=>{if(!confirm('Disconnect?'))return;await api.disconnectEx(ex.id);const d=await api.exchanges();setExchanges(d.exchanges||[]);}}style={{padding:'6px 13px',borderRadius:8,border:'1px solid rgba(255,71,87,0.3)',background:'transparent',color:C.red,cursor:'pointer',fontSize:11,fontWeight:600}}>Remove</button>
                </div>
              ))}
            </div>}
          </div>
        )}

        {/* ━━━ ANALYTICS ━━━ */}
        {tab==='analytics'&&(
          <div style={{display:'flex',flexDirection:'column',gap:14}}>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))',gap:14}}>
              {bots.map(bot=>{
                const sells=(bot.trades||[]).filter(t=>t.type==='SELL');
                const wins=sells.filter(t=>t.pnl>0).length;
                const wr=sells.length?`${((wins/sells.length)*100).toFixed(0)}%`:'—';
                const tv=bot.totalValue||bot.balance||0;
                const pnl=tv-(bot.startingBalance||100);
                const avgWin=wins?sells.filter(t=>t.pnl>0).reduce((s,t)=>s+t.pnl,0)/wins:0;
                const avgLoss=sells.length-wins?Math.abs(sells.filter(t=>t.pnl<=0).reduce((s,t)=>s+t.pnl,0)/(sells.length-wins)):0;
                const sc=SC[bot.strategy]||SC.PRECISION;
                return(
                  <div key={bot.id}style={{background:C.card,border:`1.5px solid ${sc.c}20`,borderRadius:14,overflow:'hidden',boxShadow:`0 0 20px ${sc.c}08`}}>
                    <div style={{padding:'13px 14px',borderBottom:`1px solid ${C.b}`,display:'flex',justifyContent:'space-between',alignItems:'center',background:'rgba(0,0,0,0.2)'}}>
                      <span style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:14}}>{bot.name}</span>
                      <Pill c={sc.c}>{sc.icon} {bot.strategy.replace('_',' ')}</Pill>
                    </div>
                    <div style={{padding:'14px'}}>
                      <div style={{padding:'12px',background:'rgba(255,255,255,0.03)',borderRadius:10,marginBottom:12}}>
                        <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:22,color:pnl>=0?C.green:C.red,letterSpacing:'-0.02em'}}>{fu(tv)}</div>
                        <div style={{fontFamily:"'DM Mono',monospace",fontSize:11,color:pnl>=0?C.green:C.red}}>{pnl>=0?'+':''}{fu(pnl)} ({fp(((tv/(bot.startingBalance||100))-1)*100)})</div>
                      </div>
                      {[['Win Rate',wr,parseInt(wr)>=60?C.green:parseInt(wr)>=45?C.amber:C.red],['Total Sells',sells.length,''],['Avg Win',fu(avgWin),C.green],['Avg Loss',fu(-avgLoss),C.red],['Profit Factor',avgLoss>0?(avgWin/avgLoss).toFixed(2):'—',avgWin/avgLoss>=1.5?C.green:C.amber],['Fees Paid',fu(bot.totalFees||0),''],['Cycles',bot.cycleCount||0,''],['Leverage',bot.leverageEnabled?`⚡${bot.maxLeverage}x`:'Off','']].map(([k,v,c])=>(
                        <div key={k}style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:`1px solid ${C.b}`,fontSize:12}}>
                          <span style={{color:C.tx3}}>{k}</span>
                          <span style={{fontFamily:"'DM Mono',monospace",fontWeight:600,color:c||C.tx}}>{v}</span>
                        </div>
                      ))}
                    </div>
                    {sells.length>=2&&(()=>{
                      let v=bot.startingBalance||100;
                      const data=[{i:0,v}];
                      [...(bot.trades||[])].reverse().forEach((t,i)=>{if(t.type==='SELL'&&t.pnl!=null){v+=t.pnl;data.push({i:i+1,v:+v.toFixed(2)});}});
                      return<div style={{height:60,borderTop:`1px solid ${C.b}`}}>
                        <ResponsiveContainer width="100%"height="100%">
                          <AreaChart data={data}margin={{top:4,right:0,left:0,bottom:0}}>
                            <defs><linearGradient id={`an${bot.id.slice(0,4)}`}x1="0"y1="0"x2="0"y2="1"><stop offset="0%"stopColor={sc.c}stopOpacity={0.3}/><stop offset="100%"stopColor={sc.c}stopOpacity={0}/></linearGradient></defs>
                            <XAxis dataKey="i"hide/><YAxis domain={['auto','auto']}hide/>
                            <ReferenceLine y={bot.startingBalance||100}stroke={C.tx3}strokeDasharray="3 3"/>
                            <Area type="monotone"dataKey="v"stroke={sc.c}strokeWidth={1.5}fill={`url(#an${bot.id.slice(0,4)})`}dot={false}/>
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>;
                    })()}
                  </div>
                );
              })}
            </div>
            {!bots.length&&<div style={{textAlign:'center',padding:48,color:C.tx3}}><div style={{fontSize:32,marginBottom:8,opacity:0.25}}>📊</div>No bots to analyze yet.</div>}
          </div>
        )}
      </div>

      {/* ── BOTTOM NAV (mobile) ── */}
      <div style={{position:'fixed',bottom:0,left:0,right:0,background:'rgba(5,7,15,0.97)',backdropFilter:'blur(20px)',borderTop:`1px solid ${C.b}`,display:'flex',zIndex:90,padding:'6px 0 env(safe-area-inset-bottom,6px)'}}>
        {[['bots','🤖','Bots'],['log','📋','Log'],['market','📊','Market'],['news','📰','News'],['exchanges','🔗','Exch'],['analytics','📈','Stats']].map(([t,icon,label])=>(
          <button key={t}onClick={()=>setTab(t)}style={{flex:1,padding:'8px 4px 6px',background:'transparent',border:'none',cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',gap:3,transition:'all 0.15s'}}>
            <span style={{fontSize:18,lineHeight:1,filter:tab===t?`drop-shadow(0 0 6px ${C.amber})`:'none'}}>{icon}</span>
            <span style={{fontSize:9,fontWeight:700,color:tab===t?C.amber:C.tx3,letterSpacing:'0.04em'}}>{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
