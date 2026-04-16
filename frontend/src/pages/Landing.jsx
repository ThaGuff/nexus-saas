import { Link } from 'react-router-dom';

const C = { bg:'#04060e', green:'#0ff078', red:'#f0365a', amber:'#f5a020', blue:'#2f8ef5', text:'#b8d0e8', sub:'#3a5068', card:'#080d1a', border:'#0f1e30' };

const DISCLAIMER = `RISK DISCLOSURE: Cryptocurrency trading involves substantial risk of financial loss. Past performance does not guarantee future results. NEXUS is an automated trading tool, not a financial adviser. You may lose some or all of your invested capital. Never invest money you cannot afford to lose completely. By using NEXUS, you acknowledge that you understand and accept these risks. NEXUS and its operators are not responsible for any trading losses incurred.`;

function Stat({ value, label }) {
  return (
    <div style={{ textAlign:'center' }}>
      <div style={{ fontSize:36, fontWeight:800, color:C.green, fontFamily:'IBM Plex Mono' }}>{value}</div>
      <div style={{ color:C.sub, fontSize:13, marginTop:4 }}>{label}</div>
    </div>
  );
}

function Feature({ icon, title, desc }) {
  return (
    <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:'24px' }}>
      <div style={{ fontSize:32, marginBottom:12 }}>{icon}</div>
      <div style={{ color:'#e8f4ff', fontSize:17, fontWeight:700, marginBottom:8 }}>{title}</div>
      <div style={{ color:C.sub, fontSize:14, lineHeight:1.7 }}>{desc}</div>
    </div>
  );
}

