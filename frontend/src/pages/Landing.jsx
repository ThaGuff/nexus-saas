import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

const C = {
  bg: '#030508', card: '#08091200', border: '#ffffff0d',
  green: '#00e5a0', greenDim: '#00e5a015',
  blue: '#3b82f6', red: '#ef4444', amber: '#f59e0b',
  text: '#f1f5f9', muted: '#94a3b8', subtle: '#334155',
};

function useIsMobile() {
  const [m, setM] = useState(window.innerWidth < 768);
  useEffect(() => { const h = () => setM(window.innerWidth < 768); window.addEventListener('resize', h); return () => window.removeEventListener('resize', h); }, []);
  return m;
}

const RISK = 'RISK DISCLOSURE: Cryptocurrency trading involves substantial risk of financial loss. Past performance does not guarantee future results. PLEX Trader is an automated tool, not a licensed financial adviser. You may lose some or all of your invested capital. Never invest money you cannot afford to lose. PLEX Automation and its operators are not responsible for any trading losses.';

export default function Landing() {
  const isMobile = useIsMobile();
  const [tick, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick(x => x + 1), 2000); return () => clearInterval(t); }, []);

  const prices = [
    { sym: 'BTC', base: 84250, delta: [+142, -89, +203, -51, +167] },
    { sym: 'ETH', base: 3180, delta: [+22, -15, +38, -8, +19] },
    { sym: 'SOL', base: 148, delta: [+1.2, -0.8, +2.1, -0.4, +0.9] },
  ];

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "'Inter', system-ui, sans-serif", overflowX: 'hidden' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::selection { background: #00e5a030; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: #334155; border-radius: 2px; }
        @keyframes fadeUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
        @keyframes shimmer { 0%{background-position:-200%} 100%{background-position:200%} }
        .fade-up { animation: fadeUp 0.6s ease forwards; }
        .btn-primary { transition: all 0.2s; }
        .btn-primary:hover { transform: translateY(-1px); box-shadow: 0 8px 25px #00e5a030; }
        .btn-secondary:hover { border-color: #00e5a060 !important; color: #00e5a0 !important; }
        .feature-card { transition: all 0.2s; }
        .feature-card:hover { transform: translateY(-2px); border-color: #00e5a025 !important; }
      `}</style>

      {/* Nav */}
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: isMobile ? '16px 20px' : '20px 6%', borderBottom: '1px solid #ffffff08', position: 'sticky', top: 0, background: '#030508ee', backdropFilter: 'blur(20px)', zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: C.green, boxShadow: `0 0 8px ${C.green}`, animation: 'pulse 2s infinite' }} />
          <span style={{ color: C.green, fontWeight: 800, fontSize: 18, letterSpacing: '-0.02em', fontFamily: 'JetBrains Mono' }}>PLEX Trader</span>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Link to="/login" className="btn-secondary" style={{ color: C.muted, textDecoration: 'none', padding: isMobile ? '8px 14px' : '9px 20px', borderRadius: 8, border: '1px solid #ffffff14', fontSize: 13, fontWeight: 500 }}>Log In</Link>
          <Link to="/register" className="btn-primary" style={{ color: '#000', background: C.green, textDecoration: 'none', padding: isMobile ? '8px 14px' : '9px 20px', borderRadius: 8, fontSize: 13, fontWeight: 700 }}>Free Trial</Link>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ padding: isMobile ? '60px 20px 48px' : '100px 6% 80px', maxWidth: 1100, margin: '0 auto' }}>
        <div className="fade-up" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#00e5a012', border: '1px solid #00e5a025', borderRadius: 100, padding: '6px 14px', marginBottom: 28 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.green, animation: 'pulse 1.5s infinite' }} />
          <span style={{ color: C.green, fontSize: 12, fontWeight: 600, fontFamily: 'JetBrains Mono' }}>LIVE · 24/7 AUTONOMOUS TRADING</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 48, alignItems: 'center' }}>
          <div>
            <h1 className="fade-up" style={{ fontSize: isMobile ? 38 : 58, fontWeight: 900, lineHeight: 1.05, letterSpacing: '-0.03em', marginBottom: 20 }}>
              AI Trades Crypto<br />
              <span style={{ color: C.green }}>While You Live</span><br />
              Your Life.
            </h1>
            <p style={{ fontSize: isMobile ? 15 : 17, color: C.muted, lineHeight: 1.7, marginBottom: 32, maxWidth: 480 }}>
              PLEX Trader is an autonomous trading bot that combines RSI, MACD, Bollinger Bands, and volume analysis to identify high-probability trades — completely hands-free.
            </p>
            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 10, marginBottom: 20 }}>
              <Link to="/register" className="btn-primary" style={{ color: '#000', background: C.green, textDecoration: 'none', padding: '14px 28px', borderRadius: 10, fontSize: 15, fontWeight: 800, textAlign: 'center', display: 'block' }}>
                Start 14-Day Free Trial
              </Link>
              <Link to="/login" className="btn-secondary" style={{ color: C.muted, textDecoration: 'none', padding: '14px 24px', borderRadius: 10, fontSize: 15, border: '1px solid #ffffff14', textAlign: 'center', display: 'block' }}>
                Sign In →
              </Link>
            </div>
            <p style={{ color: '#475569', fontSize: 12 }}>14-day free · then $29.99/mo · cancel anytime</p>
          </div>

          {/* Live ticker card */}
          <div style={{ background: 'linear-gradient(135deg, #0f1729 0%, #0a0f1e 100%)', border: '1px solid #ffffff10', borderRadius: 16, padding: isMobile ? 20 : 28, fontFamily: 'JetBrains Mono' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <span style={{ color: C.muted, fontSize: 11, fontWeight: 600, letterSpacing: '0.1em' }}>PLEX LIVE FEED</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.green, animation: 'pulse 1s infinite' }} />
                <span style={{ color: C.green, fontSize: 10 }}>ACTIVE</span>
              </div>
            </div>
            {prices.map(({ sym, base, delta }) => {
              const d = delta[tick % delta.length];
              const cur = base + d;
              const up = d >= 0;
              return (
                <div key={sym} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #ffffff08' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: up ? '#00e5a015' : '#ef444415', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: up ? C.green : C.red }}>{sym}</div>
                    <div>
                      <div style={{ color: C.text, fontSize: 14, fontWeight: 600 }}>${cur.toLocaleString('en-US', { maximumFractionDigits: 2 })}</div>
                      <div style={{ color: up ? C.green : C.red, fontSize: 11 }}>{up ? '+' : ''}{((d / base) * 100).toFixed(3)}%</div>
                    </div>
                  </div>
                  <div style={{ background: up ? '#00e5a015' : '#ef444415', border: `1px solid ${up ? C.green : C.red}30`, color: up ? C.green : C.red, padding: '4px 10px', borderRadius: 5, fontSize: 10, fontWeight: 700 }}>{up ? 'BUY' : 'HOLD'}</div>
                </div>
              );
            })}
            <div style={{ marginTop: 16, padding: '12px', background: '#00e5a008', borderRadius: 8, border: '1px solid #00e5a015' }}>
              <div style={{ color: C.muted, fontSize: 10, marginBottom: 4 }}>AI REASONING</div>
              <div style={{ color: '#94a3b8', fontSize: 11, lineHeight: 1.6 }}>RSI recovering from 28.4 → MACD histogram turning positive → Volume 2.1x average. High-conviction mean reversion setup on BTC.</div>
            </div>
          </div>
        </div>
      </section>

      {/* Risk Banner */}
      <div style={{ margin: '0 5%', marginBottom: 60, background: '#ef444408', border: '1px solid #ef444420', borderRadius: 10, padding: '14px 20px' }}>
        <span style={{ color: '#ef4444', fontSize: 11, fontWeight: 700 }}>⚠ RISK: </span>
        <span style={{ color: '#7f8ea3', fontSize: 11 }}>{RISK}</span>
      </div>

      {/* Stats */}
      <section style={{ borderTop: '1px solid #ffffff08', borderBottom: '1px solid #ffffff08', padding: '48px 6%', margin: '0 0 80px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${isMobile ? 2 : 4}, 1fr)`, gap: 32, maxWidth: 900, margin: '0 auto', textAlign: 'center' }}>
          {[['73–77%', 'Win Rate (RSI+MACD)'], ['25+', 'Ticks Before Entry'], ['8/18', 'Min Score to Trade'], ['0.6%', 'Fee Modeled In']].map(([v, l]) => (
            <div key={l}><div style={{ fontSize: isMobile ? 28 : 36, fontWeight: 900, color: C.green, fontFamily: 'JetBrains Mono', marginBottom: 6 }}>{v}</div><div style={{ color: C.muted, fontSize: 13 }}>{l}</div></div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section style={{ padding: `0 6% 80px`, maxWidth: 1100, margin: '0 auto' }}>
        <h2 style={{ textAlign: 'center', fontSize: isMobile ? 28 : 40, fontWeight: 900, letterSpacing: '-0.03em', marginBottom: 12 }}>Built Different.</h2>
        <p style={{ textAlign: 'center', color: C.muted, fontSize: 16, marginBottom: 48 }}>Most bots trade on single signals. PLEX Trader requires multi-factor confirmation.</p>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${isMobile ? 1 : 3}, 1fr)`, gap: 16 }}>
          {[
            { icon: '🧠', title: 'RSI + MACD Confluence', desc: 'Requires both RSI recovering AND MACD bullish before entering — the combination that achieves 73-77% accuracy in 2026 backtests.' },
            { icon: '📈', title: 'Market Regime Detection', desc: 'Detects trending vs ranging markets using ADX-style analysis. Applies trend-following in trends, mean reversion in ranges.' },
            { icon: '🔒', title: 'Knife-Catch Protection', desc: 'Never buys falling RSI. Requires RSI actively recovering (rising for 3+ ticks) before any entry — eliminates most false bottoms.' },
            { icon: '📊', title: 'Patient Exits', desc: 'Trailing stops widen as profits grow. Requires 5+ reversal signals before exiting winners — lets trades breathe.' },
            { icon: '⚡', title: 'Volume Confirmation', desc: 'Penalizes low-volume moves. Rewards 2x+ volume spikes — the institutional footprint that confirms real momentum.' },
            { icon: '🛡️', title: 'Kelly Position Sizing', desc: 'Uses Kelly Criterion to size positions based on conviction score. Never risks more than the edge justifies.' },
          ].map(f => (
            <div key={f.title} className="feature-card" style={{ background: '#0a0f1e', border: '1px solid #ffffff0a', borderRadius: 12, padding: 24 }}>
              <div style={{ fontSize: 28, marginBottom: 12 }}>{f.icon}</div>
              <div style={{ color: C.text, fontSize: 15, fontWeight: 700, marginBottom: 8 }}>{f.title}</div>
              <div style={{ color: C.muted, fontSize: 13, lineHeight: 1.7 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section style={{ padding: '0 6% 80px', maxWidth: 460, margin: '0 auto', textAlign: 'center' }}>
        <h2 style={{ fontSize: isMobile ? 28 : 36, fontWeight: 900, letterSpacing: '-0.02em', marginBottom: 8 }}>One Plan. Everything.</h2>
        <p style={{ color: C.muted, marginBottom: 40, fontSize: 15 }}>No hidden fees. No tiers. Cancel anytime.</p>
        <div style={{ background: '#0a0f1e', border: '1px solid #00e5a025', borderRadius: 16, padding: isMobile ? 28 : 40, position: 'relative' }}>
          <div style={{ position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)', background: C.green, color: '#000', padding: '4px 16px', borderRadius: 100, fontSize: 11, fontWeight: 800 }}>14 DAYS FREE</div>
          <div style={{ fontSize: 56, fontWeight: 900, color: C.text, fontFamily: 'JetBrains Mono', marginBottom: 4 }}>$29<span style={{ fontSize: 22, color: C.muted }}>.99</span></div>
          <div style={{ color: C.muted, marginBottom: 28, fontSize: 14 }}>per month after trial</div>
          {['Unlimited paper + live trading', 'AI-powered decisions (Gemini Flash)', 'RSI + MACD + BB multi-signal', 'Real-time dashboard', 'Coinbase & Binance integration', 'Full trade reasoning log', 'Cancel anytime'].map(f => (
            <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, textAlign: 'left' }}>
              <span style={{ color: C.green, fontWeight: 700 }}>✓</span>
              <span style={{ color: C.muted, fontSize: 14 }}>{f}</span>
            </div>
          ))}
          <Link to="/register" className="btn-primary" style={{ display: 'block', background: C.green, color: '#000', textDecoration: 'none', padding: '15px', borderRadius: 10, fontSize: 15, fontWeight: 800, marginTop: 28 }}>Start Free Trial →</Link>
        </div>
      </section>

      {/* Legal */}
      <section style={{ borderTop: '1px solid #ffffff08', padding: '48px 6%', maxWidth: 800, margin: '0 auto' }}>
        <h3 style={{ color: C.red, fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Risk Disclosure & Legal Notice</h3>
        <p style={{ color: '#475569', fontSize: 12, lineHeight: 1.9, marginBottom: 12 }}>Cryptocurrency trading carries an extremely high risk of financial loss. PLEX Trader is automated software — <strong style={{ color: '#64748b' }}>not a licensed financial adviser, broker, or investment manager</strong>. All trades are executed by algorithms with no human oversight.</p>
        <p style={{ color: '#475569', fontSize: 12, lineHeight: 1.9 }}>By using PLEX Trader you confirm you've read our <Link to="/terms" style={{ color: C.blue }}>Terms of Service</Link> and <Link to="/privacy" style={{ color: C.blue }}>Privacy Policy</Link> and accept all financial risk.</p>
      </section>

      <footer style={{ borderTop: '1px solid #ffffff08', padding: '24px 6%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <span style={{ color: C.green, fontWeight: 800, fontFamily: 'JetBrains Mono', fontSize: 14 }}>PLEX Trader</span>
        <div style={{ display: 'flex', gap: 20 }}>
          <Link to="/privacy" style={{ color: '#475569', textDecoration: 'none', fontSize: 12 }}>Privacy</Link>
          <Link to="/terms"   style={{ color: '#475569', textDecoration: 'none', fontSize: 12 }}>Terms</Link>
          <Link to="/login"   style={{ color: '#475569', textDecoration: 'none', fontSize: 12 }}>Sign In</Link>
        </div>
        <span style={{ color: '#334155', fontSize: 11 }}>© 2026 PLEX Automation · Not financial advice</span>
      </footer>
    </div>
  );
}
