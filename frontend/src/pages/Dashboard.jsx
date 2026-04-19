import{useState,useEffect,useRef,useCallback,memo,useMemo}from'react';
import{useNavigate}from'react-router-dom';
import{AreaChart,Area,XAxis,YAxis,Tooltip,ResponsiveContainer,LineChart,Line,BarChart,Bar,ReferenceLine}from'recharts';
import{useAuth,useBotSocket}from'../lib/auth.jsx';
import{api}from'../lib/api.js';

// ── Design tokens ──────────────────────────────────────────────────────────────
const C={
  ink:'#05070f',ink2:'#080b18',ink3:'#0c1024',ink4:'#101428',
  glass:'rgba(255,255,255,0.025)',glass2:'rgba(255,255,255,0.04)',glass3:'rgba(255,255,255,0.07)',
  b:'rgba(255,255,255,0.07)',b2:'rgba(255,255,255,0.11)',b3:'rgba(255,255,255,0.18)',
  amber:'#ffb800',amber2:'#ff8c00',
  phosphor:'#39ff14',cyan:'#00d2ff',violet:'#a855f7',coral:'#ff4757',ice:'#e0f2ff',
  profit:'#00e5a0',loss:'#ff4757',
  tx:'#e8edf5',tx2:'#8896b3',tx3:'#475569',
};
// Strategy colors & metadata
const SC={
  PRECISION:{c:'#00d2ff',tier:'basic',icon:'⊕',desc:'RSI+MACD+BB triple confirm. Highest win rate.'},
  DCA_PLUS: {c:'#22c55e',tier:'basic',icon:'◎',desc:'Blue-chip dip buying. Most consistent.'},
  MOMENTUM: {c:'#39ff14',tier:'premium',icon:'▲',desc:'EMA cascade trend following. Best in bull markets.'},
  SWING:    {c:'#00e5a0',tier:'premium',icon:'⌇',desc:'Multi-day pullback in uptrend. RSI 30–56 zone.'},
  REVERSAL: {c:'#a855f7',tier:'premium',icon:'↩',desc:'Extreme oversold bounce. RSI<35 + BB lower.'},
  BREAKOUT: {c:'#ffb800',tier:'premium',icon:'⊞',desc:'BB squeeze + volume explosion. Big moves.'},
  AGGRESSIVE:{c:'#ff4757',tier:'premium',icon:'⚡',desc:'Catalyst-driven. Volume spike >2.5x required.'},
};
const CC={BTC:'#f7931a',ETH:'#627eea',SOL:'#9945ff',XRP:'#00aae4',BNB:'#f0b90b',AVAX:'#e84142',DOT:'#e6007a',LINK:'#2a5ada',ADA:'#3cc8c8',DOGE:'#c2a633',NEAR:'#00c08b',ARB:'#12aaff',INJ:'#00b7e9',SUI:'#4da2ff',MATIC:'#8247e5'};

const fUSD=n=>{if(n==null||isNaN(n))return'$—';const a=Math.abs(n);if(a>=1e9)return`$${(n/1e9).toFixed(2)}B`;if(a>=1e6)return`$${(n/1e6).toFixed(2)}M`;if(a>=1000)return`$${n.toLocaleString('en-US',{maximumFractionDigits:2})}`;if(a>=1)return`$${n.toFixed(2)}`;return`$${n.toFixed(4)}`;};
const fPct=n=>n==null?'—':`${n>=0?'+':''}${n.toFixed(2)}%`;
const fNum=n=>n==null?'—':n.toLocaleString();
const fT=iso=>!iso?'—':new Date(iso).toLocaleTimeString('en-US',{hour12:false,hour:'2-digit',minute:'2-digit'});
const fAge=iso=>{if(!iso)return'—';const d=(Date.now()-new Date(iso))/1e3;if(d<60)return`${~~d}s`;if(d<3600)return`${~~(d/60)}m`;if(d<86400)return`${~~(d/3600)}h`;return`${~~(d/86400)}d`;};
const fFear=v=>{const n=+v;if(n<=25)return{label:'Extreme Fear',c:'#ff2020'};if(n<=45)return{label:'Fear',c:'#ff6b35'};if(n<=55)return{label:'Neutral',c:'#ffb800'};if(n<=75)return{label:'Greed',c:'#00d2ff'};return{label:'Extreme Greed',c:'#00e5a0'};};

function useMobile(){const[m,s]=useState(window.innerWidth<900);useEffect(()=>{const h=()=>s(window.innerWidth<900);window.addEventListener('resize',h);return()=>window.removeEventListener('resize',h);},[]);return m;}

// ── Shared UI atoms ────────────────────────────────────────────────────────────
const Btn=memo(({onClick,children,variant='ghost',color,size='md',disabled,full,active,style:sx})=>{
  const c=color||C.amber;
  const bg=variant==='solid'?`linear-gradient(135deg,${c},${c}cc)`:active?`${c}18`:'transparent';
  const fg=variant==='solid'?'#000':active?c:color||C.tx2;
  const bd=`1px solid ${active||variant==='outline'?c+'55':C.b}`;
  const pad=size==='xs'?'4px 10px':size==='sm'?'6px 14px':'9px 18px';
  const fs=size==='xs'?10:size==='sm'?12:13;
  return<button onClick={onClick}disabled={disabled}style={{background:bg,color:fg,border:bd,padding:pad,borderRadius:9,cursor:disabled?'not-allowed':'pointer',fontFamily:"'Space Grotesk',sans-serif",fontSize:fs,fontWeight:600,opacity:disabled?0.4:1,width:full?'100%':'auto',transition:'all 0.15s',whiteSpace:'nowrap',letterSpacing:'0.02em',...sx}}>{children}</button>;
});

const Badge=memo(({c,children,sm})=><span style={{background:c+'18',color:c,border:`1px solid ${c}30`,padding:sm?'2px 7px':'3px 10px',borderRadius:20,fontSize:sm?9:10,fontWeight:600,display:'inline-flex',alignItems:'center',gap:3,whiteSpace:'nowrap',fontFamily:"'DM Mono',monospace"}}>{children}</span>);

const Inp=memo(({label,value,onChange,type='text',min,max,step,placeholder,suffix,prefix,note,mono})=>(
  <div>
    {label&&<div style={{color:C.tx3,fontSize:9,fontWeight:600,letterSpacing:'0.12em',textTransform:'uppercase',marginBottom:5,fontFamily:"'DM Mono',monospace"}}>{label}</div>}
    <div style={{position:'relative',display:'flex',alignItems:'center'}}>
      {prefix&&<span style={{position:'absolute',left:10,color:C.tx3,fontSize:12,pointerEvents:'none',fontFamily:"'DM Mono',monospace"}}>{prefix}</span>}
      <input type={type}min={min}max={max}step={step||'any'}value={value}onChange={e=>onChange(e.target.value)}placeholder={placeholder||''}
        style={{background:'rgba(0,0,0,0.3)',border:`1px solid ${C.b2}`,borderRadius:8,padding:`9px ${suffix?'36px':'12px'} 9px ${prefix?'26px':'12px'}`,color:C.tx,fontFamily:mono?"'DM Mono',monospace":"'Space Grotesk',sans-serif",fontSize:12,width:'100%',outline:'none',boxSizing:'border-box',transition:'border-color 0.2s'}}
        onFocus={e=>e.target.style.borderColor=C.amber} onBlur={e=>e.target.style.borderColor=C.b2}/>
      {suffix&&<span style={{position:'absolute',right:10,color:C.tx3,fontSize:11,pointerEvents:'none',fontFamily:"'DM Mono',monospace"}}>{suffix}</span>}
    </div>
    {note&&<div style={{color:C.tx3,fontSize:9,marginTop:4,lineHeight:1.5}}>{note}</div>}
  </div>
));

const Toggle=memo(({label,checked,onChange,color=C.profit,desc})=>(
  <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:12,padding:'10px 0',borderBottom:`1px solid ${C.b}`}}>
    <div><div style={{color:C.tx,fontSize:12,fontWeight:500}}>{label}</div>{desc&&<div style={{color:C.tx3,fontSize:10,marginTop:2}}>{desc}</div>}</div>
    <div onClick={()=>onChange(!checked)}style={{width:40,height:22,borderRadius:11,background:checked?color:'#1e293b',border:`1px solid ${checked?color:'#334155'}`,position:'relative',cursor:'pointer',flexShrink:0,transition:'all 0.2s',marginTop:2}}>
      <div style={{width:16,height:16,borderRadius:'50%',background:'#fff',position:'absolute',top:2,left:checked?20:2,transition:'left 0.2s',boxShadow:'0 1px 4px #0006'}}/>
    </div>
  </div>
));

const Panel=memo(({title,right,children,noPad,accent,style:sx})=>(
  <div style={{background:C.glass2,border:`1px solid ${accent?accent+'28':C.b}`,borderRadius:14,overflow:'hidden',boxShadow:accent?`0 0 30px ${accent}08`:undefined,...sx}}>
    {title&&<div style={{padding:'10px 14px',borderBottom:`1px solid ${C.b}`,display:'flex',justifyContent:'space-between',alignItems:'center',background:'rgba(0,0,0,0.2)'}}>
      <span style={{color:C.tx3,fontSize:9,fontWeight:600,letterSpacing:'0.14em',textTransform:'uppercase',fontFamily:"'DM Mono',monospace",display:'flex',alignItems:'center',gap:6}}>
        <span style={{width:4,height:4,borderRadius:'50%',background:accent||C.amber,display:'inline-block'}}/>
        {title}
      </span>
      {right}
    </div>}
    {noPad?children:<div style={{padding:14}}>{children}</div>}
  </div>
));

