import{useState,useEffect,useRef,useCallback,memo,useMemo}from'react';
import{useNavigate}from'react-router-dom';
import{AreaChart,Area,XAxis,YAxis,Tooltip,ResponsiveContainer,ReferenceLine,BarChart,Bar,LineChart,Line}from'recharts';
import{useAuth,useBotSocket}from'../lib/auth.jsx';
import{api}from'../lib/api.js';

// ── Design system ─────────────────────────────────────────────────────────────
const T={bg:'#010204',surface:'#06080f',card:'#08090e',card2:'#0c0e16',
  b:'#ffffff08',b2:'#ffffff12',b3:'#ffffff1e',
  g:'#00e5a0',gd:'#00e5a018',r:'#f5365c',rd:'#f5365c18',
  a:'#fb923c',bl:'#3b82f6',pu:'#8b5cf6',cy:'#22d3ee',yw:'#eab308',
  tx:'#e2e8f0',mu:'#64748b',dim:'#334155',su:'#1e293b'};

const SC={PRECISION:T.bl,MOMENTUM:T.cy,REVERSAL:T.pu,BREAKOUT:T.a,SWING:T.g,AGGRESSIVE:T.r,DCA_PLUS:'#22c55e'};
const SD={
  PRECISION:'Triple-confirm RSI+MACD+BB. Highest win rate, patient entries.',
  MOMENTUM:'EMA cascade + volume surge. Best in strong trends.',
  REVERSAL:'Deep oversold bounce. RSI<25+StochRSI<15. High R:R.',
  BREAKOUT:'BB squeeze + volume explosion. Captures big moves.',
  SWING:'Multi-day positions. Pullback entries in uptrends.',
  AGGRESSIVE:'High risk/reward, wider stops, bigger targets.',
  DCA_PLUS:'Systematic dip buying with tech confirmation. Most consistent.',
};
const CC={BTC:'#f7931a',ETH:'#627eea',SOL:'#9945ff',XRP:'#00aae4',BNB:'#f0b90b',AVAX:'#e84142',DOT:'#e6007a',LINK:'#2a5ada',ADA:'#3cc8c8',DOGE:'#c2a633',NEAR:'#00c08b',APT:'#22c55e',ARB:'#12aaff',OP:'#ff0420',INJ:'#00b7e9',SUI:'#4da2ff',SEI:'#cc2936',TIA:'#7c3aed',FET:'#a3e635',RENDER:'#ff5c00'};
const EXC={coinbase:'#0052ff',binance:'#f0b90b',kraken:'#5741d9',paper:'#64748b'};
const EXN={coinbase:'Coinbase Advanced',binance:'Binance',kraken:'Kraken',paper:'Paper Trading'};

const fUSD=n=>{if(n==null||isNaN(n))return'$—';const a=Math.abs(n);if(a>=1e6)return`$${(n/1e6).toFixed(2)}M`;if(a>=1000)return`$${n.toLocaleString('en-US',{maximumFractionDigits:2})}`;if(a>=1)return`$${n.toFixed(2)}`;return`$${n.toFixed(4)}`;};
const fPct=n=>n==null?'—':`${n>=0?'+':''}${n.toFixed(2)}%`;
const fNum=n=>n==null?'—':n.toLocaleString();
const fT=iso=>!iso?'—':new Date(iso).toLocaleTimeString('en-US',{hour12:false,hour:'2-digit',minute:'2-digit'});
const fAge=iso=>{if(!iso)return'—';const d=(Date.now()-new Date(iso))/1000;if(d<60)return`${~~d}s ago`;if(d<3600)return`${~~(d/60)}m ago`;if(d<86400)return`${~~(d/3600)}h ago`;return`${~~(d/86400)}d ago`;};

function useMobile(){const[m,s]=useState(window.innerWidth<768);useEffect(()=>{const h=()=>s(window.innerWidth<768);window.addEventListener('resize',h);return()=>window.removeEventListener('resize',h);},[]);return m;}

// ── Atoms ─────────────────────────────────────────────────────────────────────
const Chip=memo(({c,children,sm,pulse})=><span style={{background:c+'1a',color:c,border:`1px solid ${c}28`,padding:sm?'2px 8px':'4px 12px',borderRadius:20,fontSize:sm?9:11,fontWeight:700,display:'inline-block',whiteSpace:'nowrap',animation:pulse?'pulse 2s infinite':'none'}}>{children}</span>);

const Btn=memo(({onClick,children,variant='ghost',color,size='md',disabled,full,active,danger})=>{
  const c=danger?T.r:color;
  const bg=variant==='solid'?(c||T.g):active?`${c||T.g}1a`:'transparent';
  const fg=variant==='solid'?'#000':active?c||T.g:c||T.mu;
  const bd=`1px solid ${active||variant==='outline'?(c||T.g)+'44':T.b}`;
  const pad=size==='xs'?'4px 10px':size==='sm'?'6px 14px':'9px 18px';
  return<button onClick={onClick}disabled={disabled}style={{background:bg,color:fg,border:bd,padding:pad,borderRadius:8,cursor:disabled?'not-allowed':'pointer',fontFamily:'inherit',fontSize:size==='xs'?10:size==='sm'?12:13,fontWeight:700,opacity:disabled?0.35:1,width:full?'100%':'auto',transition:'all 0.15s',whiteSpace:'nowrap'}}>{children}</button>;
});

const Inp=memo(({label,value,onChange,type='text',min,max,step,placeholder,suffix,prefix,note})=>(
  <div>
    {label&&<div style={{color:T.mu,fontSize:10,fontWeight:600,letterSpacing:'0.07em',textTransform:'uppercase',marginBottom:5}}>{label}</div>}
    <div style={{position:'relative',display:'flex',alignItems:'center'}}>
      {prefix&&<span style={{position:'absolute',left:10,color:T.mu,fontSize:12,pointerEvents:'none'}}>{prefix}</span>}
      <input type={type}min={min}max={max}step={step||'any'}value={value}onChange={e=>onChange(e.target.value)}placeholder={placeholder||''}
        style={{background:T.bg,border:`1px solid ${T.b2}`,borderRadius:8,padding:`9px ${suffix?'36px':'12px'} 9px ${prefix?'24px':'12px'}`,color:T.tx,fontFamily:'inherit',fontSize:13,width:'100%',outline:'none',boxSizing:'border-box'}}/>
      {suffix&&<span style={{position:'absolute',right:10,color:T.mu,fontSize:11,pointerEvents:'none'}}>{suffix}</span>}
    </div>
    {note&&<div style={{color:T.mu,fontSize:10,marginTop:4,lineHeight:1.5}}>{note}</div>}
  </div>
));

const Toggle=memo(({label,checked,onChange,color=T.g,desc})=>(
  <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:12,padding:'10px 0',borderBottom:`1px solid ${T.b}`}}>
    <div style={{flex:1}}>
      <div style={{color:T.tx,fontSize:13,fontWeight:500}}>{label}</div>
      {desc&&<div style={{color:T.mu,fontSize:11,marginTop:2}}>{desc}</div>}
    </div>
    <div onClick={()=>onChange(!checked)}style={{width:42,height:24,borderRadius:12,background:checked?color:'#1e293b',border:`1px solid ${checked?color:'#334155'}`,position:'relative',cursor:'pointer',flexShrink:0,transition:'all 0.2s',marginTop:2}}>
      <div style={{width:18,height:18,borderRadius:'50%',background:'#fff',position:'absolute',top:2,left:checked?20:2,transition:'left 0.2s',boxShadow:'0 1px 4px #0006'}}/>
    </div>
  </div>
));

const Panel=memo(({title,right,children,noPad,accent})=>(
  <div style={{background:T.card,border:`1px solid ${accent?accent+'30':T.b}`,borderRadius:12,overflow:'hidden',boxShadow:accent?`0 0 20px ${accent}0a`:'none'}}>
    {title&&<div style={{padding:'10px 14px',borderBottom:`1px solid ${T.b}`,display:'flex',justifyContent:'space-between',alignItems:'center',background:'#04060a'}}>
      <span style={{color:T.mu,fontSize:9,fontWeight:700,letterSpacing:'0.12em',textTransform:'uppercase'}}>{title}</span>
      {right&&<span style={{color:T.mu,fontSize:9}}>{right}</span>}
    </div>}
    {noPad?children:<div style={{padding:14}}>{children}</div>}
  </div>
));

const StatBox=memo(({label,value,sub,color,glow,icon})=>(
  <div style={{background:T.card,border:`1px solid ${glow?color+'30':T.b}`,borderRadius:10,padding:'14px 16px',boxShadow:glow?`0 0 24px ${color}10`:'none',minWidth:0}}>
    <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:5}}>
      {icon&&<span style={{fontSize:12}}>{icon}</span>}
      <span style={{color:T.mu,fontSize:9,fontWeight:600,letterSpacing:'0.1em',textTransform:'uppercase'}}>{label}</span>
    </div>
    <div style={{fontSize:20,fontWeight:800,color:color||T.tx,letterSpacing:'-0.02em',lineHeight:1}}>{value}</div>
    {sub&&<div style={{color:T.mu,fontSize:10,marginTop:4}}>{sub}</div>}
  </div>
));