export default function Landing() {
  return (
    <div style={{ minHeight:'100vh', background:C.bg }}>

      {/* ── NAV ──────────────────────────────────────────────────────────── */}
      <nav style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'20px 5%', borderBottom:`1px solid ${C.border}`, position:'sticky', top:0, background:C.bg+'ee', backdropFilter:'blur(10px)', zIndex:100 }}>
        <div style={{ color:C.green, fontSize:22, fontWeight:800, letterSpacing:'0.06em' }}>NEXUS</div>
        <div style={{ display:'flex', gap:12 }}>
          <Link to="/login" style={{ color:C.text, textDecoration:'none', padding:'8px 20px', borderRadius:6, border:`1px solid ${C.border}`, fontSize:14 }}>Log In</Link>
          <Link to="/register" style={{ color:'#000', background:C.green, textDecoration:'none', padding:'8px 20px', borderRadius:6, fontSize:14, fontWeight:700 }}>Start Free Trial</Link>
        </div>
      </nav>

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section style={{ textAlign:'center', padding:'100px 5% 80px', maxWidth:900, margin:'0 auto' }}>
        <div style={{ display:'inline-block', background:`${C.green}15`, border:`1px solid ${C.green}33`, borderRadius:20, padding:'6px 16px', color:C.green, fontSize:12, fontWeight:700, letterSpacing:'0.1em', marginBottom:24 }}>
          AI-POWERED · 24/7 · FULLY AUTONOMOUS
        </div>
        <h1 style={{ fontSize:'clamp(36px,6vw,72px)', fontWeight:800, lineHeight:1.1, color:'#e8f4ff', marginBottom:24 }}>
          Your Money Works<br />
          <span style={{ color:C.green }}>While You Sleep.</span>
        </h1>
        <p style={{ fontSize:18, color:C.sub, lineHeight:1.8, maxWidth:600, margin:'0 auto 40px' }}>
          NEXUS is an autonomous AI trading bot that analyzes real-time crypto markets, executes high-conviction trades, and manages risk — completely hands-free.
        </p>
        <div style={{ display:'flex', gap:12, justifyContent:'center', flexWrap:'wrap' }}>
          <Link to="/register" style={{ background:C.green, color:'#000', textDecoration:'none', padding:'16px 36px', borderRadius:8, fontSize:16, fontWeight:800, display:'inline-block' }}>
            Start 14-Day Free Trial
          </Link>
          <Link to="/login" style={{ color:C.text, textDecoration:'none', padding:'16px 36px', borderRadius:8, fontSize:16, border:`1px solid ${C.border}`, display:'inline-block' }}>
            Sign In
          </Link>
        </div>
        <p style={{ color:C.sub, fontSize:12, marginTop:16 }}>14-day free trial · Then $29.99/mo · Cancel anytime</p>
      </section>

      {/* ── RISK BANNER ──────────────────────────────────────────────────── */}
      <div style={{ background:`${C.red}10`, border:`1px solid ${C.red}30`, borderRadius:8, margin:'0 5% 60px', padding:'16px 24px' }}>
        <div style={{ color:C.red, fontSize:11, fontWeight:700, letterSpacing:'0.1em', marginBottom:6 }}>⚠ IMPORTANT RISK DISCLOSURE</div>
        <p style={{ color:'#d4a0a0', fontSize:12, lineHeight:1.7 }}>{DISCLAIMER}</p>
      </div>

      {/* ── STATS ────────────────────────────────────────────────────────── */}
      <section style={{ background:C.card, borderTop:`1px solid ${C.border}`, borderBottom:`1px solid ${C.border}`, padding:'60px 5%' }}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:40, maxWidth:900, margin:'0 auto' }}>
          <Stat value="8" label="Cryptocurrencies tracked" />
          <Stat value="24/7" label="Market monitoring" />
          <Stat value="7+" label="Signals required to buy" />
          <Stat value="0.6%" label="Realistic fee modeling" />
        </div>
      </section>

      {/* ── FEATURES ─────────────────────────────────────────────────────── */}
      <section style={{ padding:'80px 5%', maxWidth:1100, margin:'0 auto' }}>
        <h2 style={{ textAlign:'center', fontSize:'clamp(24px,4vw,40px)', fontWeight:800, color:'#e8f4ff', marginBottom:16 }}>
          Built for the Fire-and-Forget Investor
        </h2>
        <p style={{ textAlign:'center', color:C.sub, fontSize:16, marginBottom:60 }}>
          Professional-grade strategies. No experience required.
        </p>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))', gap:20 }}>
          <Feature icon="🧠" title="AI-Powered Decisions" desc="Gemini AI analyzes RSI, MACD, Bollinger Bands, EMA crossovers, and volume patterns before every trade. Requires 7+ confirming signals before entering." />
          <Feature icon="🛡️" title="Multi-Layer Risk Management" desc="Adaptive stop-losses, take-profit targets, max drawdown protection, and Kelly Criterion position sizing keep your capital protected." />
          <Feature icon="📊" title="Real-Time Dashboard" desc="Watch every trade, signal, and AI reasoning in real time. Full trade history, equity curve, and performance analytics." />
          <Feature icon="🔗" title="Exchange Integration" desc="Connect Coinbase Advanced Trade, Binance, or Crypto.com using your own API keys. You maintain full control of your funds." />
          <Feature icon="⚡" title="Leverage Support" desc="Optional perpetual futures with configurable leverage. Only activated on high-confidence setups (confidence 8/10+)." />
          <Feature icon="🔄" title="Paper Trading Mode" desc="Test with simulated funds before going live. Build confidence in the strategy with zero financial risk." />
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────────────────── */}
      <section style={{ background:C.card, borderTop:`1px solid ${C.border}`, borderBottom:`1px solid ${C.border}`, padding:'80px 5%' }}>
        <h2 style={{ textAlign:'center', fontSize:'clamp(24px,4vw,40px)', fontWeight:800, color:'#e8f4ff', marginBottom:60 }}>How It Works</h2>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:40, maxWidth:900, margin:'0 auto' }}>
          {[
            { n:'01', title:'Create Account', desc:'Sign up and start your 14-day free trial. No credit card required to begin.' },
            { n:'02', title:'Connect Exchange', desc:'Link your Coinbase, Binance, or Crypto.com account using read/trade API keys.' },
            { n:'03', title:'Configure Bot', desc:'Set your starting capital, risk tolerance, and trade limits. Or use our defaults.' },
            { n:'04', title:'Start & Forget', desc:'Hit start. NEXUS monitors markets 24/7 and executes trades automatically.' },
          ].map(s => (
            <div key={s.n} style={{ textAlign:'center' }}>
              <div style={{ fontSize:40, fontWeight:800, color:C.green, fontFamily:'IBM Plex Mono', opacity:0.4, marginBottom:12 }}>{s.n}</div>
              <div style={{ color:'#e8f4ff', fontSize:17, fontWeight:700, marginBottom:8 }}>{s.title}</div>
              <div style={{ color:C.sub, fontSize:14, lineHeight:1.7 }}>{s.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── PRICING ──────────────────────────────────────────────────────── */}
      <section style={{ padding:'80px 5%', maxWidth:500, margin:'0 auto', textAlign:'center' }}>
        <h2 style={{ fontSize:'clamp(24px,4vw,40px)', fontWeight:800, color:'#e8f4ff', marginBottom:16 }}>Simple Pricing</h2>
        <p style={{ color:C.sub, fontSize:16, marginBottom:40 }}>One plan. Everything included.</p>
        <div style={{ background:C.card, border:`2px solid ${C.green}44`, borderRadius:16, padding:'40px', position:'relative' }}>
          <div style={{ position:'absolute', top:-14, left:'50%', transform:'translateX(-50%)', background:C.green, color:'#000', padding:'4px 16px', borderRadius:20, fontSize:12, fontWeight:800 }}>14 DAYS FREE</div>
          <div style={{ fontSize:56, fontWeight:800, color:'#e8f4ff', fontFamily:'IBM Plex Mono' }}>$29<span style={{ fontSize:24, color:C.sub }}>.99</span></div>
          <div style={{ color:C.sub, marginBottom:32 }}>per month after trial</div>
          {[
            'Unlimited paper trading',
            'Live trading (your exchange API)',
            'AI-powered trade decisions',
            'Real-time dashboard',
            'All 8 cryptocurrencies',
            'Leverage/perpetuals support',
            'Cancel anytime',
          ].map(f => (
            <div key={f} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12, textAlign:'left' }}>
              <span style={{ color:C.green, fontSize:18 }}>✓</span>
              <span style={{ color:C.text, fontSize:15 }}>{f}</span>
            </div>
          ))}
          <Link to="/register" style={{ display:'block', background:C.green, color:'#000', textDecoration:'none', padding:'16px', borderRadius:8, fontSize:16, fontWeight:800, marginTop:32 }}>
            Start Free Trial
          </Link>
        </div>
      </section>

      {/* ── DISCLAIMER SECTION ───────────────────────────────────────────── */}
      <section style={{ background:C.card, borderTop:`1px solid ${C.border}`, padding:'60px 5%' }}>
        <div style={{ maxWidth:800, margin:'0 auto' }}>
          <h3 style={{ color:C.red, fontSize:16, fontWeight:700, marginBottom:16 }}>Risk Disclosure & Legal Notice</h3>
          <p style={{ color:'#7a9ab8', fontSize:13, lineHeight:1.9, marginBottom:16 }}>
            Cryptocurrency trading and investing involves significant risk of financial loss. The value of cryptocurrencies can decrease substantially in short periods. NEXUS is an automated software tool that executes trades based on algorithmic signals — it is <strong>not a licensed financial adviser, broker, or investment manager</strong>.
          </p>
          <p style={{ color:'#7a9ab8', fontSize:13, lineHeight:1.9, marginBottom:16 }}>
            Past performance of any trading strategy, backtest result, or live trading result does not guarantee future performance. You may lose your entire invested capital. Only trade with funds you can afford to lose completely.
          </p>
          <p style={{ color:'#7a9ab8', fontSize:13, lineHeight:1.9 }}>
            NEXUS and its operators assume no responsibility for financial losses incurred while using this service. By creating an account, you confirm that you have read and understood this risk disclosure and agree to our <Link to="/terms" style={{ color:C.blue }}>Terms of Service</Link> and <Link to="/privacy" style={{ color:C.blue }}>Privacy Policy</Link>.
          </p>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────────────────── */}
      <footer style={{ borderTop:`1px solid ${C.border}`, padding:'32px 5%', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:16 }}>
        <div style={{ color:C.green, fontWeight:800, fontSize:16 }}>NEXUS</div>
        <div style={{ display:'flex', gap:24 }}>
          <Link to="/privacy" style={{ color:C.sub, textDecoration:'none', fontSize:13 }}>Privacy Policy</Link>
          <Link to="/terms"   style={{ color:C.sub, textDecoration:'none', fontSize:13 }}>Terms of Service</Link>
          <Link to="/login"   style={{ color:C.sub, textDecoration:'none', fontSize:13 }}>Login</Link>
        </div>
        <div style={{ color:C.sub, fontSize:12 }}>© 2026 NEXUS. All rights reserved. Not financial advice.</div>
      </footer>
    </div>
  );
}