// ── Bot Config Modal ───────────────────────────────────────────────────────────
const BotModal=memo(({bot,strategies,exchanges,onClose,onSave,isNew,userPlan})=>{
  const COLORS=['#00e5a0','#00d2ff','#ff4757','#ffb800','#a855f7','#39ff14','#ec4899','#f97316'];
  const isPremium=['premium','pro','trial'].includes(userPlan);
  const[f,setF]=useState(bot?{
    name:bot.name,strategy:bot.strategy,botMode:bot.botMode,color:bot.color||'#00e5a0',
    startingBalance:bot.startingBalance,maxTradeUSD:bot.maxTradeUSD,
    stopLossPct:+(bot.stopLossPct*100).toFixed(1),takeProfitPct:+(bot.takeProfitPct*100).toFixed(1),
    maxDrawdownPct:+(bot.maxDrawdownPct*100).toFixed(0),maxPositionPct:+(bot.maxPositionPct*100).toFixed(0),
    leverageEnabled:bot.leverageEnabled,maxLeverage:bot.maxLeverage,exchangeId:bot.exchangeId||'paper',
  }:{name:`Bot ${~~(Math.random()*900+100)}`,strategy:'PRECISION',botMode:'PAPER',color:'#00e5a0',
    startingBalance:10000,maxTradeUSD:500,stopLossPct:5,takeProfitPct:8,maxDrawdownPct:20,maxPositionPct:35,leverageEnabled:false,maxLeverage:3,exchangeId:'paper'});
  const[tab,setTab]=useState('general');
  const[saving,setSaving]=useState(false);
  const[err,setErr]=useState('');
  const set=(k,v)=>setF(p=>({...p,[k]:v}));
  const sc=SC[f.strategy]||SC.PRECISION;

  async function save(){
    setSaving(true);setErr('');
    try{await onSave({...f,stopLossPct:+f.stopLossPct/100,takeProfitPct:+f.takeProfitPct/100,maxDrawdownPct:+f.maxDrawdownPct/100,maxPositionPct:+f.maxPositionPct/100,startingBalance:+f.startingBalance,maxTradeUSD:+f.maxTradeUSD,maxLeverage:+f.maxLeverage});onClose();}
    catch(e){setErr(e.message);}
    setSaving(false);
  }

  const S={overlay:{position:'fixed',inset:0,background:'rgba(0,0,0,0.8)',zIndex:500,display:'flex',alignItems:'center',justifyContent:'center',padding:16,backdropFilter:'blur(8px)'},
    modal:{background:C.ink3,border:`1px solid ${C.b2}`,borderRadius:18,width:'100%',maxWidth:520,maxHeight:'90vh',overflowY:'auto',boxShadow:'0 40px 80px rgba(0,0,0,0.6)'}};

  return(
    <div style={S.overlay}onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={S.modal}>
        <div style={{padding:'20px 22px 0',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <div style={{width:12,height:12,borderRadius:'50%',background:f.color,boxShadow:`0 0 12px ${f.color}`}}/>
            <span style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:17,color:C.tx}}>{isNew?'New Bot':'Configure Bot'}</span>
          </div>
          <button onClick={onClose}style={{background:'none',border:'none',color:C.tx3,fontSize:20,cursor:'pointer',padding:4}}>×</button>
        </div>
        {err&&<div style={{margin:'12px 22px 0',padding:'9px 12px',background:'rgba(255,71,87,0.1)',border:'1px solid rgba(255,71,87,0.3)',borderRadius:8,color:C.coral,fontSize:11}}>{err}</div>}

        <div style={{display:'flex',gap:0,padding:'14px 22px 0',borderBottom:`1px solid ${C.b}`,marginTop:14}}>
          {['general','strategy','risk','perps'].map(t=>(
            <button key={t}onClick={()=>setTab(t)}style={{background:'transparent',border:'none',padding:'7px 14px',color:tab===t?C.amber:C.tx3,fontSize:10,fontWeight:700,cursor:'pointer',borderBottom:tab===t?`2px solid ${C.amber}`:'2px solid transparent',textTransform:'uppercase',letterSpacing:'0.08em',fontFamily:"'Space Grotesk',sans-serif",transition:'color 0.15s'}}>{t}</button>
          ))}
        </div>

        <div style={{padding:'18px 22px'}}>

          {tab==='general'&&<div style={{display:'flex',flexDirection:'column',gap:14}}>
            <div style={{display:'grid',gridTemplateColumns:'1fr auto',gap:10,alignItems:'end'}}>
              <Inp label="Bot Name" value={f.name} onChange={v=>set('name',v)} placeholder="My Bot"/>
              <div>
                <div style={{color:C.tx3,fontSize:9,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:6,fontFamily:"'DM Mono',monospace"}}>Color</div>
                <div style={{display:'flex',gap:5}}>{COLORS.map(c=><div key={c}onClick={()=>set('color',c)}style={{width:22,height:22,borderRadius:'50%',background:c,cursor:'pointer',border:f.color===c?'2px solid #fff':'2px solid transparent',transform:f.color===c?'scale(1.2)':'scale(1)',transition:'transform 0.15s'}}/>)}</div>
              </div>
            </div>
            <div>
              <div style={{color:C.tx3,fontSize:9,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:8,fontFamily:"'DM Mono',monospace"}}>Mode</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                {[['PAPER','📄 Paper (Safe)',C.cyan],['LIVE','🔴 Live (Real Money)',C.coral]].map(([m,label,c])=>(
                  <button key={m}onClick={()=>set('botMode',m)}style={{padding:10,borderRadius:9,border:`1.5px solid ${f.botMode===m?c+'66':C.b}`,background:f.botMode===m?c+'14':'transparent',color:f.botMode===m?c:C.tx3,fontWeight:600,fontSize:12,cursor:'pointer',fontFamily:"'Space Grotesk',sans-serif",transition:'all 0.15s'}}>{label}</button>
                ))}
              </div>
              {f.botMode==='LIVE'&&<div style={{marginTop:8,padding:'9px 12px',background:'rgba(255,71,87,0.08)',borderRadius:8,color:C.coral,fontSize:11,border:'1px solid rgba(255,71,87,0.2)'}}>⚠ Live mode executes real trades. Connect an exchange first.</div>}
            </div>
          </div>}

          {tab==='strategy'&&<div style={{display:'flex',flexDirection:'column',gap:8}}>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:7}}>
              {Object.entries(SC).map(([key,s])=>{
                const locked=s.tier==='premium'&&!isPremium;
                return(
                  <button key={key}onClick={()=>!locked&&set('strategy',key)}
                    style={{background:f.strategy===key?`${s.c}18`:'rgba(255,255,255,0.02)',border:`1.5px solid ${f.strategy===key?s.c:C.b}`,borderRadius:10,padding:'10px 12px',cursor:locked?'not-allowed':'pointer',textAlign:'left',opacity:locked?0.5:1,position:'relative',transition:'all 0.15s'}}>
                    <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:4}}>
                      <span style={{fontSize:14}}>{s.icon}</span>
                      <span style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:11,color:f.strategy===key?s.c:C.tx}}>{key.replace('_',' ')}</span>
                      {locked&&<span style={{marginLeft:'auto',fontSize:8,color:C.amber,background:'rgba(255,184,0,0.12)',padding:'1px 5px',borderRadius:4,border:'1px solid rgba(255,184,0,0.2)'}}>PRO</span>}
                      {s.tier==='basic'&&<span style={{marginLeft:'auto',fontSize:8,color:C.profit,background:'rgba(0,229,160,0.12)',padding:'1px 5px',borderRadius:4,border:'1px solid rgba(0,229,160,0.2)'}}>BASIC</span>}
                    </div>
                    <div style={{fontSize:9,color:C.tx3,lineHeight:1.4}}>{s.desc}</div>
                  </button>
                );
              })}
            </div>
            {!isPremium&&<div style={{padding:'10px 12px',background:'rgba(255,184,0,0.06)',border:'1px solid rgba(255,184,0,0.2)',borderRadius:9,fontSize:11,color:C.amber}}>
              🔒 Premium strategies (MOMENTUM, SWING, REVERSAL, BREAKOUT, AGGRESSIVE) require a Premium subscription. <span style={{textDecoration:'underline',cursor:'pointer'}}>Upgrade →</span>
            </div>}
          </div>}

          {tab==='risk'&&<div style={{display:'flex',flexDirection:'column',gap:12}}>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              <Inp label="Starting Balance" value={f.startingBalance} onChange={v=>set('startingBalance',v)} type="number" min={1} prefix="$" note="Initial capital for this bot"/>
              <Inp label="Max Trade Size" value={f.maxTradeUSD} onChange={v=>set('maxTradeUSD',v)} type="number" min={5} prefix="$" note="Max USD per entry"/>
              <Inp label="Stop Loss" value={f.stopLossPct} onChange={v=>set('stopLossPct',v)} type="number" min={0.1} max={50} step={0.1} suffix="%" note="Exit at this % loss"/>
              <Inp label="Take Profit" value={f.takeProfitPct} onChange={v=>set('takeProfitPct',v)} type="number" min={0.5} max={200} step={0.5} suffix="%" note="Target % gain"/>
              <Inp label="Max Drawdown" value={f.maxDrawdownPct} onChange={v=>set('maxDrawdownPct',v)} type="number" min={5} max={95} suffix="%" note="Emergency exit threshold"/>
              <Inp label="Max Position %" value={f.maxPositionPct} onChange={v=>set('maxPositionPct',v)} type="number" min={5} max={100} suffix="%" note="Max % of balance in one coin"/>
            </div>
          </div>}

          {tab==='perps'&&<div style={{display:'flex',flexDirection:'column',gap:4}}>
            <Toggle label="Enable Leverage / Perpetuals" checked={f.leverageEnabled} onChange={v=>set('leverageEnabled',v)} color={C.violet} desc="Trade perpetual futures with leverage on supported exchanges."/>
            {f.leverageEnabled?<>
              <div style={{marginTop:12}}>
                <div style={{color:C.tx3,fontSize:9,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:8,fontFamily:"'DM Mono',monospace"}}>Max Leverage</div>
                <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                  {[2,3,5,10,15,20].map(n=>(
                    <button key={n}onClick={()=>set('maxLeverage',n)}style={{padding:'7px 15px',borderRadius:8,border:`1.5px solid ${+f.maxLeverage===n?C.violet:C.b}`,background:+f.maxLeverage===n?C.violet+'14':'transparent',color:+f.maxLeverage===n?C.violet:C.tx3,fontWeight:700,fontSize:12,cursor:'pointer',fontFamily:"'DM Mono',monospace",transition:'all 0.15s'}}>{n}x</button>
                  ))}
                </div>
              </div>
              <div style={{marginTop:12,padding:'12px',background:`${C.violet}0a`,border:`1px solid ${C.violet}28`,borderRadius:9}}>
                <div style={{color:C.violet,fontSize:11,fontWeight:600,marginBottom:6}}>⚡ Leverage Rules</div>
                <div style={{color:C.tx3,fontSize:10,lineHeight:1.8}}>• Only on trades with confidence ≥ 8/10<br/>• Effective SL = {(+f.stopLossPct/+f.maxLeverage).toFixed(2)}% (SL ÷ leverage)<br/>• Max position size reduced {+f.maxLeverage}x<br/>• Supported: Binance Futures, Kraken Pro</div>
              </div>
            </>:<div style={{textAlign:'center',padding:'28px 0',color:C.tx3}}>
              <div style={{fontSize:28,marginBottom:8,opacity:0.3}}>⚡</div>
              <div style={{fontSize:12,fontWeight:600,color:C.tx2,marginBottom:4}}>Leverage Disabled</div>
              <div style={{fontSize:11,lineHeight:1.6}}>Enable perpetual futures with up to 20x leverage. High risk.</div>
            </div>}
          </div>}
        </div>

        <div style={{padding:'14px 22px',borderTop:`1px solid ${C.b}`,display:'flex',gap:10}}>
          <Btn onClick={save}disabled={saving}variant="solid"color={f.color}full size="sm">{saving?'Saving…':isNew?'Create Bot':'Save Changes'}</Btn>
          <Btn onClick={onClose}size="sm">Cancel</Btn>
        </div>
      </div>
    </div>
  );
});