// ── Bot Config Modal (create / edit) ──────────────────────────────────────────
const BotModal=memo(({bot,strategies,exchanges,onClose,onSave,isNew})=>{
  const COLORS=['#00e5a0','#3b82f6','#f5365c','#fb923c','#8b5cf6','#22d3ee','#eab308','#ec4899'];
  const defaults={name:isNew?`Bot ${Date.now().toString().slice(-3)}`:(bot?.name||'Bot'),strategy:bot?.strategy||'PRECISION',botMode:bot?.botMode||'PAPER',color:bot?.color||'#00e5a0',startingBalance:bot?.startingBalance||100,maxTradeUSD:bot?.maxTradeUSD||20,stopLossPct:+((bot?.stopLossPct||0.05)*100).toFixed(1),takeProfitPct:+((bot?.takeProfitPct||0.08)*100).toFixed(1),maxDrawdownPct:+((bot?.maxDrawdownPct||0.20)*100).toFixed(0),maxPositionPct:+((bot?.maxPositionPct||0.35)*100).toFixed(0),leverageEnabled:bot?.leverageEnabled||false,maxLeverage:bot?.maxLeverage||3,exchangeId:bot?.exchangeId||'paper'};
  const[f,setF]=useState(defaults);
  const[saving,setSaving]=useState(false);
  const[err,setErr]=useState('');
  const[tab,setTab]=useState('general');
  const set=(k,v)=>setF(p=>({...p,[k]:v}));

  async function save(){
    setSaving(true);setErr('');
    try{
      await onSave({...f,stopLossPct:+f.stopLossPct/100,takeProfitPct:+f.takeProfitPct/100,maxDrawdownPct:+f.maxDrawdownPct/100,maxPositionPct:+f.maxPositionPct/100,startingBalance:+f.startingBalance,maxTradeUSD:+f.maxTradeUSD,maxLeverage:+f.maxLeverage});
      onClose();
    }catch(e){setErr(e.message||'Save failed');}
    setSaving(false);
  }

  const sc=SC[f.strategy]||T.bl;
  const TABS=['general','strategy','risk','perps'];

  return(
    <div style={{position:'fixed',inset:0,background:'#000000d8',zIndex:500,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:T.card2,border:`1px solid ${T.b2}`,borderRadius:16,width:'100%',maxWidth:540,maxHeight:'92vh',overflowY:'auto',display:'flex',flexDirection:'column'}}>
        {/* Header */}
        <div style={{padding:'18px 20px 0',flexShrink:0}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <div style={{width:12,height:12,borderRadius:'50%',background:f.color,boxShadow:`0 0 10px ${f.color}`}}/>
              <span style={{color:T.tx,fontSize:17,fontWeight:800}}>{isNew?'Create New Bot':'Configure Bot'}</span>
            </div>
            <button onClick={onClose}style={{color:T.mu,background:'none',border:'none',fontSize:22,cursor:'pointer',lineHeight:1}}>×</button>
          </div>
          {err&&<div style={{color:T.r,fontSize:12,marginBottom:12,padding:'9px 12px',background:T.rd,borderRadius:8}}>{err}</div>}
          {/* Tabs */}
          <div style={{display:'flex',gap:0,borderBottom:`1px solid ${T.b}`,marginBottom:0}}>
            {TABS.map(t=><button key={t}onClick={()=>setTab(t)}style={{background:'transparent',border:'none',padding:'8px 14px',color:tab===t?T.g:T.mu,fontSize:11,fontWeight:700,cursor:'pointer',borderBottom:tab===t?`2px solid ${T.g}`:'2px solid transparent',textTransform:'uppercase',letterSpacing:'0.06em'}}>{t}</button>)}
          </div>
        </div>

        <div style={{padding:'16px 20px',flex:1,overflowY:'auto'}}>
          {/* GENERAL */}
          {tab==='general'&&<div style={{display:'flex',flexDirection:'column',gap:14}}>
            <div style={{display:'grid',gridTemplateColumns:'1fr auto',gap:12,alignItems:'end'}}>
              <Inp label="Bot Name" value={f.name} onChange={v=>set('name',v)} placeholder="My Trading Bot"/>
              <div>
                <div style={{color:T.mu,fontSize:10,fontWeight:600,textTransform:'uppercase',marginBottom:5}}>Color</div>
                <div style={{display:'flex',gap:5}}>{COLORS.map(c=><div key={c}onClick={()=>set('color',c)}style={{width:24,height:24,borderRadius:'50%',background:c,cursor:'pointer',border:f.color===c?'2px solid #fff':'2px solid transparent',flexShrink:0,transition:'transform 0.15s',transform:f.color===c?'scale(1.2)':'scale(1)'}}/>)}</div>
              </div>
            </div>
            <div>
              <div style={{color:T.mu,fontSize:10,fontWeight:600,textTransform:'uppercase',marginBottom:8}}>Trading Mode</div>
              <div style={{display:'flex',gap:8}}>
                {['PAPER','LIVE'].map(m=>(
                  <button key={m}onClick={()=>set('botMode',m)}style={{flex:1,padding:'12px',borderRadius:10,cursor:'pointer',border:`1.5px solid ${f.botMode===m?(m==='LIVE'?T.r:T.bl)+'88':T.b}`,background:f.botMode===m?(m==='LIVE'?T.r:T.bl)+'14':'transparent',color:f.botMode===m?(m==='LIVE'?T.r:T.bl):T.mu,fontWeight:700,fontSize:13,fontFamily:'inherit',transition:'all 0.15s'}}>
                    {m==='PAPER'?'📄 Paper (Safe)':'🔴 Live (Real Money)'}
                  </button>
                ))}
              </div>
              {f.botMode==='LIVE'&&<div style={{marginTop:8,padding:'9px 12px',background:T.rd,borderRadius:8,color:T.r,fontSize:11}}>⚠ Live mode executes real trades on connected exchange. Connect exchange first.</div>}
            </div>
            <div>
              <div style={{color:T.mu,fontSize:10,fontWeight:600,textTransform:'uppercase',marginBottom:8}}>Exchange</div>
              <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                <button onClick={()=>set('exchangeId','paper')}style={{background:f.exchangeId==='paper'?'#64748b18':'transparent',border:`1px solid ${f.exchangeId==='paper'?T.mu:T.b}`,borderRadius:8,padding:'7px 14px',cursor:'pointer',color:f.exchangeId==='paper'?'#94a3b8':T.mu,fontSize:12,fontWeight:600}}>📄 Paper</button>
                {exchanges.map(ex=><button key={ex.id}onClick={()=>set('exchangeId',ex.id)}style={{background:f.exchangeId===ex.id?(EXC[ex.exchange]||T.bl)+'18':'transparent',border:`1px solid ${f.exchangeId===ex.id?(EXC[ex.exchange]||T.bl):T.b}`,borderRadius:8,padding:'7px 14px',cursor:'pointer',color:f.exchangeId===ex.id?(EXC[ex.exchange]||T.bl):T.mu,fontSize:12,fontWeight:600}}>{EXN[ex.exchange]||ex.exchange} {ex.mode==='LIVE'?'🔴':'📄'}</button>)}
              </div>
            </div>
          </div>}

          {/* STRATEGY */}
          {tab==='strategy'&&<div style={{display:'flex',flexDirection:'column',gap:10}}>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
              {Object.entries(SC).map(([key,color])=>(
                <button key={key}onClick={()=>set('strategy',key)}style={{background:f.strategy===key?color+'1a':'#ffffff04',border:`1.5px solid ${f.strategy===key?color:T.b}`,borderRadius:10,padding:'11px 13px',cursor:'pointer',textAlign:'left',transition:'all 0.15s'}}>
                  <div style={{color:f.strategy===key?color:T.tx,fontWeight:700,fontSize:12,marginBottom:3}}>{key.replace('_',' ')}</div>
                  <div style={{color:T.mu,fontSize:10,lineHeight:1.4}}>{SD[key]}</div>
                </button>
              ))}
            </div>
            <div style={{padding:'10px 12px',background:`${sc}10`,borderRadius:8,border:`1px solid ${sc}25`}}>
              <span style={{color:sc,fontSize:11,fontWeight:600}}>Active: {f.strategy} — </span>
              <span style={{color:T.mu,fontSize:11}}>{SD[f.strategy]}</span>
            </div>
          </div>}

          {/* RISK */}
          {tab==='risk'&&<div style={{display:'flex',flexDirection:'column',gap:12}}>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              <Inp label="Starting Balance" value={f.startingBalance} onChange={v=>set('startingBalance',v)} type="number" min={1} prefix="$" note="Initial capital for this bot"/>
              <Inp label="Max Trade Size" value={f.maxTradeUSD} onChange={v=>set('maxTradeUSD',v)} type="number" min={5} prefix="$" note="Max USD per single trade"/>
              <Inp label="Stop Loss" value={f.stopLossPct} onChange={v=>set('stopLossPct',v)} type="number" min={0.1} max={50} step={0.1} suffix="%" note="Sell at this % loss"/>
              <Inp label="Take Profit" value={f.takeProfitPct} onChange={v=>set('takeProfitPct',v)} type="number" min={0.5} max={200} step={0.5} suffix="%" note="Begin taking profit at this %"/>
              <Inp label="Max Drawdown" value={f.maxDrawdownPct} onChange={v=>set('maxDrawdownPct',v)} type="number" min={5} max={95} suffix="%" note="Emergency exit at this drawdown"/>
              <Inp label="Max Position Size" value={f.maxPositionPct} onChange={v=>set('maxPositionPct',v)} type="number" min={5} max={100} suffix="%" note="Max % of balance in one coin"/>
            </div>
            <div style={{padding:'10px 12px',background:'#eab30810',borderRadius:8,border:'1px solid #eab30820',color:'#ca8a04',fontSize:11,lineHeight:1.6}}>
              💡 <strong>Tip:</strong> For AGGRESSIVE strategy, consider wider stops (8–12%) and higher take profit (15–25%). For DCA_PLUS, smaller positions (5–10%) work best.
            </div>
          </div>}

          {/* PERPS */}
          {tab==='perps'&&<div style={{display:'flex',flexDirection:'column',gap:2}}>
            <Toggle label="Enable Leverage / Perpetuals" checked={f.leverageEnabled} onChange={v=>set('leverageEnabled',v)} color={T.pu}
              desc="Trade perpetual futures with leverage. Requires a supported exchange."/>
            {f.leverageEnabled&&<>
              <div style={{marginTop:14}}>
                <div style={{color:T.mu,fontSize:10,fontWeight:600,textTransform:'uppercase',marginBottom:10}}>Max Leverage</div>
                <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                  {[2,3,5,10,15,20].map(n=>(
                    <button key={n}onClick={()=>set('maxLeverage',n)}style={{background:+f.maxLeverage===n?T.pu+'1a':'transparent',border:`1.5px solid ${+f.maxLeverage===n?T.pu:T.b}`,borderRadius:8,padding:'8px 16px',cursor:'pointer',color:+f.maxLeverage===n?T.pu:T.mu,fontWeight:700,fontSize:13,fontFamily:'inherit'}}>{n}x</button>
                  ))}
                </div>
                <div style={{marginTop:10,padding:'10px 12px',background:T.pu+'10',borderRadius:8}}>
                  <div style={{color:T.pu,fontSize:11,fontWeight:600,marginBottom:4}}>Leverage Rules</div>
                  <div style={{color:T.mu,fontSize:11,lineHeight:1.7}}>
                    • Only activates on trades with confidence ≥ 8/10<br/>
                    • Stop loss is tighter at 1×SL ÷ leverage<br/>
                    • Max position size reduced to {Math.round(f.maxPositionPct/(+f.maxLeverage||1))}% when levered<br/>
                    • Supported: Binance Futures, Kraken Pro
                  </div>
                </div>
              </div>
            </>}
            {!f.leverageEnabled&&(
              <div style={{marginTop:14,padding:'16px',background:'#ffffff04',borderRadius:10,textAlign:'center'}}>
                <div style={{fontSize:28,marginBottom:8}}>⚡</div>
                <div style={{color:T.tx,fontSize:13,fontWeight:600,marginBottom:4}}>Leverage Off</div>
                <div style={{color:T.mu,fontSize:12}}>Enable to trade perpetual futures with up to 20x leverage on supported exchanges. High risk — use with caution.</div>
              </div>
            )}
          </div>}
        </div>

        <div style={{padding:'14px 20px',borderTop:`1px solid ${T.b}`,display:'flex',gap:10,flexShrink:0}}>
          <Btn onClick={save}disabled={saving}variant="solid"color={f.color||T.g}full size="sm">{saving?'Saving…':isNew?'Create Bot':'Save Changes'}</Btn>
          <Btn onClick={onClose}size="sm">Cancel</Btn>
        </div>
      </div>
    </div>
  );
});

// ── Settings Modal (global defaults) ─────────────────────────────────────────
const SettingsModal=memo(({user,strategies,onClose,onSave})=>{
  const[f,setF]=useState({
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
  const[saving,setSaving]=useState(false);
  const[err,setErr]=useState('');
  const set=(k,v)=>setF(p=>({...p,[k]:v}));

  async function save(){
    setSaving(true);setErr('');
    try{
      await onSave({
        maxTradeUSD:+f.maxTradeUSD,
        stopLossPct:+f.stopLossPct/100,
        takeProfitPct:+f.takeProfitPct/100,
        maxDrawdownPct:+f.maxDrawdownPct/100,
        startingBalance:+f.startingBalance,
        botMode:f.botMode,
        tradingStrategy:f.tradingStrategy,
        leverageEnabled:f.leverageEnabled,
        maxLeverage:+f.maxLeverage,
      });
      onClose();
    }catch(e){setErr(e.message||'Save failed');}
    setSaving(false);
  }

  return(
    <div style={{position:'fixed',inset:0,background:'#000000d8',zIndex:500,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:T.card2,border:`1px solid ${T.b2}`,borderRadius:16,width:'100%',maxWidth:480,maxHeight:'90vh',overflowY:'auto',padding:22}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:18}}>
          <span style={{color:T.tx,fontSize:17,fontWeight:800}}>⚙ Global Defaults</span>
          <button onClick={onClose}style={{color:T.mu,background:'none',border:'none',fontSize:22,cursor:'pointer'}}>×</button>
        </div>
        <div style={{color:T.mu,fontSize:11,marginBottom:16,padding:'9px 12px',background:'#ffffff05',borderRadius:8}}>These are defaults for new bots. Each bot can be individually configured via the ⚙ icon on its card.</div>
        {err&&<div style={{color:T.r,fontSize:12,marginBottom:14,padding:'9px',background:T.rd,borderRadius:8}}>{err}</div>}

        <div style={{marginBottom:16}}>
          <div style={{color:T.mu,fontSize:10,fontWeight:700,textTransform:'uppercase',marginBottom:8}}>Default Strategy</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
            {strategies.map(s=>(
              <button key={s.key}onClick={()=>set('tradingStrategy',s.key)}style={{background:f.tradingStrategy===s.key?(SC[s.key]||T.bl)+'18':'#ffffff04',border:`1.5px solid ${f.tradingStrategy===s.key?(SC[s.key]||T.bl):T.b}`,borderRadius:9,padding:'9px 11px',cursor:'pointer',textAlign:'left',transition:'all 0.15s'}}>
                <div style={{color:f.tradingStrategy===s.key?(SC[s.key]||T.bl):T.tx,fontWeight:700,fontSize:11,marginBottom:2}}>{s.name}</div>
                <div style={{color:T.mu,fontSize:9,lineHeight:1.4}}>{s.description?.slice(0,60)}…</div>
              </button>
            ))}
          </div>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:14}}>
          <Inp label="Starting Balance" value={f.startingBalance} onChange={v=>set('startingBalance',v)} type="number" min={1} prefix="$"/>
          <Inp label="Max Trade ($)" value={f.maxTradeUSD} onChange={v=>set('maxTradeUSD',v)} type="number" min={5} prefix="$"/>
          <Inp label="Stop Loss" value={f.stopLossPct} onChange={v=>set('stopLossPct',v)} type="number" min={0.1} max={50} step={0.1} suffix="%"/>
          <Inp label="Take Profit" value={f.takeProfitPct} onChange={v=>set('takeProfitPct',v)} type="number" min={0.5} max={200} step={0.5} suffix="%"/>
          <Inp label="Max Drawdown" value={f.maxDrawdownPct} onChange={v=>set('maxDrawdownPct',v)} type="number" min={5} max={95} suffix="%"/>
        </div>

        <div style={{marginBottom:14}}>
          <div style={{color:T.mu,fontSize:10,fontWeight:700,textTransform:'uppercase',marginBottom:8}}>Default Mode</div>
          <div style={{display:'flex',gap:8}}>
            <Btn onClick={()=>set('botMode','PAPER')}active={f.botMode==='PAPER'}color={T.bl}size="sm">📄 Paper</Btn>
            <Btn onClick={()=>set('botMode','LIVE')}active={f.botMode==='LIVE'}color={T.r}size="sm">🔴 Live</Btn>
          </div>
        </div>

        <Toggle label="Enable Leverage by Default" checked={f.leverageEnabled} onChange={v=>set('leverageEnabled',v)} color={T.pu} desc="New bots will have leverage enabled. Max leverage applies."/>
        {f.leverageEnabled&&(
          <div style={{marginTop:10,marginBottom:12}}>
            <div style={{color:T.mu,fontSize:10,fontWeight:600,textTransform:'uppercase',marginBottom:8}}>Default Max Leverage</div>
            <div style={{display:'flex',gap:6}}>
              {[2,3,5,10,20].map(n=><Btn key={n}onClick={()=>set('maxLeverage',n)}active={+f.maxLeverage===n}color={T.pu}size="xs">{n}x</Btn>)}
            </div>
          </div>
        )}

        <div style={{display:'flex',gap:10,marginTop:18}}>
          <Btn onClick={save}disabled={saving}variant="solid"color={T.g}full size="sm">{saving?'Saving…':'Save & Apply'}</Btn>
          <Btn onClick={onClose}size="sm">Cancel</Btn>
        </div>
      </div>
    </div>
  );
});

// ── Bot Card ──────────────────────────────────────────────────────────────────
const BotCard=memo(({bot,prices,isSelected,onSelect,onStart,onStop,onReset,onEdit,onDelete,busy})=>{
  const running=['running','cycling'].includes(bot?.status);
  const tv=bot?.totalValue||(bot?.balance||0);
  const pnl=tv-(bot?.startingBalance||100);
  const sells=(bot?.trades||[]).filter(t=>t.type==='SELL');
  const wins=sells.filter(t=>t.pnl>0).length;
  const wr=sells.length?`${((wins/sells.length)*100).toFixed(0)}%`:'—';
  const sc=SC[bot?.strategy]||T.bl;
  const drawdown=bot?.peakValue>0?((bot.peakValue-tv)/bot.peakValue*100):0;

  return(
    <div onClick={onSelect}style={{background:T.card,border:`2px solid ${isSelected?sc:running?sc+'33':T.b}`,borderRadius:12,padding:16,cursor:'pointer',transition:'all 0.2s',boxShadow:running?`0 0 24px ${sc}0d`:'none',position:'relative',overflow:'hidden'}}>
      {running&&<div style={{position:'absolute',top:0,left:0,right:0,height:2,background:`linear-gradient(90deg,transparent,${sc},transparent)`,animation:'shimmer 2s linear infinite'}}/>}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:12}}>
        <div style={{display:'flex',alignItems:'center',gap:8,minWidth:0}}>
          <div style={{width:10,height:10,borderRadius:'50%',background:running?bot.color||sc:T.mu,boxShadow:running?`0 0 10px ${bot.color||sc}`:'none',flexShrink:0,animation:running?'pulse 2s infinite':'none'}}/>
          <div style={{minWidth:0}}>
            <div style={{color:T.tx,fontWeight:700,fontSize:14,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{bot?.name}</div>
            <div style={{display:'flex',gap:4,marginTop:3,flexWrap:'wrap'}}>
              <Chip c={sc}sm>{bot?.strategy}</Chip>
              {bot?.leverageEnabled&&<Chip c={T.pu}sm>⚡{bot?.maxLeverage}x</Chip>}
              <Chip c={bot?.botMode==='LIVE'?T.r:T.dim}sm>{bot?.botMode}</Chip>
            </div>
          </div>
        </div>
        <div style={{textAlign:'right',flexShrink:0,marginLeft:8}}>
          <div style={{color:pnl>=0?T.g:T.r,fontWeight:800,fontSize:17}}>{fUSD(tv)}</div>
          <div style={{color:pnl>=0?T.g:T.r,fontSize:10}}>{pnl>=0?'+':''}{fUSD(pnl)} ({fPct(((tv/(bot?.startingBalance||100))-1)*100)})</div>
        </div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:5,marginBottom:12}}>
        {[['Cash',fUSD(bot?.balance),''],['Win Rate',wr,parseInt(wr)>=50?T.g:parseInt(wr)>0?T.a:T.mu],['Trades',bot?.trades?.length||0,''],['Drawdown',fPct(-drawdown),drawdown>15?T.r:drawdown>8?T.a:T.g]].map(([l,v,c])=>(
          <div key={l}style={{background:'#ffffff04',padding:'6px 7px',borderRadius:7,textAlign:'center'}}>
            <div style={{color:T.mu,fontSize:7,fontWeight:600,textTransform:'uppercase',marginBottom:2}}>{l}</div>
            <div style={{color:c||T.tx,fontSize:11,fontWeight:700}}>{v}</div>
          </div>
        ))}
      </div>

      {/* Mini equity sparkline */}
      {(bot?.trades||[]).filter(t=>t.type==='SELL'&&t.pnl!=null).length>=2&&(()=>{
        const pts=[];let v=bot.startingBalance||100;
        [...(bot.trades||[])].reverse().forEach((t,i)=>{if(t.type==='SELL'&&t.pnl!=null){v+=t.pnl;pts.push({i,v:+v.toFixed(2)});}});
        const color=v>=(bot.startingBalance||100)?T.g:T.r;
        return<div style={{height:36,marginBottom:10}}>
          <ResponsiveContainer width="100%"height="100%">
            <AreaChart data={pts}>
              <defs><linearGradient id={`sg${bot.id?.slice(0,4)}`}x1="0"y1="0"x2="0"y2="1"><stop offset="5%"stopColor={color}stopOpacity={0.3}/><stop offset="95%"stopColor={color}stopOpacity={0}/></linearGradient></defs>
              <XAxis dataKey="i"hide/><YAxis domain={['auto','auto']}hide/>
              <Area type="monotone"dataKey="v"stroke={color}strokeWidth={1.5}fill={`url(#sg${bot.id?.slice(0,4)})`}dot={false}/>
            </AreaChart>
          </ResponsiveContainer>
        </div>;
      })()}

      <div style={{display:'flex',gap:5}}>
        {running
          ?<Btn onClick={e=>{e.stopPropagation();onStop(bot.id);}}variant="outline"color={T.r}size="xs"full disabled={busy}>◼ Stop</Btn>
          :<Btn onClick={e=>{e.stopPropagation();onStart(bot.id);}}variant="solid"color={sc}size="xs"full disabled={busy}>▶ Start</Btn>
        }
        <Btn onClick={e=>{e.stopPropagation();onReset(bot.id);}}size="xs"color={T.mu}disabled={busy}>↺</Btn>
        <Btn onClick={e=>{e.stopPropagation();onEdit(bot);}}size="xs">⚙</Btn>
        <Btn onClick={e=>{e.stopPropagation();onDelete(bot.id);}}size="xs"danger>✕</Btn>
      </div>
    </div>
  );
});

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function Dashboard(){
  const{user,logout,setUser}=useAuth();
  const{bots,prices,strategies,connected}=useBotSocket();
  const nav=useNavigate();
  const isMobile=useMobile();
  const[tab,setTab]=useState('bots');
  const[showSettings,setShowSettings]=useState(false);
  const[showNewBot,setShowNewBot]=useState(false);
  const[editingBot,setEditingBot]=useState(null);
  const[selectedBotId,setSelectedBotId]=useState(null);
  const[exchanges,setExchanges]=useState([]);
  const[busy,setBusy]=useState({});
  const[exForm,setExForm]=useState({exchange:'coinbase',apiKey:'',apiSecret:'',apiPassphrase:'',label:'',mode:'PAPER'});
  const[exErr,setExErr]=useState('');
  const[exLoading,setExLoading]=useState(false);
  const logRef=useRef(null);

  // Init
  useEffect(()=>{
    if(!user){nav('/login');return;}
    api.exchanges().then(d=>setExchanges(d.exchanges||[])).catch(()=>{});
  },[user]);

  // Auto-select first bot
  useEffect(()=>{
    if(!selectedBotId&&bots.length>0)setSelectedBotId(bots[0].id);
  },[bots,selectedBotId]);

  const selectedBot=useMemo(()=>bots.find(b=>b.id===selectedBotId)||bots[0]||null,[bots,selectedBotId]);
  const logLen=selectedBot?.logs?.length||0;
  useEffect(()=>{const el=logRef.current;if(el)el.scrollTop=el.scrollHeight;},[logLen]);

  // Aggregates
  const totalValue=useMemo(()=>bots.reduce((s,b)=>s+(b.totalValue||b.balance||0),0),[bots]);
  const totalPnl=useMemo(()=>bots.reduce((s,b)=>s+(b.pnl||0),0),[bots]);
  const totalTrades=useMemo(()=>bots.reduce((s,b)=>s+(b.trades?.length||0),0),[bots]);
  const runningCount=useMemo(()=>bots.filter(b=>['running','cycling'].includes(b.status)).length,[bots]);
  const overallWR=useMemo(()=>{
    const allSells=bots.flatMap(b=>b.trades?.filter(t=>t.type==='SELL')||[]);
    const w=allSells.filter(t=>t.pnl>0).length;
    return allSells.length?`${((w/allSells.length)*100).toFixed(0)}%`:'—';
  },[bots]);

  const setBusy2=(id,v)=>setBusy(p=>({...p,[id]:v}));
  const ctrl=async(action,id)=>{
    setBusy2(id,true);
    try{
      if(action==='start')await api.startBot(id);
      else if(action==='stop')await api.stopBot(id);
      else if(action==='reset'){if(!confirm('Reset this bot? All trades will be cleared.'))return;await api.resetBot(id);}
      else if(action==='delete'){if(!confirm('Permanently delete this bot?'))return;await api.deleteBot(id);if(selectedBotId===id)setSelectedBotId(null);}
    }catch(e){alert(e.message);}
    setBusy2(id,false);
  };

  const saveSettings=async data=>{
    const r=await api.botSettings(data);
    if(r.user&&setUser)setUser(r.user);
  };

  const createBot=async data=>{
    await api.createBot(data);
    setShowNewBot(false);
  };

  const editBot=async data=>{
    if(!editingBot)return;
    await api.updateBot(editingBot.id,data);
    setEditingBot(null);
  };

  const connectExchange=async()=>{
    setExErr('');setExLoading(true);
    try{await api.connectEx(exForm);const d=await api.exchanges();setExchanges(d.exchanges||[]);setExForm({exchange:'coinbase',apiKey:'',apiSecret:'',apiPassphrase:'',label:'',mode:'PAPER'});}
    catch(e){setExErr(e.message);}
    setExLoading(false);
  };

  if(!user)return(
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:T.bg,flexDirection:'column',gap:16}}>
      <div style={{color:T.g,fontSize:22,fontWeight:800,letterSpacing:'-0.03em'}}>NEXUS</div>
      <div style={{color:T.mu,fontSize:12}}>Loading dashboard…</div>
      <div style={{width:140,height:2,background:T.b,borderRadius:1,overflow:'hidden'}}><div style={{width:'50%',height:'100%',background:T.g,animation:'slide 1.2s ease-in-out infinite'}}/></div>
      <style>{`@keyframes slide{0%{transform:translateX(-200%)}100%{transform:translateX(400%)}}`}</style>
    </div>
  );

  const TABS=isMobile?['bots','log','market','exchanges']:['bots','live log','positions','market','exchanges','analytics'];

  return(
    <div style={{minHeight:'100vh',background:T.bg,color:T.tx,fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"}}>
      <style>{`
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:3px;height:3px}::-webkit-scrollbar-thumb{background:#1e293b;border-radius:2px}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
        @keyframes shimmer{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}
        @keyframes slide{0%{transform:translateX(-200%)}100%{transform:translateX(400%)}}
        button,input,select{font-family:inherit}
        .hover-row:hover{background:#ffffff06!important}
        .tab-btn:hover{color:#00e5a0!important}
      `}</style>

      {showSettings&&<SettingsModal user={user}strategies={strategies}onClose={()=>setShowSettings(false)}onSave={saveSettings}/>}
      {showNewBot&&<BotModal isNew strategies={strategies}exchanges={exchanges}onClose={()=>setShowNewBot(false)}onSave={createBot}/>}
      {editingBot&&<BotModal bot={editingBot}strategies={strategies}exchanges={exchanges}onClose={()=>setEditingBot(null)}onSave={editBot}/>}

      {/* Risk bar */}
      <div style={{background:'#f5365c06',borderBottom:'1px solid #f5365c12',padding:'4px 16px',textAlign:'center'}}>
        <span style={{color:'#f5365c55',fontSize:10}}>⚠ Crypto trading involves substantial risk of loss. NEXUS is not a financial adviser. All trades may result in losses. Paper mode active by default.</span>
      </div>

      {/* Header */}
      <header style={{background:T.card,borderBottom:`1px solid ${T.b}`,padding:isMobile?'10px 14px':'10px 20px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,position:'sticky',top:0,zIndex:100}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <div style={{display:'flex',alignItems:'center',gap:6}}>
            <div style={{width:8,height:8,borderRadius:'50%',background:runningCount>0?T.g:T.mu,boxShadow:runningCount>0?`0 0 8px ${T.g}`:'none',animation:runningCount>0?'pulse 2s infinite':'none',flexShrink:0}}/>
            <span style={{color:T.g,fontWeight:800,fontSize:15,letterSpacing:'-0.03em'}}>NEXUS</span>
          </div>
          {!isMobile&&<>
            <span style={{color:T.mu,fontSize:11}}>{runningCount}/{bots.length} active</span>
            <div style={{display:'flex',gap:3}}>
              {bots.map(b=><div key={b.id}title={b.name}style={{width:6,height:6,borderRadius:'50%',background:['running','cycling'].includes(b.status)?b.color||T.g:T.su,transition:'all 0.3s'}}/>)}
            </div>
            {!connected&&<Chip c={T.r}sm>Reconnecting…</Chip>}
          </>}
        </div>
        <div style={{display:'flex',alignItems:'center',gap:6,flexShrink:0}}>
          {!isMobile&&<div style={{textAlign:'right',marginRight:8}}>
            <div style={{color:totalPnl>=0?T.g:T.r,fontSize:17,fontWeight:800,letterSpacing:'-0.02em'}}>{fUSD(totalValue)}</div>
            <div style={{color:totalPnl>=0?T.g:T.r,fontSize:10}}>{totalPnl>=0?'+':''}{fUSD(totalPnl)} · {overallWR} WR</div>
          </div>}
          <Btn onClick={()=>setShowNewBot(true)}variant="solid"color={T.g}size="sm">+ Bot</Btn>
          <Btn onClick={()=>setShowSettings(true)}size="sm">⚙{!isMobile&&' Defaults'}</Btn>
          <button onClick={()=>{logout();nav('/');}}style={{color:T.mu,background:'none',border:'none',fontSize:11,padding:'4px 8px',cursor:'pointer'}}>Sign Out</button>
        </div>
      </header>

      {/* Desktop summary strip */}
      {!isMobile&&bots.length>0&&(
        <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:1,background:T.b}}>
          {[
            {icon:'💼',l:'PORTFOLIO',v:fUSD(totalValue),s:`${bots.length} bot${bots.length!==1?'s':''}`,c:totalPnl>=0?T.g:T.r,glow:totalPnl>0},
            {icon:'📈',l:'TOTAL P&L',v:`${totalPnl>=0?'+':''}${fUSD(totalPnl)}`,s:fPct(bots.reduce((s,b)=>s+(b.pnlPct||0),0)/Math.max(bots.length,1)),c:totalPnl>=0?T.g:T.r},
            {icon:'🎯',l:'WIN RATE',v:overallWR,s:`across ${totalTrades} trades`,c:parseInt(overallWR)>=60?T.g:parseInt(overallWR)>=45?T.a:T.r},
            {icon:'⚡',l:'RUNNING',v:`${runningCount}/${bots.length}`,s:runningCount>0?'bots active':'all stopped',c:runningCount>0?T.g:T.mu},
            {icon:'🔗',l:'EXCHANGES',v:exchanges.length||'None',s:exchanges.filter(e=>e.mode==='LIVE').length+' live connected',c:exchanges.length>0?T.g:T.mu},
            {icon:'💰',l:'TOTAL FEES',v:fUSD(bots.reduce((s,b)=>s+(b.totalFees||0),0)),s:'across all bots',c:T.mu},
          ].map((s,i)=>(
            <div key={i}style={{background:T.card,padding:'11px 14px'}}>
              <div style={{display:'flex',alignItems:'center',gap:4,marginBottom:3}}>
                <span style={{fontSize:10}}>{s.icon}</span>
                <span style={{color:T.mu,fontSize:8,fontWeight:700,letterSpacing:'0.1em',textTransform:'uppercase'}}>{s.l}</span>
              </div>
              <div style={{fontSize:17,fontWeight:800,color:s.c||T.tx,letterSpacing:'-0.02em'}}>{s.v}</div>
              <div style={{color:T.mu,fontSize:9,marginTop:2}}>{s.s}</div>
            </div>
          ))}
        </div>
      )}

      {/* Mobile summary */}
      {isMobile&&bots.length>0&&(
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:6,padding:'10px 14px',borderBottom:`1px solid ${T.b}`}}>
          {[{l:'VALUE',v:fUSD(totalValue),c:totalPnl>=0?T.g:T.r},{l:'P&L',v:`${totalPnl>=0?'+':''}${fUSD(totalPnl)}`,c:totalPnl>=0?T.g:T.r},{l:'WIN',v:overallWR,c:T.tx}].map(s=>(
            <div key={s.l}style={{background:T.card,borderRadius:8,padding:'9px',textAlign:'center'}}>
              <div style={{color:T.mu,fontSize:8,fontWeight:700,marginBottom:2,textTransform:'uppercase'}}>{s.l}</div>
              <div style={{color:s.c,fontSize:14,fontWeight:800}}>{s.v}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{background:T.card,borderBottom:`1px solid ${T.b}`,padding:`0 ${isMobile?'12px':'20px'}`,display:'flex',overflowX:'auto',WebkitOverflowScrolling:'touch',gap:0}}>
        {TABS.map(t=><button key={t}className="tab-btn"onClick={()=>setTab(t)}style={{background:'transparent',border:'none',padding:isMobile?'9px 11px':'9px 14px',color:tab===t?T.g:T.mu,fontSize:isMobile?10:11,fontWeight:700,cursor:'pointer',borderBottom:tab===t?`2px solid ${T.g}`:'2px solid transparent',whiteSpace:'nowrap',textTransform:'uppercase',letterSpacing:'0.06em',transition:'color 0.15s'}}>{t}</button>)}
      </div>

      <div style={{padding:isMobile?'12px 14px':'16px 20px',minHeight:'calc(100vh - 280px)'}}>

        {/* BOTS */}
        {tab==='bots'&&(
          <div style={{display:'flex',flexDirection:'column',gap:14}}>
            <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':`repeat(${Math.min(Math.max(bots.length,1)+1,4)},1fr)`,gap:12,alignItems:'start'}}>
              {bots.map(bot=>(
                <BotCard key={bot.id}bot={bot}prices={prices}
                  isSelected={selectedBotId===bot.id}
                  onSelect={()=>setSelectedBotId(bot.id)}
                  onStart={id=>ctrl('start',id)}onStop={id=>ctrl('stop',id)}
                  onReset={id=>ctrl('reset',id)}onDelete={id=>ctrl('delete',id)}
                  onEdit={b=>{setEditingBot(b);}}
                  busy={!!busy[bot.id]}/>
              ))}
              {bots.length<3&&(
                <button onClick={()=>setShowNewBot(true)}
                  style={{background:'transparent',border:`2px dashed ${T.b2}`,borderRadius:12,padding:24,cursor:'pointer',color:T.mu,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:8,minHeight:200,transition:'border-color 0.2s'}}
                  onMouseEnter={e=>(e.currentTarget.style.borderColor=T.g+'44')}
                  onMouseLeave={e=>(e.currentTarget.style.borderColor=T.b2)}>
                  <span style={{fontSize:32,lineHeight:1}}>+</span>
                  <span style={{fontSize:13,fontWeight:700}}>Add Bot</span>
                  <span style={{fontSize:10,textAlign:'center',lineHeight:1.5,maxWidth:140}}>Run multiple strategies at the same time. Up to 3 bots.</span>
                </button>
              )}
            </div>

            {/* Selected bot detail */}
            {selectedBot&&(
              <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'2fr 1fr',gap:14}}>
                <Panel title={`${selectedBot.name} — Recent Trades`}right={`${selectedBot.trades?.length||0} total`}noPad>
                  {!(selectedBot.trades?.length)
                    ?<div style={{padding:'32px 14px',color:T.mu,fontSize:13,textAlign:'center'}}>
                      <div style={{fontSize:28,marginBottom:8}}>🤖</div>
                      <div style={{fontWeight:600,marginBottom:4}}>No trades yet</div>
                      <div style={{fontSize:11}}>Start the bot to begin trading with the {selectedBot.strategy} strategy.</div>
                    </div>
                    :<div style={{maxHeight:300,overflowY:'auto'}}>
                      {(selectedBot.trades||[]).slice(0,60).map((t,i)=>{
                        const ac=t.type==='BUY'?T.g:t.type==='SELL'?(t.pnl>=0?T.bl:T.r):T.mu;
                        return<div key={i}className="hover-row"style={{padding:'8px 14px',borderBottom:`1px solid ${T.b}`,display:'flex',justifyContent:'space-between',alignItems:'center',gap:8,transition:'background 0.1s'}}>
                          <div style={{display:'flex',gap:7,alignItems:'center',flex:1,minWidth:0}}>
                            <Chip c={ac}sm>{t.type}</Chip>
                            {t.coin&&<span style={{color:CC[t.coin]||T.tx,fontWeight:700,fontSize:12,minWidth:32,flexShrink:0}}>{t.coin}</span>}
                            {t.leverage>1&&<Chip c={T.pu}sm>{t.leverage}x</Chip>}
                            {!isMobile&&t.strategy&&<Chip c={SC[t.strategy]||T.mu}sm>{t.strategy}</Chip>}
                            {!isMobile&&<span style={{color:T.mu,fontSize:10,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.reasoning?.slice(0,65)}</span>}
                          </div>
                          <div style={{display:'flex',gap:7,alignItems:'center',flexShrink:0}}>
                            {t.pnl!=null&&<span style={{color:t.pnl>=0?T.g:T.r,fontSize:11,fontWeight:700}}>{t.pnl>=0?'+':''}{fUSD(t.pnl)}</span>}
                            <span style={{color:T.su,fontSize:9}}>{fT(t.ts)}</span>
                          </div>
                        </div>;
                      })}
                    </div>
                  }
                </Panel>

                <div style={{display:'flex',flexDirection:'column',gap:12}}>
                  {/* Config summary card */}
                  <Panel title="Bot Configuration">
                    <div style={{display:'flex',flexDirection:'column',gap:3}}>
                      {[
                        ['Strategy',<Chip c={SC[selectedBot.strategy]||T.bl}sm>{selectedBot.strategy}</Chip>],
                        ['Mode',<Chip c={selectedBot.botMode==='LIVE'?T.r:T.bl}sm>{selectedBot.botMode}</Chip>],
                        ['Balance',fUSD(selectedBot.balance)],
                        ['Stop Loss',fPct(-selectedBot.stopLossPct*100)],
                        ['Take Profit',fPct(selectedBot.takeProfitPct*100)],
                        ['Max Trade',fUSD(selectedBot.maxTradeUSD)],
                        ['Leverage',selectedBot.leverageEnabled?`${selectedBot.maxLeverage}x enabled`:'Disabled'],
                        ['Cycles',fNum(selectedBot.cycleCount)],
                        ['Fees Paid',fUSD(selectedBot.totalFees)],
                      ].map(([l,v])=>(
                        <div key={l}style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'5px 0',borderBottom:`1px solid ${T.b}`}}>
                          <span style={{color:T.mu,fontSize:11}}>{l}</span>
                          <span style={{color:T.tx,fontSize:11,fontWeight:600}}>{typeof v==='string'?v:<>{v}</>}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{marginTop:10}}>
                      <Btn onClick={()=>setEditingBot(selectedBot)}full size="sm">⚙ Configure</Btn>
                    </div>
                  </Panel>

                  {/* Open positions */}
                  <Panel title="Open Positions"right={`${Object.keys(selectedBot.portfolio||{}).length} open`}>
                    {!Object.keys(selectedBot.portfolio||{}).length
                      ?<div style={{color:T.mu,fontSize:12,textAlign:'center',padding:'12px 0'}}>No open positions</div>
                      :Object.entries(selectedBot.portfolio||{}).map(([sym,pos])=>{
                        const px=prices[sym]?.price,pv=px?pos.qty*px:0,pp=px?(px-pos.avgCost)*pos.qty:0;
                        return<div key={sym}style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:`1px solid ${T.b}`}}>
                          <div>
                            <span style={{color:CC[sym]||T.tx,fontWeight:700,fontSize:13}}>{sym}</span>
                            {pos.leverage>1&&<Chip c={T.pu}sm>{pos.leverage}x</Chip>}
                            <div style={{color:T.mu,fontSize:10}}>{pos.qty.toFixed(4)} @ {fUSD(pos.avgCost)}</div>
                          </div>
                          <div style={{textAlign:'right'}}>
                            <div style={{color:T.tx,fontSize:12,fontWeight:700}}>{fUSD(pv)}</div>
                            <div style={{color:pp>=0?T.g:T.r,fontSize:10}}>{pp>=0?'+':''}{fUSD(pp)}</div>
                          </div>
                        </div>;
                      })
                    }
                  </Panel>
                </div>
              </div>
            )}

            {/* No bots empty state */}
            {!bots.length&&(
              <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'60px 20px',textAlign:'center'}}>
                <div style={{fontSize:48,marginBottom:16}}>🤖</div>
                <div style={{color:T.tx,fontSize:20,fontWeight:800,marginBottom:8}}>No Bots Yet</div>
                <div style={{color:T.mu,fontSize:14,maxWidth:400,lineHeight:1.7,marginBottom:24}}>Create your first trading bot. Choose a strategy, set your parameters, and let NEXUS trade autonomously 24/7.</div>
                <Btn onClick={()=>setShowNewBot(true)}variant="solid"color={T.g}size="md">+ Create Your First Bot</Btn>
              </div>
            )}
          </div>
        )}

        {/* LIVE LOG */}
        {(tab==='live log'||tab==='log')&&(
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {bots.length>1&&(
              <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                {bots.map(b=><Btn key={b.id}onClick={()=>setSelectedBotId(b.id)}active={selectedBotId===b.id}color={b.color||SC[b.strategy]||T.bl}size="sm">{b.name}</Btn>)}
              </div>
            )}
            <Panel title={`${selectedBot?.name||'Bot'} · Reasoning Log`}right={`${selectedBot?.logs?.length||0} entries`}noPad>
              <div ref={logRef}style={{height:isMobile?'calc(100vh-260px)':'calc(100vh-300px)',overflowY:'auto',background:'#020406',fontFamily:"'SF Mono','Cascadia Code',monospace",padding:'4px 0'}}>
                {!selectedBot?.logs?.length&&<div style={{padding:20,color:T.mu,fontSize:12,textAlign:'center'}}>
                  <div style={{fontSize:24,marginBottom:8}}>📋</div>
                  Log appears when bot starts running.
                </div>}
                {(selectedBot?.logs||[]).map((e,i)=>{
                  const lc={CYCLE:'#334155',AI:T.pu,SIGNAL:T.g,REASONING:T.tx,TRADE:T.g,PROFIT:T.g,LOSS:T.r,POSITION:T.a,HOLD:T.mu,WARN:T.a,ERROR:T.r,SYSTEM:T.bl,INFO:T.mu}[e.level]||T.mu;
                  const big=['TRADE','PROFIT','LOSS','REASONING','CYCLE'].includes(e.level);
                  return<div key={i}style={{padding:big?'6px 14px':'2px 14px',borderBottom:big?`1px solid ${T.b}`:'none',background:big?'#040910':'transparent',display:'flex',gap:8,alignItems:'flex-start'}}>
                    <span style={{color:'#1e293b',fontSize:9,flexShrink:0,paddingTop:1}}>{fT(e.ts)}</span>
                    <span style={{color:lc,fontSize:9,fontWeight:700,minWidth:54,flexShrink:0}}>[{e.level}]</span>
                    <span style={{color:big?T.tx:'#475569',fontSize:big?11:9,lineHeight:1.6,wordBreak:'break-word'}}>{e.msg}</span>
                  </div>;
                })}
              </div>
            </Panel>
          </div>
        )}

        {/* POSITIONS */}
        {tab==='positions'&&(
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            {bots.map(bot=>{
              const port=bot.portfolio||{};
              if(!Object.keys(port).length)return null;
              return<Panel key={bot.id}title={`${bot.name} — Open Positions`}right={<Chip c={SC[bot.strategy]||T.bl}sm>{bot.strategy}</Chip>}noPad>
                {Object.entries(port).map(([sym,pos])=>{
                  const px=prices[sym]?.price,pv=px?pos.qty*px:0,pp=px?(px-pos.avgCost)*pos.qty:0,ppp=pos.avgCost>0?((px||0)-pos.avgCost)/pos.avgCost*100:0;
                  return<div key={sym}style={{padding:'14px 16px',borderBottom:`1px solid ${T.b}`,display:'grid',gridTemplateColumns:'auto 1fr repeat(4,1fr)',gap:12,alignItems:'center'}}>
                    <div style={{width:36,height:36,borderRadius:8,background:(CC[sym]||T.tx)+'18',display:'flex',alignItems:'center',justifyContent:'center',color:CC[sym]||T.tx,fontWeight:800,fontSize:10}}>{sym.slice(0,3)}</div>
                    <div><div style={{color:CC[sym]||T.tx,fontWeight:800,fontSize:15}}>{sym}{pos.leverage>1&&<Chip c={T.pu}sm>{pos.leverage}x</Chip>}</div><div style={{color:T.mu,fontSize:10}}>{fAge(pos.entryTime)}</div></div>
                    {[['Qty',pos.qty.toFixed(4),''],['Avg',fUSD(pos.avgCost),''],['Now',fUSD(px),''],['P&L',`${pp>=0?'+':''}${fUSD(pp)} (${fPct(ppp)})`,pp>=0?T.g:T.r]].map(([l,v,c])=>(
                      <div key={l}><div style={{color:T.mu,fontSize:8,fontWeight:600,textTransform:'uppercase',marginBottom:2}}>{l}</div><div style={{color:c||T.tx,fontSize:12,fontWeight:700}}>{v}</div></div>
                    ))}
                  </div>;
                })}
              </Panel>;
            })}
            {!bots.some(b=>Object.keys(b.portfolio||{}).length>0)&&(
              <div style={{textAlign:'center',padding:'48px',color:T.mu,fontSize:14}}>
                <div style={{fontSize:32,marginBottom:8}}>📊</div>
                No open positions across any bot.
              </div>
            )}
          </div>
        )}

        {/* MARKET */}
        {tab==='market'&&(
          <div style={{display:'grid',gridTemplateColumns:`repeat(${isMobile?2:4},1fr)`,gap:10}}>
            {Object.entries(prices).sort((a,b)=>Math.abs(b[1]?.change24h||0)-Math.abs(a[1]?.change24h||0)).map(([sym,d])=>{
              if(!d)return null;
              const held=bots.some(b=>b.portfolio?.[sym]);
              const cc=CC[sym]||T.tx,chg=d.change24h||0;
              return<div key={sym}style={{background:T.card,border:`1px solid ${held?cc+'30':T.b}`,borderRadius:10,padding:isMobile?'12px':'15px',transition:'border-color 0.2s'}}>
                {held&&<div style={{float:'right'}}><Chip c={cc}sm>HELD</Chip></div>}
                <div style={{color:cc,fontWeight:800,fontSize:isMobile?14:15,marginBottom:2}}>{sym}</div>
                <div style={{color:T.tx,fontSize:isMobile?15:18,fontWeight:700,marginBottom:2,letterSpacing:'-0.02em'}}>{fUSD(d.price)}</div>
                <div style={{display:'inline-flex',alignItems:'center',gap:4,background:chg>=0?T.gd:T.rd,padding:'2px 8px',borderRadius:20,marginBottom:isMobile?0:8}}>
                  <span style={{color:chg>=0?T.g:T.r,fontSize:11,fontWeight:700}}>{chg>=0?'▲':'▼'} {Math.abs(chg).toFixed(2)}%</span>
                </div>
                {!isMobile&&<div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:4,marginTop:8}}>
                  {[['24H High',fUSD(d.high24h)],['24H Low',fUSD(d.low24h)],['Volume',fUSD(d.volume24h)],['Open',fUSD(d.openPrice)]].map(([l,v])=>(
                    <div key={l}style={{background:'#ffffff04',padding:'5px 7px',borderRadius:6}}>
                      <div style={{color:T.mu,fontSize:7,fontWeight:600,marginBottom:1}}>{l}</div>
                      <div style={{color:T.dim,fontSize:9}}>{v}</div>
                    </div>
                  ))}
                </div>}
              </div>;
            })}
          </div>
        )}

        {/* EXCHANGES */}
        {tab==='exchanges'&&(
          <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 1fr',gap:16}}>
            <Panel title="Connect Exchange">
              {exErr&&<div style={{color:T.r,fontSize:12,marginBottom:12,padding:'9px',background:T.rd,borderRadius:8}}>{exErr}</div>}
              <div style={{display:'flex',flexDirection:'column',gap:12}}>
                <div>
                  <div style={{color:T.mu,fontSize:10,fontWeight:600,textTransform:'uppercase',marginBottom:8}}>Exchange</div>
                  <div style={{display:'flex',gap:6}}>
                    {[['coinbase','Coinbase'],['binance','Binance'],['kraken','Kraken']].map(([id,name])=>(
                      <button key={id}onClick={()=>setExForm(f=>({...f,exchange:id}))}style={{flex:1,background:exForm.exchange===id?(EXC[id]||T.bl)+'18':'transparent',border:`1px solid ${exForm.exchange===id?(EXC[id]||T.bl):T.b}`,borderRadius:8,padding:'8px',cursor:'pointer',color:exForm.exchange===id?(EXC[id]||T.bl):T.mu,fontSize:11,fontWeight:600,fontFamily:'inherit'}}>{name}</button>
                    ))}
                  </div>
                </div>
                <Inp label="API Key" value={exForm.apiKey} onChange={v=>setExForm(f=>({...f,apiKey:v}))} placeholder="Your API key"/>
                <Inp label="API Secret" value={exForm.apiSecret} onChange={v=>setExForm(f=>({...f,apiSecret:v}))} type="password" placeholder="Your API secret"/>
                {exForm.exchange==='coinbase'&&<Inp label="Passphrase (if required)" value={exForm.apiPassphrase} onChange={v=>setExForm(f=>({...f,apiPassphrase:v}))} type="password" placeholder="API passphrase"/>}
                <Inp label="Label (optional)" value={exForm.label} onChange={v=>setExForm(f=>({...f,label:v}))} placeholder="e.g. Main Account"/>
                <div>
                  <div style={{color:T.mu,fontSize:10,fontWeight:600,textTransform:'uppercase',marginBottom:6}}>Mode</div>
                  <div style={{display:'flex',gap:6}}>
                    <Btn onClick={()=>setExForm(f=>({...f,mode:'PAPER'}))}active={exForm.mode==='PAPER'}color={T.bl}size="sm">📄 Paper</Btn>
                    <Btn onClick={()=>setExForm(f=>({...f,mode:'LIVE'}))}active={exForm.mode==='LIVE'}color={T.r}size="sm">🔴 Live</Btn>
                  </div>
                </div>
                <div style={{padding:'9px 12px',background:'#fb923c0a',borderRadius:8,color:'#c2680a',fontSize:11,lineHeight:1.6}}>
                  ⚠ Only grant <strong>Trade + Read</strong> permissions. Never grant withdrawal. Your keys are AES-256 encrypted and never leave the server.
                </div>
                <Btn onClick={connectExchange}disabled={exLoading}variant="solid"color={T.g}full>{exLoading?'Connecting…':'Connect Exchange'}</Btn>
              </div>
            </Panel>

            <div style={{display:'flex',flexDirection:'column',gap:12}}>
              <Panel title={`Connected (${exchanges.length})`}>
                {!exchanges.length&&<div style={{color:T.mu,fontSize:13,padding:'16px 0',textAlign:'center'}}>
                  <div style={{fontSize:28,marginBottom:8}}>🔗</div>
                  <div style={{fontWeight:600,marginBottom:4}}>No exchanges connected</div>
                  <div style={{fontSize:11}}>Connect an exchange to enable live trading on real accounts.</div>
                </div>}
                {exchanges.map(ex=>(
                  <div key={ex.id}style={{background:'#ffffff04',borderRadius:10,padding:'13px',marginBottom:8,border:`1px solid ${EXC[ex.exchange]||T.bl}20`}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
                      <div>
                        <div style={{color:EXC[ex.exchange]||T.tx,fontWeight:700,fontSize:14}}>{EXN[ex.exchange]||ex.exchange}</div>
                        <div style={{color:T.mu,fontSize:10}}>{ex.label||''}{ex.apiKeyMask?` · Key: ${ex.apiKeyMask}`:''}</div>
                      </div>
                      <Chip c={ex.mode==='LIVE'?T.r:T.bl}sm>{ex.mode}</Chip>
                    </div>
                    <div style={{display:'flex',alignItems:'center',gap:6}}>
                      <Chip c={ex.isActive?T.g:T.mu}sm>{ex.isActive?'● Active':'○ Inactive'}</Chip>
                      <span style={{color:T.mu,fontSize:9}}>connected {fAge(ex.connectedAt)}</span>
                      <button onClick={async()=>{if(!confirm('Remove this exchange?'))return;await api.disconnectEx(ex.id);const d=await api.exchanges();setExchanges(d.exchanges||[]);}}style={{marginLeft:'auto',color:T.r,background:'transparent',border:`1px solid ${T.r}30`,borderRadius:6,padding:'3px 10px',cursor:'pointer',fontSize:10,fontFamily:'inherit'}}>Remove</button>
                    </div>
                  </div>
                ))}
              </Panel>

              <Panel title="Exchange Support">
                <div style={{display:'flex',flexDirection:'column',gap:8}}>
                  {[['Coinbase Advanced Trade','Spot + futures via API v3'],['Binance','Spot + perpetuals'],['Kraken','Spot + futures pro'],['More coming','Bybit, OKX, Gate.io']].map(([n,d])=>(
                    <div key={n}style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:`1px solid ${T.b}`}}>
                      <span style={{color:T.tx,fontSize:12,fontWeight:500}}>{n}</span>
                      <span style={{color:T.mu,fontSize:11}}>{d}</span>
                    </div>
                  ))}
                  <div style={{marginTop:4,color:T.mu,fontSize:10,lineHeight:1.6}}>API keys encrypted with AES-256-CBC. Only Trade + Read permissions used. NEXUS never requests withdrawal access.</div>
                </div>
              </Panel>
            </div>
          </div>
        )}

        {/* ANALYTICS */}
        {tab==='analytics'&&!isMobile&&(
          <div style={{display:'flex',flexDirection:'column',gap:14}}>
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:14}}>
              {bots.map(bot=>{
                const sells=bot.trades?.filter(t=>t.type==='SELL')||[];
                const wins=sells.filter(t=>t.pnl>0).length;
                const wr=sells.length?`${((wins/sells.length)*100).toFixed(0)}%`:'—';
                const tv=bot.totalValue||bot.balance||0;
                const pnl=tv-(bot.startingBalance||100);
                const avgWin=wins?sells.filter(t=>t.pnl>0).reduce((s,t)=>s+t.pnl,0)/wins:0;
                const avgLoss=sells.length-wins?sells.filter(t=>t.pnl<=0).reduce((s,t)=>s+t.pnl,0)/(sells.length-wins):0;
                return(
                  <Panel key={bot.id}title={bot.name}right={<Chip c={bot.color||SC[bot.strategy]||T.bl}sm>{bot.strategy}</Chip>}>
                    <div style={{marginBottom:12,padding:'11px',background:'#ffffff04',borderRadius:8}}>
                      <div style={{color:pnl>=0?T.g:T.r,fontSize:20,fontWeight:800,letterSpacing:'-0.02em'}}>{fUSD(tv)}</div>
                      <div style={{color:pnl>=0?T.g:T.r,fontSize:11}}>{pnl>=0?'+':''}{fUSD(pnl)} ({fPct(((tv/(bot.startingBalance||100))-1)*100)})</div>
                    </div>
                    {[['Win Rate',wr,parseInt(wr)>=60?T.g:parseInt(wr)>=45?T.a:T.r],['Trades',sells.length,''],['Avg Win',fUSD(avgWin),T.g],['Avg Loss',fUSD(avgLoss),T.r],['Profit Factor',avgLoss!==0?Math.abs(avgWin/avgLoss).toFixed(2):'—',Math.abs(avgWin/avgLoss||0)>1.5?T.g:T.a],['Fees',fUSD(bot.totalFees||0),''],['Cycles',bot.cycleCount||0,''],['Leverage',bot.leverageEnabled?`${bot.maxLeverage}x`:'Off','']].map(([k,v,c])=>(
                      <div key={k}style={{display:'flex',justifyContent:'space-between',padding:'5px 0',borderBottom:`1px solid ${T.b}`}}>
                        <span style={{color:T.mu,fontSize:11}}>{k}</span>
                        <span style={{color:c||T.tx,fontSize:11,fontWeight:600}}>{v}</span>
                      </div>
                    ))}
                  </Panel>
                );
              })}
            </div>

            {/* Combined P&L chart */}
            {bots.some(b=>(b.trades||[]).filter(t=>t.type==='SELL').length>=2)&&(
              <Panel title="Combined Equity Curves"right="all bots">
                <div style={{height:200}}>
                  <ResponsiveContainer width="100%"height="100%">
                    <LineChart>
                      <XAxis hide/><YAxis domain={['auto','auto']}hide/>
                      <Tooltip contentStyle={{background:T.card2,border:`1px solid ${T.b2}`,borderRadius:8,fontSize:11}}formatter={(v,n)=>[fUSD(v),n]}/>
                      <ReferenceLine y={bots[0]?.startingBalance||100}stroke={T.su}strokeDasharray="4 4"/>
                      {bots.map(bot=>{
                        let v=bot.startingBalance||100;
                        const data=[{i:0,v}];
                        [...(bot.trades||[])].reverse().forEach((t,i)=>{if(t.type==='SELL'&&t.pnl!=null){v+=t.pnl;data.push({i:i+1,v:+v.toFixed(4)});}});
                        if(data.length<2)return null;
                        return<Line key={bot.id}data={data}type="monotone"dataKey="v"stroke={bot.color||SC[bot.strategy]||T.bl}strokeWidth={2}dot={false}name={bot.name}/>;
                      })}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Panel>
            )}
          </div>
        )}
      </div>

      <div style={{padding:'7px 20px',borderTop:`1px solid ${T.b}`,textAlign:'center',color:'#2d4460',fontSize:9}}>
        {runningCount} bot{runningCount!==1?'s':''} running · NEXUS is not a financial adviser · Crypto trading involves substantial risk
      </div>
    </div>
  );
}