// ── AI Chat Panel ──────────────────────────────────────────────────────────────
const AIChat=memo(({onClose,userPlan})=>{
  const[msgs,setMsgs]=useState([{role:'assistant',content:"Hi! I'm ARIA, your NEXUS trading assistant. Ask me anything about strategies, indicators, or how to set up your bots for optimal performance."}]);
  const[input,setInput]=useState('');
  const[loading,setLoading]=useState(false);
  const endRef=useRef(null);
  const isPremium=['premium','pro','trial'].includes(userPlan);

  useEffect(()=>endRef.current?.scrollIntoView({behavior:'smooth'}),[msgs]);

  async function send(){
    if(!input.trim()||loading)return;
    const msg=input.trim();setInput('');
    setMsgs(m=>[...m,{role:'user',content:msg}]);
    setLoading(true);
    try{const r=await api.aiChat(msg);setMsgs(m=>[...m,{role:'assistant',content:r.reply}]);}
    catch(e){setMsgs(m=>[...m,{role:'assistant',content:`Error: ${e.message}`}]);}
    setLoading(false);
  }

  const suggestions=['How does the PRECISION strategy work?','What is RSI and how should I set my stop loss?','Which strategy is best for a bear market?','Explain Bollinger Bands in simple terms'];

  return(
    <div style={{position:'fixed',bottom:20,right:20,width:380,height:520,background:C.ink3,border:`1px solid ${C.b2}`,borderRadius:16,display:'flex',flexDirection:'column',zIndex:300,boxShadow:'0 20px 60px rgba(0,0,0,0.6)'}}>
      <div style={{padding:'12px 16px',borderBottom:`1px solid ${C.b}`,display:'flex',alignItems:'center',justifyContent:'space-between',background:'rgba(255,184,0,0.05)'}}>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <div style={{width:28,height:28,borderRadius:8,background:`linear-gradient(135deg,${C.amber},${C.amber2})`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,fontWeight:800,color:'#000',fontFamily:"'Syne',sans-serif"}}>A</div>
          <div>
            <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:13,color:C.tx}}>ARIA</div>
            <div style={{fontSize:9,color:C.amber,fontFamily:"'DM Mono',monospace"}}>AI Trading Assistant</div>
          </div>
        </div>
        <button onClick={onClose}style={{background:'none',border:'none',color:C.tx3,fontSize:18,cursor:'pointer'}}>×</button>
      </div>

      <div style={{flex:1,overflowY:'auto',padding:'12px 14px',display:'flex',flexDirection:'column',gap:10}}>
        {msgs.map((m,i)=>(
          <div key={i}style={{display:'flex',justifyContent:m.role==='user'?'flex-end':'flex-start'}}>
            <div style={{maxWidth:'85%',padding:'9px 12px',borderRadius:m.role==='user'?'12px 12px 2px 12px':'12px 12px 12px 2px',background:m.role==='user'?`linear-gradient(135deg,${C.amber},${C.amber2})`:`rgba(255,255,255,0.06)`,color:m.role==='user'?'#000':C.tx,fontSize:12,lineHeight:1.6,fontFamily:"'Space Grotesk',sans-serif"}}>
              {m.content}
            </div>
          </div>
        ))}
        {loading&&<div style={{display:'flex',gap:4,padding:'9px 12px',background:'rgba(255,255,255,0.06)',borderRadius:'12px 12px 12px 2px',width:'fit-content'}}>
          {[0,1,2].map(i=><div key={i}style={{width:5,height:5,borderRadius:'50%',background:C.amber,animation:`breathe 1.2s ${i*0.2}s infinite`}}/>)}
        </div>}
        <div ref={endRef}/>
      </div>

      {msgs.length===1&&<div style={{padding:'0 14px 10px',display:'flex',flexDirection:'column',gap:5}}>
        {suggestions.map(s=><button key={s}onClick={()=>{setInput(s);}}style={{textAlign:'left',padding:'7px 10px',borderRadius:7,border:`1px solid ${C.b}`,background:C.glass,color:C.tx3,fontSize:10,cursor:'pointer',fontFamily:"'Space Grotesk',sans-serif",transition:'all 0.15s',lineHeight:1.4}}>{s}</button>)}
      </div>}

      <div style={{padding:'10px 14px',borderTop:`1px solid ${C.b}`,display:'flex',gap:8}}>
        <input value={input}onChange={e=>setInput(e.target.value)}onKeyDown={e=>e.key==='Enter'&&send()}placeholder="Ask ARIA anything…"
          style={{flex:1,background:'rgba(0,0,0,0.3)',border:`1px solid ${C.b2}`,borderRadius:8,padding:'8px 12px',color:C.tx,fontFamily:"'Space Grotesk',sans-serif",fontSize:12,outline:'none'}}/>
        <Btn onClick={send}disabled={loading||!input.trim()}variant="solid"color={C.amber}size="sm">Send</Btn>
      </div>
    </div>
  );
});

// ── News Feed Panel ────────────────────────────────────────────────────────────
const NewsFeed=memo(({news,fearGreed,globalMkt})=>{
  const fgInfo=fearGreed?.current?fFear(fearGreed.current.value):{label:'—',c:C.tx3};
  return(
    <div style={{display:'flex',flexDirection:'column',gap:12}}>
      {/* Market pulse */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
        <Panel title="Fear & Greed" accent={fgInfo.c}>
          <div style={{textAlign:'center',padding:'4px 0'}}>
            <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:36,color:fgInfo.c,lineHeight:1}}>{fearGreed?.current?.value||'—'}</div>
            <div style={{color:fgInfo.c,fontSize:11,marginTop:4,fontFamily:"'DM Mono',monospace"}}>{fgInfo.label}</div>
            <div style={{color:C.tx3,fontSize:9,marginTop:6}}>7-day trend</div>
            <div style={{display:'flex',gap:4,justifyContent:'center',marginTop:6,alignItems:'flex-end',height:30}}>
              {(fearGreed?.history||[]).map((d,i)=>{const fi=fFear(d.value);return<div key={i}style={{width:6,background:fi.c,borderRadius:2,height:`${+d.value/100*30}px`,opacity:i===0?1:0.5}}/>;})}
            </div>
          </div>
        </Panel>
        <Panel title="Market Overview">
          {[['Total MCap',fUSD(globalMkt?.totalMarketCap)],['24h Volume',fUSD(globalMkt?.totalVolume)],['BTC Dom.',`${globalMkt?.btcDominance?.toFixed(1)||'—'}%`],['MCap Chg.',fPct(globalMkt?.marketCapChange)]].map(([k,v])=>(
            <div key={k}style={{display:'flex',justifyContent:'space-between',padding:'5px 0',borderBottom:`1px solid ${C.b}`,fontFamily:"'DM Mono',monospace",fontSize:10}}>
              <span style={{color:C.tx3}}>{k}</span>
              <span style={{color:C.tx,fontWeight:500}}>{v}</span>
            </div>
          ))}
        </Panel>
      </div>

      {/* News */}
      <Panel title="Crypto News" right={<span style={{color:C.tx3,fontSize:9,fontFamily:"'DM Mono',monospace"}}>Live · CryptoPanic</span>} noPad>
        <div style={{maxHeight:380,overflowY:'auto'}}>
          {!news?.length&&<div style={{padding:24,color:C.tx3,textAlign:'center',fontSize:12}}>Loading news…</div>}
          {(news||[]).map((a,i)=>(
            <a key={a.id}href={a.url}target="_blank"rel="noreferrer"style={{display:'block',padding:'12px 14px',borderBottom:`1px solid ${C.b}`,textDecoration:'none',transition:'background 0.1s'}}
              onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.03)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
              <div style={{display:'flex',gap:8,alignItems:'flex-start',marginBottom:5}}>
                <div style={{flex:1,color:C.tx,fontSize:12,fontWeight:500,lineHeight:1.45,fontFamily:"'Space Grotesk',sans-serif"}}>{a.title}</div>
                {a.sentiment&&<span style={{fontSize:8,padding:'2px 6px',borderRadius:4,flexShrink:0,background:a.sentiment==='bullish'?'rgba(0,229,160,0.12)':a.sentiment==='bearish'?'rgba(255,71,87,0.12)':'rgba(255,184,0,0.12)',color:a.sentiment==='bullish'?C.profit:a.sentiment==='bearish'?C.coral:C.amber,border:`1px solid ${a.sentiment==='bullish'?C.profit+'40':a.sentiment==='bearish'?C.coral+'40':C.amber+'40'}`,fontFamily:"'DM Mono',monospace"}}>{a.sentiment}</span>}
              </div>
              <div style={{display:'flex',gap:8,alignItems:'center'}}>
                <span style={{color:C.tx3,fontSize:9,fontFamily:"'DM Mono',monospace"}}>{a.source}</span>
                <span style={{color:C.tx3,fontSize:9}}>·</span>
                <span style={{color:C.tx3,fontSize:9,fontFamily:"'DM Mono',monospace"}}>{fAge(a.published)}</span>
                {(a.coins||[]).map(c=><span key={c}style={{fontSize:8,padding:'1px 5px',borderRadius:3,background:'rgba(255,184,0,0.08)',color:C.amber,fontFamily:"'DM Mono',monospace"}}>{c}</span>)}
              </div>
            </a>
          ))}
        </div>
      </Panel>
    </div>
  );
});

// ── Settings Page ─────────────────────────────────────────────────────────────
const SettingsPage=memo(({user,plans,onClose})=>{
  const[tab,setTab]=useState('account');
  const[saving,setSaving]=useState(false);
  const[form,setForm]=useState({firstName:user?.firstName||'',lastName:user?.lastName||'',email:user?.email||''});
  const set=(k,v)=>setForm(p=>({...p,[k]:v}));
  const isPremium=['premium','pro'].includes(user?.plan);
  const planInfo=plans?.find(p=>p.id===user?.plan);

  async function savePlan(planId){
    setSaving(true);
    try{await api.billingCheckout(planId);window.location.href='/billing';}
    catch(e){alert(e.message);}
    setSaving(false);
  }

  const TABS=['account','subscription','privacy','preferences'];

  return(
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.85)',zIndex:400,display:'flex',alignItems:'center',justifyContent:'center',padding:20,backdropFilter:'blur(8px)'}}>
      <div style={{background:C.ink3,border:`1px solid ${C.b2}`,borderRadius:18,width:'100%',maxWidth:680,maxHeight:'90vh',overflow:'hidden',display:'flex',flexDirection:'column',boxShadow:'0 40px 80px rgba(0,0,0,0.7)'}}>
        <div style={{padding:'18px 22px',borderBottom:`1px solid ${C.b}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:17,color:C.tx}}>Settings</span>
          <button onClick={onClose}style={{background:'none',border:'none',color:C.tx3,fontSize:20,cursor:'pointer'}}>×</button>
        </div>

        <div style={{display:'flex',flex:1,overflow:'hidden'}}>
          {/* Sidebar */}
          <div style={{width:160,borderRight:`1px solid ${C.b}`,padding:'12px 8px',display:'flex',flexDirection:'column',gap:2,background:'rgba(0,0,0,0.2)'}}>
            {TABS.map(t=>(
              <button key={t}onClick={()=>setTab(t)}style={{textAlign:'left',padding:'9px 12px',borderRadius:8,border:'none',background:tab===t?`${C.amber}12`:'transparent',color:tab===t?C.amber:C.tx3,fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:"'Space Grotesk',sans-serif",textTransform:'capitalize',transition:'all 0.15s'}}>{t}</button>
            ))}
          </div>

          {/* Content */}
          <div style={{flex:1,overflowY:'auto',padding:'18px 22px'}}>

            {tab==='account'&&<div style={{display:'flex',flexDirection:'column',gap:16}}>
              <div>
                <div style={{color:C.amber,fontSize:10,fontWeight:700,letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:14,fontFamily:"'DM Mono',monospace"}}>Profile</div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                  <Inp label="First Name" value={form.firstName} onChange={v=>set('firstName',v)} placeholder="Ryan"/>
                  <Inp label="Last Name" value={form.lastName} onChange={v=>set('lastName',v)} placeholder="Guffey"/>
                </div>
                <div style={{marginTop:12}}>
                  <Inp label="Email" value={form.email} onChange={v=>set('email',v)} type="email" placeholder="you@example.com"/>
                </div>
                <div style={{marginTop:14}}><Btn variant="solid"color={C.amber}size="sm">Save Changes</Btn></div>
              </div>

              <div style={{padding:'14px',background:'rgba(255,255,255,0.03)',borderRadius:10,border:`1px solid ${C.b}`}}>
                <div style={{color:C.tx3,fontSize:9,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:10,fontFamily:"'DM Mono',monospace"}}>Account Status</div>
                {[['Plan',<Badge c={isPremium?C.amber:C.cyan}>{user?.plan?.toUpperCase()||'TRIAL'}</Badge>],['Status',<Badge c={C.profit}>{user?.subscriptionStatus?.toUpperCase()||'ACTIVE'}</Badge>],['Member Since',user?.createdAt?new Date(user.createdAt).toLocaleDateString():'—'],['Max Bots',isPremium?3:1]].map(([k,v])=>(
                  <div key={k}style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'7px 0',borderBottom:`1px solid ${C.b}`}}>
                    <span style={{color:C.tx3,fontSize:11,fontFamily:"'DM Mono',monospace"}}>{k}</span>
                    <span style={{color:C.tx,fontSize:11}}>{typeof v==='string'||typeof v==='number'?v:<>{v}</>}</span>
                  </div>
                ))}
              </div>
            </div>}

            {tab==='subscription'&&<div style={{display:'flex',flexDirection:'column',gap:14}}>
              <div style={{color:C.amber,fontSize:10,fontWeight:700,letterSpacing:'0.1em',textTransform:'uppercase',fontFamily:"'DM Mono',monospace"}}>Choose Your Plan</div>
              {(plans||[]).map(p=>(
                <div key={p.id}style={{border:`1.5px solid ${p.popular?C.amber+'44':C.b}`,borderRadius:12,padding:16,background:p.popular?'rgba(255,184,0,0.04)':C.glass,position:'relative'}}>
                  {p.popular&&<div style={{position:'absolute',top:-9,right:16,background:`linear-gradient(135deg,${C.amber},${C.amber2})`,color:'#000',fontSize:8,fontWeight:800,padding:'2px 10px',borderRadius:20,fontFamily:"'Syne',sans-serif",letterSpacing:'0.05em'}}>MOST POPULAR</div>}
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:12}}>
                    <div>
                      <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:16,color:C.tx,marginBottom:4}}>{p.name}</div>
                      <div style={{fontFamily:"'DM Mono',monospace",fontSize:11,color:C.tx3}}>{p.bots} bot{p.bots!==1?'s':''} · {p.bots===1?'Basic strategies':'All 7 strategies'}</div>
                    </div>
                    <div style={{textAlign:'right'}}>
                      <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:22,color:p.popular?C.amber:C.tx}}>${p.price}<span style={{fontSize:11,fontWeight:400,color:C.tx3}}>/mo</span></div>
                      {p.id==='premium'&&<div style={{fontSize:9,color:C.tx3}}>${(p.price/p.bots).toFixed(2)}/bot</div>}
                    </div>
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:4,marginBottom:12}}>
                    {(p.features||[]).map(f=><div key={f}style={{display:'flex',alignItems:'center',gap:5,fontSize:10,color:C.tx2,fontFamily:"'Space Grotesk',sans-serif"}}><span style={{color:C.profit,fontSize:11}}>✓</span>{f}</div>)}
                  </div>
                  <Btn onClick={()=>savePlan(p.id)} variant={user?.plan===p.id?'outline':'solid'} color={p.popular?C.amber:C.cyan} full size="sm" disabled={user?.plan===p.id}>
                    {user?.plan===p.id?'Current Plan':`Upgrade to ${p.name}`}
                  </Btn>
                </div>
              ))}
              {(user?.plan==='premium'||user?.plan==='basic')&&<Btn size="sm"color={C.coral}style={{alignSelf:'flex-start'}}>Cancel Subscription</Btn>}
            </div>}

            {tab==='privacy'&&<div style={{color:C.tx2,fontSize:12,lineHeight:1.9,fontFamily:"'Space Grotesk',sans-serif"}}>
              <div style={{color:C.amber,fontSize:10,fontWeight:700,letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:14,fontFamily:"'DM Mono',monospace"}}>Privacy Policy</div>
              {[['Data Collection','NEXUS collects your email address, trading activity, and bot configuration data to provide the service. We do not sell your personal information to third parties.'],['API Keys','Exchange API keys are encrypted using AES-256-CBC encryption and stored securely. Keys are never transmitted off our servers and are only used to execute trades on your behalf.'],['Trading Data','Your trading history, bot performance, and portfolio data are stored securely and used to provide analytics and improve the AI assistant. This data is never shared with third parties.'],['Cookies','We use session cookies for authentication only. No advertising cookies or third-party trackers are used.'],['Your Rights','You may request deletion of your account and all associated data at any time by contacting support@nexustrader.io. Data deletion is processed within 30 days.'],['Contact','For privacy inquiries: privacy@nexustrader.io']].map(([title,text])=>(
                <div key={title}style={{marginBottom:16}}>
                  <div style={{color:C.tx,fontWeight:600,marginBottom:4}}>{title}</div>
                  <div style={{color:C.tx3,lineHeight:1.7}}>{text}</div>
                </div>
              ))}
            </div>}

            {tab==='preferences'&&<div style={{display:'flex',flexDirection:'column',gap:4}}>
              <div style={{color:C.amber,fontSize:10,fontWeight:700,letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:14,fontFamily:"'DM Mono',monospace"}}>Preferences</div>
              <Toggle label="Push Notifications" checked={true} onChange={()=>{}} desc="Get notified when bots trade or hit stop-loss"/>
              <Toggle label="Email Reports" checked={false} onChange={()=>{}} desc="Weekly performance summary via email"/>
              <Toggle label="AI Confirmations" checked={true} onChange={()=>{}} desc="Use Gemini AI to confirm high-confidence trades"/>
              <Toggle label="Sound Alerts" checked={false} onChange={()=>{}} desc="Play sound when trades execute"/>
              <div style={{marginTop:16}}>
                <div style={{color:C.tx3,fontSize:9,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:8,fontFamily:"'DM Mono',monospace"}}>Default Cycle Interval</div>
                <div style={{display:'flex',gap:6}}>
                  {['30s','60s','2m','5m'].map(v=><Btn key={v}active={v==='60s'}color={C.amber}size="xs">{v}</Btn>)}
                </div>
              </div>
            </div>}
          </div>
        </div>
      </div>
    </div>
  );
});

// ── Manual Trade Modal ────────────────────────────────────────────────────────
const ManualTradeModal=memo(({bot,prices,onClose,onTrade})=>{
  const[sym,setSym]=useState('BTC');
  const[type,setType]=useState('BUY');
  const[amount,setAmount]=useState('100');
  const[notes,setNotes]=useState('');
  const[saving,setSaving]=useState(false);
  const[err,setErr]=useState('');
  const px=prices[sym]?.price;

  async function place(){
    setSaving(true);setErr('');
    try{await onTrade({botId:bot.id,type,symbol:sym,amountUSD:+amount,notes});onClose();}
    catch(e){setErr(e.message);}
    setSaving(false);
  }

  return(
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.8)',zIndex:500,display:'flex',alignItems:'center',justifyContent:'center',padding:16,backdropFilter:'blur(8px)'}}>
      <div style={{background:C.ink3,border:`1px solid ${C.b2}`,borderRadius:16,width:'100%',maxWidth:400,padding:22,boxShadow:'0 40px 80px rgba(0,0,0,0.6)'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:18}}>
          <span style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:16,color:C.tx}}>Manual Trade · {bot?.name}</span>
          <button onClick={onClose}style={{background:'none',border:'none',color:C.tx3,fontSize:18,cursor:'pointer'}}>×</button>
        </div>
        {err&&<div style={{marginBottom:12,padding:'9px',background:'rgba(255,71,87,0.1)',borderRadius:8,color:C.coral,fontSize:11}}>{err}</div>}

        <div style={{display:'flex',gap:8,marginBottom:14}}>
          {['BUY','SELL'].map(t=><button key={t}onClick={()=>setType(t)}style={{flex:1,padding:10,borderRadius:8,border:`1.5px solid ${type===t?(t==='BUY'?C.profit:C.coral)+'66':C.b}`,background:type===t?(t==='BUY'?C.profit:C.coral)+'14':'transparent',color:type===t?(t==='BUY'?C.profit:C.coral):C.tx3,fontWeight:700,fontSize:13,cursor:'pointer',fontFamily:"'Space Grotesk',sans-serif",transition:'all 0.15s'}}>{t}</button>)}
        </div>

        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          <div>
            <div style={{color:C.tx3,fontSize:9,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:6,fontFamily:"'DM Mono',monospace"}}>Symbol</div>
            <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
              {['BTC','ETH','SOL','BNB','AVAX','LINK','DOGE','ARB'].map(s=><button key={s}onClick={()=>setSym(s)}style={{padding:'5px 10px',borderRadius:6,border:`1px solid ${sym===s?CC[s]||C.amber:C.b}`,background:sym===s?`${CC[s]||C.amber}14`:'transparent',color:sym===s?CC[s]||C.amber:C.tx3,fontSize:10,cursor:'pointer',fontFamily:"'DM Mono',monospace",fontWeight:600}}>{s}</button>)}
            </div>
            {px&&<div style={{marginTop:6,fontSize:10,color:C.tx3,fontFamily:"'DM Mono',monospace"}}>Current price: <span style={{color:C.tx}}>{fUSD(px)}</span></div>}
          </div>
          <Inp label="Amount (USD)" value={amount} onChange={setAmount} type="number" min={1} prefix="$" note={px?`≈ ${(+amount/px).toFixed(5)} ${sym}`:undefined}/>
          <Inp label="Notes (optional)" value={notes} onChange={setNotes} placeholder="My reason for this trade…"/>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'1fr auto',gap:10,marginTop:16}}>
          <Btn onClick={place}disabled={saving||!sym||!amount}variant="solid"color={type==='BUY'?C.profit:C.coral}full size="sm">{saving?'Placing…':`Place ${type} Order`}</Btn>
          <Btn onClick={onClose}size="sm">Cancel</Btn>
        </div>
      </div>
    </div>
  );
});

// ── Main Dashboard ─────────────────────────────────────────────────────────────
export default function Dashboard(){
  const{user,logout,setUser,loading:authLoading}=useAuth();
  const{bots,prices,strategies,connected}=useBotSocket();
  const nav=useNavigate();
  const isMobile=useMobile();
  const[tab,setTab]=useState('bots');
  const[showNewBot,setShowNewBot]=useState(false);
  const[editBot,setEditBot]=useState(null);
  const[selectedBotId,setSelectedBotId]=useState(null);
  const[exchanges,setExchanges]=useState([]);
  const[busy,setBusy]=useState({});
  const[showAI,setShowAI]=useState(false);
  const[showSettings,setShowSettings]=useState(false);
  const[plans,setPlans]=useState([]);
  const[news,setNews]=useState([]);
  const[fearGreed,setFearGreed]=useState(null);
  const[globalMkt,setGlobalMkt]=useState(null);
  const[manualTradeBot,setManualTradeBot]=useState(null);
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

  useEffect(()=>{if(!selectedBotId&&bots.length>0)setSelectedBotId(bots[0].id);},[bots,selectedBotId]);
  const selBot=useMemo(()=>bots.find(b=>b.id===selectedBotId)||bots[0]||null,[bots,selectedBotId]);
  const logLen=selBot?.logs?.length||0;
  useEffect(()=>{const el=logRef.current;if(el)el.scrollTop=el.scrollHeight;},[logLen]);

  const totalValue=useMemo(()=>bots.reduce((s,b)=>s+(b.totalValue||b.balance||0),0),[bots]);
  const totalPnl=useMemo(()=>bots.reduce((s,b)=>s+(b.pnl||0),0),[bots]);
  const totalTrades=useMemo(()=>bots.reduce((s,b)=>s+(b.trades?.length||0),0),[bots]);
  const running=useMemo(()=>bots.filter(b=>['running','cycling'].includes(b.status)).length,[bots]);
  const overallWR=useMemo(()=>{const s=bots.flatMap(b=>b.trades?.filter(t=>t.type==='SELL')||[]);const w=s.filter(t=>t.pnl>0).length;return s.length?`${((w/s.length)*100).toFixed(0)}%`:'—';},[bots]);

  const setBusy2=(id,v)=>setBusy(p=>({...p,[id]:v}));
  const ctrl=async(action,id)=>{
    setBusy2(id,true);
    try{
      if(action==='start')await api.startBot(id);
      else if(action==='stop')await api.stopBot(id);
      else if(action==='reset'){if(!confirm('Reset? All trades cleared.'))return;await api.resetBot(id);}
      else if(action==='delete'){if(!confirm('Delete permanently?'))return;await api.deleteBot(id);if(selectedBotId===id)setSelectedBotId(null);}
    }catch(e){alert(e.message);}
    setBusy2(id,false);
  };

  const createBot=async d=>{await api.createBot(d);};
  const saveBot=async d=>{if(!editBot)return;await api.updateBot(editBot.id,d);setEditBot(null);};
  const saveDefaults=async d=>{const r=await api.botSettings(d);if(r.user&&setUser)setUser(r.user);};
  const connectEx=async()=>{
    setExErr('');setExLoading(true);
    try{await api.connectEx(exForm);const d=await api.exchanges();setExchanges(d.exchanges||[]);setExForm({exchange:'coinbase',apiKey:'',apiSecret:'',apiPassphrase:'',label:'',mode:'PAPER'});}
    catch(e){setExErr(e.message);}
    setExLoading(false);
  };
  const manualTrade=async d=>{await api.manualTrade(d);};

  const isPremium=['premium','pro','trial'].includes(user?.plan);
  const maxBots=isPremium?3:1;
  const canAddBot=bots.length<maxBots;

  if(authLoading||!user)return(
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:C.ink,flexDirection:'column',gap:16}}>
      <div style={{fontFamily:"'Syne',sans-serif",color:C.amber,fontSize:20,fontWeight:800}}>NEXUS</div>
      <div style={{color:C.tx3,fontSize:12}}>Loading…</div>
      <style>{`@keyframes breathe{0%,100%{opacity:0.3}50%{opacity:1}}`}</style>
    </div>
  );

  const TABS=['Bots','Live Log','Market','Exchanges','Analytics'];
  if(isPremium)TABS.splice(2,0,'Positions','News');

  const S={
    header:{position:'sticky',top:0,zIndex:100,background:'rgba(5,7,15,0.9)',backdropFilter:'blur(24px)',borderBottom:`1px solid ${C.b}`,padding:isMobile?'0 14px':'0 24px',height:60,display:'flex',alignItems:'center',justifyContent:'space-between',gap:16},
    statsRibbon:{display:'grid',gridTemplateColumns:`repeat(${isMobile?3:6},1fr)`,gap:1,background:C.b,borderBottom:`1px solid ${C.b}`},
    statCell:{background:C.ink2,padding:'11px 14px'},
    content:{padding:isMobile?'12px 14px':'18px 24px',minHeight:'calc(100vh - 280px)'},
  };

  return(
    <div style={{minHeight:'100vh',background:C.ink,color:C.tx,fontFamily:"'Space Grotesk',sans-serif"}}>
      <style>{`
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:3px;height:3px}::-webkit-scrollbar-thumb{background:#1e293b;border-radius:2px}
        @keyframes breathe{0%,100%{opacity:1}50%{opacity:0.4}}
        @keyframes shimmer{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}
        @keyframes ticker-scroll{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
        button,input,select{font-family:inherit}
        .hover-row:hover{background:rgba(255,255,255,0.03)!important}
        a:hover{opacity:0.85}
      `}</style>

      {showNewBot&&<BotModal isNew strategies={strategies} exchanges={exchanges} onClose={()=>setShowNewBot(false)} onSave={createBot} userPlan={user?.plan}/>}
      {editBot&&<BotModal bot={editBot} strategies={strategies} exchanges={exchanges} onClose={()=>setEditBot(null)} onSave={saveBot} userPlan={user?.plan}/>}
      {showSettings&&<SettingsPage user={user} plans={plans} onClose={()=>setShowSettings(false)}/>}
      {manualTradeBot&&<ManualTradeModal bot={manualTradeBot} prices={prices} onClose={()=>setManualTradeBot(null)} onTrade={manualTrade}/>}
      {showAI&&<AIChat onClose={()=>setShowAI(false)} userPlan={user?.plan}/>}

      {/* Risk warning */}
      <div style={{background:'rgba(255,71,87,0.05)',borderBottom:'1px solid rgba(255,71,87,0.1)',padding:'4px 24px',textAlign:'center',fontFamily:"'DM Mono',monospace",fontSize:9,color:'rgba(255,71,87,0.45)',letterSpacing:'0.06em'}}>
        ⚠ CRYPTO TRADING INVOLVES SUBSTANTIAL RISK OF LOSS · NEXUS IS NOT A FINANCIAL ADVISER · PAPER MODE ACTIVE
      </div>

      {/* Header */}
      <header style={S.header}>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <div style={{width:34,height:34,background:`linear-gradient(135deg,${C.amber},${C.amber2})`,borderRadius:9,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:13,color:'#000',boxShadow:`0 0 16px ${C.amber}30`}}>NX</div>
          <div>
            <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:16,color:C.ice,letterSpacing:'0.02em'}}>NEX<span style={{color:C.amber}}>US</span></div>
            <div style={{display:'flex',alignItems:'center',gap:5,fontFamily:"'DM Mono',monospace",fontSize:9,color:C.tx3}}>
              <div style={{width:5,height:5,borderRadius:'50%',background:running>0?C.profit:C.tx3,boxShadow:running>0?`0 0 6px ${C.profit}`:undefined,animation:running>0?'breathe 2s infinite':undefined}}/>
              {running}/{bots.length} active · {connected?'Connected':'Reconnecting…'}
            </div>
          </div>
          {!isMobile&&<div style={{display:'flex',alignItems:'center',gap:14,marginLeft:16,fontFamily:"'DM Mono',monospace",fontSize:10}}>
            {['BTC','ETH','SOL'].map(s=>{const p=prices[s];return p?<span key={s}><span style={{color:C.amber}}>{s}</span> <span style={{color:p.change24h>=0?C.profit:C.coral}}>{fUSD(p.price)}</span> <span style={{fontSize:9,color:p.change24h>=0?C.profit:C.coral}}>{fPct(p.change24h)}</span></span>:null;})}
          </div>}
        </div>

        <div style={{display:'flex',alignItems:'center',gap:10}}>
          {!isMobile&&<div style={{textAlign:'right'}}>
            <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:18,color:totalPnl>=0?C.profit:C.coral,letterSpacing:'-0.02em'}}>{fUSD(totalValue)}</div>
            <div style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:totalPnl>=0?C.profit:C.coral}}>{totalPnl>=0?'+':''}{fUSD(totalPnl)} · {overallWR} WR</div>
          </div>}
          <button onClick={()=>setShowAI(v=>!v)}style={{background:showAI?`${C.amber}18`:'rgba(255,255,255,0.04)',border:`1px solid ${showAI?C.amber+'44':C.b}`,borderRadius:9,padding:'7px 12px',color:showAI?C.amber:C.tx3,cursor:'pointer',fontSize:11,fontWeight:600,display:'flex',alignItems:'center',gap:6,transition:'all 0.15s'}}>
            <span style={{fontSize:14}}>✦</span> ARIA
          </button>
          {canAddBot&&<button onClick={()=>setShowNewBot(true)}style={{background:`linear-gradient(135deg,${C.amber},${C.amber2})`,border:'none',borderRadius:9,padding:'7px 14px',color:'#000',cursor:'pointer',fontSize:11,fontWeight:700,fontFamily:"'Space Grotesk',sans-serif"}}>+ Bot</button>}
          <button onClick={()=>setShowSettings(true)}style={{background:'rgba(255,255,255,0.04)',border:`1px solid ${C.b}`,borderRadius:9,padding:'7px 12px',color:C.tx3,cursor:'pointer',fontSize:11}}>⚙</button>
          <button onClick={()=>{logout();nav('/');}}style={{background:'none',border:'none',color:C.tx3,fontSize:11,cursor:'pointer',padding:'4px 8px'}}>Sign Out</button>
        </div>
      </header>

      {/* Ticker */}
      <div style={{background:'rgba(255,184,0,0.03)',borderBottom:'1px solid rgba(255,184,0,0.08)',overflow:'hidden',height:28,display:'flex',alignItems:'center',position:'relative'}}>
        <div style={{position:'absolute',left:0,top:0,bottom:0,background:C.amber,padding:'0 12px',display:'flex',alignItems:'center',fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:9,letterSpacing:'0.1em',color:'#000',zIndex:2}}>LIVE</div>
        <div style={{display:'flex',gap:40,paddingLeft:72,animation:'ticker-scroll 32s linear infinite',whiteSpace:'nowrap'}}>
          {[...Object.entries(prices),...Object.entries(prices)].slice(0,40).map(([s,d],i)=>(
            <span key={i}style={{display:'inline-flex',gap:6,alignItems:'center',fontFamily:"'DM Mono',monospace",fontSize:9}}>
              <span style={{color:C.amber,fontWeight:500}}>{s}</span>
              <span style={{color:C.tx}}>{fUSD(d.price)}</span>
              <span style={{color:d.change24h>=0?C.profit:C.coral}}>{d.change24h>=0?'▲':'▼'}{Math.abs(d.change24h).toFixed(2)}%</span>
            </span>
          ))}
        </div>
      </div>

      {/* Stats ribbon */}
      <div style={S.statsRibbon}>
        {[
          {l:'PORTFOLIO',v:fUSD(totalValue),s:`${bots.length} bot${bots.length!==1?'s':''}`,c:totalPnl>=0?C.profit:C.coral},
          {l:'P&L',v:`${totalPnl>=0?'+':''}${fUSD(totalPnl)}`,s:fPct(bots.reduce((s,b)=>s+(b.pnlPct||0),0)/Math.max(bots.length,1)),c:totalPnl>=0?C.profit:C.coral},
          {l:'WIN RATE',v:overallWR,s:`${totalTrades} trades`,c:parseInt(overallWR)>=60?C.profit:parseInt(overallWR)>=45?C.amber:C.coral},
          {l:'RUNNING',v:`${running}/${bots.length}`,s:running>0?'strategies active':'all stopped',c:running>0?C.profit:C.tx3},
          {l:'EXCHANGES',v:exchanges.length||'None',s:`${exchanges.filter(e=>e.mode==='LIVE').length} live`,c:exchanges.length>0?C.profit:C.tx3},
          {l:'FEES PAID',v:fUSD(bots.reduce((s,b)=>s+(b.totalFees||0),0)),s:'all bots',c:C.tx3},
        ].filter((_,i)=>!isMobile||i<3).map((s,i)=>(
          <div key={i}style={S.statCell}>
            <div style={{fontFamily:"'DM Mono',monospace",fontSize:8,letterSpacing:'0.12em',textTransform:'uppercase',color:C.tx3,marginBottom:3}}>{s.l}</div>
            <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:17,letterSpacing:'-0.02em',color:s.c||C.tx,lineHeight:1}}>{s.v}</div>
            <div style={{fontSize:9,color:C.tx3,fontFamily:"'DM Mono',monospace",marginTop:2}}>{s.s}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{background:C.ink2,borderBottom:`1px solid ${C.b}`,padding:`0 ${isMobile?'12px':'24px'}`,display:'flex',overflowX:'auto',gap:0}}>
        {TABS.map(t=><button key={t}onClick={()=>setTab(t)}style={{background:'transparent',border:'none',padding:isMobile?'9px 11px':'10px 16px',color:tab===t?C.amber:C.tx3,fontSize:10,fontWeight:700,cursor:'pointer',borderBottom:tab===t?`2px solid ${C.amber}`:'2px solid transparent',whiteSpace:'nowrap',textTransform:'uppercase',letterSpacing:'0.07em',fontFamily:"'Space Grotesk',sans-serif",transition:'color 0.15s'}}>{t}</button>)}
      </div>

      {/* Content */}
      <div style={S.content}>

        {/* BOTS */}
        {tab==='Bots'&&(
          <div style={{display:'flex',flexDirection:'column',gap:16}}>
            <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':`repeat(${Math.min(bots.length+1,4)},1fr)`,gap:12,alignItems:'start'}}>
              {bots.map(bot=>{
                const isRunning=['running','cycling'].includes(bot.status);
                const tv=bot.totalValue||bot.balance||0;
                const pnl=tv-(bot.startingBalance||100);
                const sc=SC[bot.strategy]||SC.PRECISION;
                const sells=(bot.trades||[]).filter(t=>t.type==='SELL');
                const wr=sells.length?`${((sells.filter(t=>t.pnl>0).length/sells.length)*100).toFixed(0)}%`:'—';
                const isSelected=selectedBotId===bot.id;

                return(
                  <div key={bot.id}onClick={()=>setSelectedBotId(bot.id)}
                    style={{background:C.glass2,border:`2px solid ${isSelected?sc.c+'55':isRunning?sc.c+'22':C.b}`,borderRadius:14,overflow:'hidden',cursor:'pointer',transition:'all 0.2s',position:'relative',boxShadow:isRunning?`0 0 30px ${sc.c}08`:undefined}}>
                    {isRunning&&<div style={{position:'absolute',top:0,left:0,right:0,height:2,background:`linear-gradient(90deg,transparent,${sc.c},transparent)`,animation:'shimmer 2.5s ease-in-out infinite'}}/>}
                    <div style={{position:'absolute',left:0,top:0,bottom:0,width:3,background:sc.c,borderRadius:'3px 0 0 3px'}}/>

                    <div style={{padding:'13px 14px 10px',paddingLeft:14}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
                        <div>
                          <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:14,color:C.tx,marginBottom:5}}>{bot.name}</div>
                          <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                            <Badge c={sc.c} sm>{sc.icon} {bot.strategy}</Badge>
                            {bot.leverageEnabled&&<Badge c={C.violet} sm>⚡{bot.maxLeverage}x</Badge>}
                            <Badge c={bot.botMode==='LIVE'?C.coral:C.tx3} sm>{bot.botMode}</Badge>
                            {isRunning&&<Badge c={C.profit} sm>● LIVE</Badge>}
                          </div>
                        </div>
                        <div style={{textAlign:'right'}}>
                          <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:17,color:pnl>=0?C.profit:C.coral}}>{fUSD(tv)}</div>
                          <div style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:pnl>=0?C.profit:C.coral}}>{pnl>=0?'+':''}{fUSD(pnl)} ({fPct(((tv/(bot.startingBalance||100))-1)*100)})</div>
                        </div>
                      </div>

                      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:4,marginBottom:8}}>
                        {[['Cash',fUSD(bot.balance),''],['Win',wr,parseInt(wr)>=50?C.profit:parseInt(wr)>0?C.amber:C.tx3],['Trades',bot.trades?.length||0,''],['Cycles',fNum(bot.cycleCount),'']].map(([l,v,c])=>(
                          <div key={l}style={{background:'rgba(255,255,255,0.03)',padding:'5px 6px',borderRadius:6,textAlign:'center'}}>
                            <div style={{fontFamily:"'DM Mono',monospace",fontSize:7,color:C.tx3,textTransform:'uppercase',marginBottom:2}}>{l}</div>
                            <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:11,color:c||C.tx}}>{v}</div>
                          </div>
                        ))}
                      </div>

                      {/* Mini sparkline */}
                      {(bot.trades||[]).filter(t=>t.type==='SELL'&&t.pnl!=null).length>=2&&(()=>{
                        let v=bot.startingBalance||100;
                        const pts=[{i:0,v}];
                        [...(bot.trades||[])].reverse().forEach((t,i)=>{if(t.type==='SELL'&&t.pnl!=null){v+=t.pnl;pts.push({i:i+1,v:+v.toFixed(2)});}});
                        return<div style={{height:32,marginBottom:6}}>
                          <ResponsiveContainer width="100%"height="100%">
                            <AreaChart data={pts}>
                              <defs><linearGradient id={`g${bot.id.slice(0,4)}`}x1="0"y1="0"x2="0"y2="1"><stop offset="0%"stopColor={sc.c}stopOpacity={0.3}/><stop offset="100%"stopColor={sc.c}stopOpacity={0}/></linearGradient></defs>
                              <XAxis dataKey="i"hide/><YAxis domain={['auto','auto']}hide/>
                              <Area type="monotone"dataKey="v"stroke={sc.c}strokeWidth={1.5}fill={`url(#g${bot.id.slice(0,4)})`}dot={false}/>
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>;
                      })()}
                    </div>

                    <div style={{display:'flex',gap:5,padding:'0 10px 10px',borderTop:`1px solid ${C.b}`,paddingTop:8}}>
                      {isRunning
                        ?<button onClick={e=>{e.stopPropagation();ctrl('stop',bot.id);}}disabled={!!busy[bot.id]}style={{flex:1,padding:'6px',borderRadius:7,border:`1px solid ${C.coral}44`,background:'rgba(255,71,87,0.1)',color:C.coral,cursor:'pointer',fontSize:10,fontWeight:700,fontFamily:"'Space Grotesk',sans-serif"}}>◼ Stop</button>
                        :<button onClick={e=>{e.stopPropagation();ctrl('start',bot.id);}}disabled={!!busy[bot.id]}style={{flex:1,padding:'6px',borderRadius:7,border:`1px solid ${sc.c}44`,background:`${sc.c}18`,color:sc.c,cursor:'pointer',fontSize:10,fontWeight:700,fontFamily:"'Space Grotesk',sans-serif"}}>▶ Start</button>
                      }
                      {isPremium&&<button onClick={e=>{e.stopPropagation();setManualTradeBot(bot);}}style={{padding:'6px 8px',borderRadius:7,border:`1px solid ${C.b}`,background:'transparent',color:C.tx3,cursor:'pointer',fontSize:10,title:'Manual trade'}}>⇄</button>}
                      <button onClick={e=>{e.stopPropagation();ctrl('reset',bot.id);}}disabled={!!busy[bot.id]}style={{padding:'6px 8px',borderRadius:7,border:`1px solid ${C.b}`,background:'transparent',color:C.tx3,cursor:'pointer',fontSize:10}}>↺</button>
                      <button onClick={e=>{e.stopPropagation();setEditBot(bot);}}style={{padding:'6px 8px',borderRadius:7,border:`1px solid ${C.b}`,background:'transparent',color:C.tx3,cursor:'pointer',fontSize:10}}>⚙</button>
                      <button onClick={e=>{e.stopPropagation();ctrl('delete',bot.id);}}style={{padding:'6px 8px',borderRadius:7,border:'1px solid rgba(255,71,87,0.2)',background:'transparent',color:C.coral,cursor:'pointer',fontSize:10}}>✕</button>
                    </div>
                  </div>
                );
              })}

              {/* Add bot slot */}
              {canAddBot&&(
                <button onClick={()=>setShowNewBot(true)}style={{background:'transparent',border:`2px dashed ${C.b2}`,borderRadius:14,padding:24,cursor:'pointer',color:C.tx3,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:10,minHeight:200,transition:'all 0.2s'}}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor=`${C.amber}44`;e.currentTarget.style.color=C.tx2;}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor=C.b2;e.currentTarget.style.color=C.tx3;}}>
                  <div style={{width:40,height:40,borderRadius:10,background:'rgba(255,184,0,0.08)',border:'1px solid rgba(255,184,0,0.15)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,color:C.amber}}>+</div>
                  <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:13}}>Add Bot</div>
                  <div style={{fontSize:10,lineHeight:1.5,textAlign:'center',maxWidth:140}}>Split test strategies simultaneously. {maxBots-bots.length} slot{maxBots-bots.length!==1?'s':''} remaining.</div>
                </button>
              )}
              {!canAddBot&&!isMobile&&(
                <div style={{background:'rgba(255,184,0,0.04)',border:'1px dashed rgba(255,184,0,0.2)',borderRadius:14,padding:20,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:8,minHeight:160,textAlign:'center'}}>
                  <div style={{fontSize:9,color:C.amber,fontFamily:"'DM Mono',monospace",letterSpacing:'0.1em'}}>MAX BOTS REACHED</div>
                  <div style={{fontSize:11,color:C.tx3,lineHeight:1.5}}>Upgrade to Premium for up to 3 simultaneous bots</div>
                  <button onClick={()=>setShowSettings(true)}style={{marginTop:4,padding:'6px 14px',borderRadius:8,border:`1px solid ${C.amber}44`,background:'rgba(255,184,0,0.08)',color:C.amber,cursor:'pointer',fontSize:10,fontWeight:600}}>Upgrade →</button>
                </div>
              )}
            </div>

            {/* Selected bot detail */}
            {selBot&&(
              <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'2fr 1fr',gap:14}}>
                <Panel title={`${selBot.name} — Trade History`}right={<span style={{color:C.tx3,fontSize:9,fontFamily:"'DM Mono',monospace"}}>{selBot.trades?.length||0} trades</span>}noPad>
                  {!(selBot.trades?.length)
                    ?<div style={{padding:'28px',textAlign:'center',color:C.tx3}}>
                        <div style={{fontSize:28,marginBottom:8,opacity:0.3}}>🤖</div>
                        <div style={{fontWeight:600,marginBottom:4,color:C.tx2}}>No trades yet</div>
                        <div style={{fontSize:11,lineHeight:1.5}}>Start the bot to begin trading with the {selBot.strategy} strategy. History pre-seeded from Binance — should trade within the first cycle.</div>
                      </div>
                    :<div style={{maxHeight:260,overflowY:'auto'}}>
                      {(selBot.trades||[]).slice(0,80).map((t,i)=>{
                        const ac=t.type==='BUY'?C.profit:t.type==='SELL'?(t.pnl>=0?C.cyan:C.coral):C.tx3;
                        return<div key={i}className="hover-row"style={{padding:'7px 14px',borderBottom:`1px solid ${C.b}`,display:'flex',alignItems:'center',gap:8,transition:'background 0.1s'}}>
                          <span style={{background:`${ac}15`,color:ac,border:`1px solid ${ac}30`,padding:'2px 8px',borderRadius:20,fontSize:8,fontWeight:600,fontFamily:"'DM Mono',monospace",flexShrink:0}}>{t.type}</span>
                          <span style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:11,color:CC[t.coin]||C.tx,minWidth:30}}>{t.coin}</span>
                          {t.leverage>1&&<span style={{fontSize:8,color:C.violet,fontFamily:"'DM Mono',monospace"}}>{t.leverage}x</span>}
                          {!isMobile&&<span style={{color:C.tx3,fontSize:9,fontFamily:"'DM Mono',monospace",overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1}}>{t.reasoning?.slice(0,60)}</span>}
                          {t.pnl!=null&&<span style={{color:t.pnl>=0?C.profit:C.coral,fontSize:10,fontWeight:600,fontFamily:"'DM Mono',monospace",flexShrink:0}}>{t.pnl>=0?'+':''}{fUSD(t.pnl)}</span>}
                          <span style={{color:C.tx3,fontSize:9,fontFamily:"'DM Mono',monospace",flexShrink:0}}>{fT(t.ts)}</span>
                        </div>;
                      })}
                    </div>
                  }
                </Panel>

                <div style={{display:'flex',flexDirection:'column',gap:12}}>
                  <Panel title="Configuration">
                    {[['Strategy',<Badge c={SC[selBot.strategy]?.c||C.cyan}sm>{selBot.strategy}</Badge>],['Mode',<Badge c={selBot.botMode==='LIVE'?C.coral:C.cyan}sm>{selBot.botMode}</Badge>],['Balance',fUSD(selBot.balance)],['SL / TP',`${fPct(-selBot.stopLossPct*100)} / ${fPct(selBot.takeProfitPct*100)}`],['Max Trade',fUSD(selBot.maxTradeUSD)],['Leverage',selBot.leverageEnabled?`⚡${selBot.maxLeverage}x`:'Off'],['Cycles',fNum(selBot.cycleCount)],['Fees',fUSD(selBot.totalFees)]].map(([k,v])=>(
                      <div key={k}style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 0',borderBottom:`1px solid ${C.b}`}}>
                        <span style={{color:C.tx3,fontSize:10,fontFamily:"'DM Mono',monospace"}}>{k}</span>
                        <span style={{fontSize:10,fontFamily:"'DM Mono',monospace",fontWeight:500,color:C.tx}}>{typeof v==='string'||typeof v==='number'?v:<>{v}</>}</span>
                      </div>
                    ))}
                    <div style={{marginTop:10,display:'flex',gap:6}}>
                      <Btn onClick={()=>setEditBot(selBot)}full size="xs">⚙ Configure</Btn>
                      {isPremium&&<Btn onClick={()=>setManualTradeBot(selBot)}size="xs"color={C.cyan}>⇄ Trade</Btn>}
                    </div>
                  </Panel>

                  <Panel title="Positions"right={<span style={{color:C.tx3,fontSize:9,fontFamily:"'DM Mono',monospace"}}>{Object.keys(selBot.portfolio||{}).length} open</span>}>
                    {!Object.keys(selBot.portfolio||{}).length
                      ?<div style={{color:C.tx3,fontSize:11,textAlign:'center',padding:'8px 0'}}>No open positions</div>
                      :Object.entries(selBot.portfolio||{}).map(([sym,pos])=>{
                          const px=prices[sym]?.price,pv=px?pos.qty*px:0,pp=px?(px-pos.avgCost)*pos.qty:0;
                          return<div key={sym}style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:`1px solid ${C.b}`}}>
                            <div><div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:12,color:CC[sym]||C.tx}}>{sym}{pos.leverage>1&&<span style={{fontSize:9,color:C.violet}}> ⚡{pos.leverage}x</span>}</div><div style={{color:C.tx3,fontSize:9,fontFamily:"'DM Mono',monospace"}}>{pos.qty.toFixed(4)} @ {fUSD(pos.avgCost)}</div></div>
                            <div style={{textAlign:'right'}}><div style={{fontFamily:"'DM Mono',monospace",fontSize:11,color:C.tx}}>{fUSD(pv)}</div><div style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:pp>=0?C.profit:C.coral}}>{pp>=0?'+':''}{fUSD(pp)}</div></div>
                          </div>;
                        })
                    }
                  </Panel>
                </div>
              </div>
            )}

            {!bots.length&&(
              <div style={{textAlign:'center',padding:'60px 24px'}}>
                <div style={{fontSize:42,marginBottom:16,opacity:0.3}}>🤖</div>
                <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:20,marginBottom:8}}>No Bots Yet</div>
                <div style={{color:C.tx3,fontSize:13,lineHeight:1.7,maxWidth:400,margin:'0 auto 24px'}}>Create your first bot, choose a strategy, and let NEXUS trade autonomously 24/7.</div>
                <button onClick={()=>setShowNewBot(true)}style={{background:`linear-gradient(135deg,${C.amber},${C.amber2})`,border:'none',borderRadius:10,padding:'10px 24px',color:'#000',cursor:'pointer',fontSize:13,fontWeight:700,fontFamily:"'Space Grotesk',sans-serif"}}>+ Create First Bot</button>
              </div>
            )}
          </div>
        )}

        {/* LIVE LOG */}
        {tab==='Live Log'&&(
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {bots.length>1&&<div style={{display:'flex',gap:6,flexWrap:'wrap'}}>{bots.map(b=><Btn key={b.id}onClick={()=>setSelectedBotId(b.id)}active={selectedBotId===b.id}color={b.color||SC[b.strategy]?.c||C.amber}size="sm">{b.name}</Btn>)}</div>}
            <Panel title={`${selBot?.name||'Bot'} · AI Reasoning Log`}right={<span style={{color:C.tx3,fontSize:9,fontFamily:"'DM Mono',monospace"}}>{selBot?.logs?.length||0} entries</span>}noPad>
              <div ref={logRef}style={{height:'calc(100vh - 320px)',overflowY:'auto',background:'rgba(0,0,0,0.2)',fontFamily:"'DM Mono',monospace",fontSize:10,lineHeight:1.8}}>
                {!selBot?.logs?.length&&<div style={{padding:24,color:C.tx3,textAlign:'center'}}>
                  <div style={{fontSize:24,marginBottom:8,opacity:0.3}}>📋</div>Log appears when bot starts.
                </div>}
                {(selBot?.logs||[]).map((e,i)=>{
                  const lc={CYCLE:'#2d4460',AI:C.violet,SIGNAL:C.profit,TRADE:C.profit,PROFIT:C.profit,LOSS:C.coral,HOLD:C.tx3,WARN:C.amber,ERROR:C.coral,SYSTEM:C.cyan,INFO:C.tx3}[e.level]||C.tx3;
                  const big=['TRADE','PROFIT','LOSS','CYCLE','SIGNAL'].includes(e.level);
                  return<div key={i}style={{padding:big?'5px 14px':'2px 14px',borderBottom:big?`1px solid ${C.b}`:'none',background:big?'rgba(255,255,255,0.015)':'transparent',display:'flex',gap:10,alignItems:'flex-start'}}>
                    <span style={{color:'#2d3748',fontSize:9,flexShrink:0,paddingTop:1}}>{fT(e.ts)}</span>
                    <span style={{color:lc,fontSize:9,fontWeight:600,minWidth:52,flexShrink:0}}>[{e.level}]</span>
                    <span style={{color:big?C.tx:C.tx3,fontSize:big?10:9,lineHeight:1.6}}>{e.msg}</span>
                  </div>;
                })}
              </div>
            </Panel>
          </div>
        )}

        {/* POSITIONS (Premium) */}
        {tab==='Positions'&&(
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            {bots.map(bot=>{
              const port=bot.portfolio||{};
              if(!Object.keys(port).length)return null;
              return<Panel key={bot.id}title={`${bot.name} — Open Positions`}right={<Badge c={SC[bot.strategy]?.c||C.cyan}sm>{bot.strategy}</Badge>}noPad>
                {Object.entries(port).map(([sym,pos])=>{
                  const px=prices[sym]?.price,pv=px?pos.qty*px:0,pp=px?(px-pos.avgCost)*pos.qty:0,ppp=pos.avgCost>0?((px||0)-pos.avgCost)/pos.avgCost*100:0;
                  return<div key={sym}style={{padding:'13px 16px',borderBottom:`1px solid ${C.b}`,display:'grid',gridTemplateColumns:'auto 1fr repeat(4,1fr)',gap:12,alignItems:'center'}}>
                    <div style={{width:36,height:36,borderRadius:8,background:`${CC[sym]||C.tx}15`,display:'flex',alignItems:'center',justifyContent:'center',color:CC[sym]||C.tx,fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:9}}>{sym.slice(0,3)}</div>
                    <div><div style={{color:CC[sym]||C.tx,fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:14}}>{sym}</div><div style={{color:C.tx3,fontSize:9,fontFamily:"'DM Mono',monospace"}}>{fAge(pos.entryTime)}</div></div>
                    {[['Qty',pos.qty.toFixed(4),''],['Avg',fUSD(pos.avgCost),''],['Current',fUSD(px),''],['P&L',`${pp>=0?'+':''}${fUSD(pp)} (${fPct(ppp)})`,pp>=0?C.profit:C.coral]].map(([l,v,c])=>(
                      <div key={l}><div style={{color:C.tx3,fontSize:8,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:2,fontFamily:"'DM Mono',monospace"}}>{l}</div><div style={{fontFamily:"'DM Mono',monospace",fontSize:11,fontWeight:600,color:c||C.tx}}>{v}</div></div>
                    ))}
                  </div>;
                })}
              </Panel>;
            })}
            {!bots.some(b=>Object.keys(b.portfolio||{}).length)&&<div style={{textAlign:'center',padding:48,color:C.tx3}}><div style={{fontSize:28,marginBottom:8,opacity:0.3}}>📊</div>No open positions.</div>}
          </div>
        )}

        {/* MARKET */}
        {tab==='Market'&&(
          <div style={{display:'grid',gridTemplateColumns:`repeat(${isMobile?2:4},1fr)`,gap:10}}>
            {Object.entries(prices).sort((a,b)=>Math.abs(b[1]?.change24h||0)-Math.abs(a[1]?.change24h||0)).map(([sym,d])=>{
              if(!d)return null;
              const held=bots.some(b=>b.portfolio?.[sym]);
              const chg=d.change24h||0;
              const cc=CC[sym]||C.tx;
              return<div key={sym}style={{background:C.glass2,border:`1px solid ${held?cc+'30':C.b}`,borderRadius:11,padding:isMobile?'11px':'13px',transition:'transform 0.2s',cursor:'pointer'}}
                onMouseEnter={e=>e.currentTarget.style.transform='translateY(-2px)'} onMouseLeave={e=>e.currentTarget.style.transform=''}>
                {held&&<div style={{marginBottom:4}}><Badge c={cc}sm>HELD</Badge></div>}
                <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:13,color:cc,marginBottom:2}}>{sym}</div>
                <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:isMobile?14:17,letterSpacing:'-0.02em',marginBottom:4}}>{fUSD(d.price)}</div>
                <div style={{display:'inline-flex',alignItems:'center',gap:3,background:chg>=0?'rgba(0,229,160,0.1)':'rgba(255,71,87,0.1)',padding:'2px 8px',borderRadius:20,marginBottom:isMobile?0:8}}>
                  <span style={{color:chg>=0?C.profit:C.coral,fontSize:10,fontFamily:"'DM Mono',monospace"}}>{chg>=0?'▲':'▼'} {Math.abs(chg).toFixed(2)}%</span>
                </div>
                {!isMobile&&<div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:4,marginTop:8}}>
                  {[['H',fUSD(d.high24h)],['L',fUSD(d.low24h)],['Vol',fUSD(d.volume24h)],['Open',fUSD(d.openPrice)]].map(([l,v])=>(
                    <div key={l}style={{background:'rgba(255,255,255,0.03)',padding:'4px 6px',borderRadius:5}}>
                      <div style={{color:C.tx3,fontSize:7,letterSpacing:'0.1em',fontFamily:"'DM Mono',monospace",marginBottom:1}}>{l}</div>
                      <div style={{color:C.tx3,fontSize:9,fontFamily:"'DM Mono',monospace"}}>{v}</div>
                    </div>
                  ))}
                </div>}
              </div>;
            })}
          </div>
        )}

        {/* NEWS */}
        {tab==='News'&&<NewsFeed news={news} fearGreed={fearGreed} globalMkt={globalMkt}/>}

        {/* EXCHANGES */}
        {tab==='Exchanges'&&(
          <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 1fr',gap:16}}>
            <Panel title="Connect Exchange">
              {exErr&&<div style={{color:C.coral,fontSize:11,marginBottom:12,padding:'9px',background:'rgba(255,71,87,0.08)',borderRadius:8}}>{exErr}</div>}
              <div style={{display:'flex',flexDirection:'column',gap:12}}>
                <div>
                  <div style={{color:C.tx3,fontSize:9,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:8,fontFamily:"'DM Mono',monospace"}}>Exchange</div>
                  <div style={{display:'flex',gap:6}}>
                    {[['coinbase','Coinbase','#0052ff'],['binance','Binance','#f0b90b'],['kraken','Kraken','#5741d9']].map(([id,name,color])=>(
                      <button key={id}onClick={()=>setExForm(f=>({...f,exchange:id}))}style={{flex:1,background:exForm.exchange===id?`${color}18`:'transparent',border:`1px solid ${exForm.exchange===id?color:C.b}`,borderRadius:8,padding:'8px 4px',cursor:'pointer',color:exForm.exchange===id?color:C.tx3,fontSize:11,fontWeight:600,fontFamily:"'Space Grotesk',sans-serif",transition:'all 0.15s'}}>{name}</button>
                    ))}
                  </div>
                </div>
                <Inp label="API Key" value={exForm.apiKey} onChange={v=>setExForm(f=>({...f,apiKey:v}))} placeholder="Your API key" mono/>
                <Inp label="API Secret" value={exForm.apiSecret} onChange={v=>setExForm(f=>({...f,apiSecret:v}))} type="password" placeholder="Your API secret" mono/>
                {exForm.exchange==='coinbase'&&<Inp label="Passphrase" value={exForm.apiPassphrase} onChange={v=>setExForm(f=>({...f,apiPassphrase:v}))} type="password" placeholder="API passphrase" mono/>}
                <Inp label="Label" value={exForm.label} onChange={v=>setExForm(f=>({...f,label:v}))} placeholder="My main account"/>
                <div style={{display:'flex',gap:6}}>
                  {[['PAPER','📄 Paper',C.cyan],['LIVE','🔴 Live',C.coral]].map(([m,label,c])=>(
                    <button key={m}onClick={()=>setExForm(f=>({...f,mode:m}))}style={{flex:1,padding:8,borderRadius:8,border:`1px solid ${exForm.mode===m?c+'44':C.b}`,background:exForm.mode===m?`${c}10`:'transparent',color:exForm.mode===m?c:C.tx3,fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:"'Space Grotesk',sans-serif",transition:'all 0.15s'}}>{label}</button>
                  ))}
                </div>
                <div style={{padding:'9px 12px',background:'rgba(255,184,0,0.06)',border:'1px solid rgba(255,184,0,0.15)',borderRadius:8,color:'#c98a00',fontSize:10,lineHeight:1.6}}>⚠ Only grant <strong>Trade + Read</strong> permissions. Never grant withdrawal access. Keys are AES-256 encrypted.</div>
                <Btn onClick={connectEx}disabled={exLoading}variant="solid"color={C.profit}full>{exLoading?'Connecting…':'Connect Exchange'}</Btn>
              </div>
            </Panel>

            <div style={{display:'flex',flexDirection:'column',gap:12}}>
              <Panel title={`Connected (${exchanges.length})`}>
                {!exchanges.length&&<div style={{textAlign:'center',padding:'20px 0',color:C.tx3}}>
                  <div style={{fontSize:24,marginBottom:8,opacity:0.3}}>🔗</div>
                  <div style={{fontWeight:600,color:C.tx2,marginBottom:4}}>No exchanges connected</div>
                  <div style={{fontSize:11}}>Connect an exchange for live trading.</div>
                </div>}
                {exchanges.map(ex=>(
                  <div key={ex.id}style={{background:'rgba(255,255,255,0.03)',borderRadius:9,padding:'12px',marginBottom:8,border:`1px solid ${C.b}`}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
                      <div><div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:13,color:C.tx}}>{ex.exchange}</div><div style={{color:C.tx3,fontSize:10,fontFamily:"'DM Mono',monospace"}}>{ex.label||''}{ex.apiKeyMask?` · ${ex.apiKeyMask}`:''}</div></div>
                      <Badge c={ex.mode==='LIVE'?C.coral:C.cyan}sm>{ex.mode}</Badge>
                    </div>
                    <div style={{display:'flex',alignItems:'center',gap:6}}>
                      <Badge c={ex.isActive?C.profit:C.tx3}sm>● {ex.isActive?'Active':'Inactive'}</Badge>
                      <span style={{color:C.tx3,fontSize:9,fontFamily:"'DM Mono',monospace",marginLeft:'auto'}}>{fAge(ex.connectedAt)}</span>
                      <button onClick={async()=>{if(!confirm('Remove?'))return;await api.disconnectEx(ex.id);const d=await api.exchanges();setExchanges(d.exchanges||[]);}}style={{color:C.coral,background:'transparent',border:`1px solid ${C.coral}30`,borderRadius:6,padding:'3px 10px',cursor:'pointer',fontSize:9,fontFamily:"'DM Mono',monospace"}}>Remove</button>
                    </div>
                  </div>
                ))}
              </Panel>
            </div>
          </div>
        )}

        {/* ANALYTICS */}
        {tab==='Analytics'&&(
          <div style={{display:'flex',flexDirection:'column',gap:14}}>
            <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'repeat(3,1fr)',gap:14}}>
              {bots.map(bot=>{
                const sells=(bot.trades||[]).filter(t=>t.type==='SELL');
                const wins=sells.filter(t=>t.pnl>0).length;
                const wr=sells.length?`${((wins/sells.length)*100).toFixed(0)}%`:'—';
                const tv=bot.totalValue||bot.balance||0;
                const pnl=tv-(bot.startingBalance||100);
                const avgWin=wins?sells.filter(t=>t.pnl>0).reduce((s,t)=>s+t.pnl,0)/wins:0;
                const avgLoss=sells.length-wins?Math.abs(sells.filter(t=>t.pnl<=0).reduce((s,t)=>s+t.pnl,0)/(sells.length-wins)):0;
                const pf=avgLoss>0?(avgWin/avgLoss).toFixed(2):'—';
                const sc=SC[bot.strategy]||SC.PRECISION;
                return(
                  <Panel key={bot.id}title={bot.name}right={<Badge c={sc.c}sm>{sc.icon} {bot.strategy}</Badge>}accent={sc.c}>
                    <div style={{marginBottom:12,padding:'12px',background:'rgba(255,255,255,0.03)',borderRadius:9}}>
                      <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:22,color:pnl>=0?C.profit:C.coral,letterSpacing:'-0.02em'}}>{fUSD(tv)}</div>
                      <div style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:pnl>=0?C.profit:C.coral}}>{pnl>=0?'+':''}{fUSD(pnl)} ({fPct(((tv/(bot.startingBalance||100))-1)*100)})</div>
                    </div>
                    {[['Win Rate',wr,parseInt(wr)>=60?C.profit:parseInt(wr)>=45?C.amber:C.coral],['Trades',sells.length,''],['Avg Win',fUSD(avgWin),C.profit],['Avg Loss',fUSD(-avgLoss),C.coral],['Profit Factor',pf,+pf>=1.5?C.profit:C.amber],['Max Drawdown',fPct(-(((bot.peakValue||tv)-tv)/Math.max(bot.peakValue||tv,1))*100),C.coral],['Cycles',fNum(bot.cycleCount),''],['Total Fees',fUSD(bot.totalFees||0),''],['Leverage',bot.leverageEnabled?`⚡${bot.maxLeverage}x`:'Off','']].map(([k,v,c])=>(
                      <div key={k}style={{display:'flex',justifyContent:'space-between',padding:'5px 0',borderBottom:`1px solid ${C.b}`,fontFamily:"'DM Mono',monospace",fontSize:10}}>
                        <span style={{color:C.tx3}}>{k}</span><span style={{fontWeight:600,color:c||C.tx}}>{v}</span>
                      </div>
                    ))}
                  </Panel>
                );
              })}
            </div>

            {bots.some(b=>(b.trades||[]).filter(t=>t.type==='SELL').length>=2)&&(
              <Panel title="Combined Equity Curves"right={<span style={{color:C.tx3,fontSize:9,fontFamily:"'DM Mono',monospace"}}>all bots</span>}>
                <div style={{height:180}}>
                  <ResponsiveContainer width="100%"height="100%">
                    <LineChart>
                      <XAxis hide/><YAxis domain={['auto','auto']}hide/>
                      <Tooltip contentStyle={{background:C.ink3,border:`1px solid ${C.b2}`,borderRadius:8,fontSize:10,fontFamily:"'DM Mono',monospace"}}formatter={(v,n)=>[fUSD(v),n]}/>
                      <ReferenceLine y={bots[0]?.startingBalance||100}stroke={C.tx3}strokeDasharray="4 4"/>
                      {bots.map(bot=>{
                        let v=bot.startingBalance||100;
                        const data=[{i:0,v}];
                        [...(bot.trades||[])].reverse().forEach((t,i)=>{if(t.type==='SELL'&&t.pnl!=null){v+=t.pnl;data.push({i:i+1,v:+v.toFixed(4)});}});
                        if(data.length<2)return null;
                        const sc=SC[bot.strategy]||SC.PRECISION;
                        return<Line key={bot.id}data={data}type="monotone"dataKey="v"stroke={bot.color||sc.c}strokeWidth={2}dot={false}name={bot.name}/>;
                      })}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Panel>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <footer style={{padding:'8px 24px',borderTop:`1px solid ${C.b}`,display:'flex',justifyContent:'space-between',alignItems:'center',fontFamily:"'DM Mono',monospace",fontSize:9,color:C.tx3,background:'rgba(0,0,0,0.2)'}}>
        <span>NEXUS v6.0 · {running} bot{running!==1?'s':''} running</span>
        <span>Not a financial adviser · Paper mode active · Crypto trading involves substantial risk</span>
      </footer>
    </div>
  );
}
