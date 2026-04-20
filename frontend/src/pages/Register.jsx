import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';

const C = { bg:'#04060e', green:'#0ff078', red:'#f0365a', text:'#b8d0e8', sub:'#3a5068', card:'#080d1a', border:'#0f1e30' };

export default function Register() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ firstName:'', lastName:'', email:'', password:'', confirm:'' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [agreed, setAgreed] = useState(false);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (form.password !== form.confirm) return setError('Passwords do not match');
    if (form.password.length < 8) return setError('Password must be at least 8 characters');
    if (!agreed) return setError('You must accept the risk disclosure to continue');
    setLoading(true);
    try {
      await register(form.email, form.password, form.firstName, form.lastName);
      nav('/dashboard');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight:'100vh', background:C.bg, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:20 }}>
      <Link to="/" style={{ color:C.green, fontWeight:800, fontSize:22, textDecoration:'none', marginBottom:32 }}>PLEX Trader</Link>

      <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:'40px', width:'100%', maxWidth:460 }}>
        <h1 style={{ color:'#e8f4ff', fontSize:24, fontWeight:800, marginBottom:8 }}>Start Free Trial</h1>
        <p style={{ color:C.sub, fontSize:14, marginBottom:32 }}>14 days free · Then $29.99/mo · Cancel anytime</p>

        {error && <div style={{ background:`${C.red}15`, border:`1px solid ${C.red}33`, borderRadius:6, padding:'10px 14px', color:C.red, fontSize:13, marginBottom:20 }}>{error}</div>}

        <form onSubmit={submit}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
            {[['firstName','First Name'],['lastName','Last Name']].map(([k,l]) => (
              <div key={k}>
                <label style={{ color:C.sub, fontSize:11, letterSpacing:'0.1em', display:'block', marginBottom:6 }}>{l.toUpperCase()}</label>
                <input value={form[k]} onChange={set(k)} placeholder={l} style={inp} />
              </div>
            ))}
          </div>
          {[['email','Email Address','email'],['password','Password','password'],['confirm','Confirm Password','password']].map(([k,l,t]) => (
            <div key={k} style={{ marginBottom:12 }}>
              <label style={{ color:C.sub, fontSize:11, letterSpacing:'0.1em', display:'block', marginBottom:6 }}>{l.toUpperCase()}</label>
              <input type={t} value={form[k]} onChange={set(k)} placeholder={l} required style={inp} />
            </div>
          ))}

          {/* Risk Disclosure Checkbox */}
          <div style={{ background:`#f0365a10`, border:`1px solid #f0365a30`, borderRadius:8, padding:'14px', marginBottom:20, marginTop:8 }}>
            <p style={{ color:'#d4a0a0', fontSize:12, lineHeight:1.7, marginBottom:12 }}>
              <strong style={{ color:C.red }}>⚠ Risk Disclosure:</strong> Cryptocurrency trading involves substantial risk of financial loss. PLEX Trader is an automated tool, not a licensed financial adviser. You may lose some or all of your capital. Only invest what you can afford to lose. Past results do not guarantee future performance. PLEX Automation and its operators are not responsible for any trading losses.
            </p>
            <label style={{ display:'flex', alignItems:'flex-start', gap:10, cursor:'pointer' }}>
              <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} style={{ marginTop:2, accentColor:C.green }} />
              <span style={{ color:C.text, fontSize:13 }}>I have read and understand the risk disclosure. I agree to the <Link to="/terms" style={{ color:'#2f8ef5' }}>Terms of Service</Link> and <Link to="/privacy" style={{ color:'#2f8ef5' }}>Privacy Policy</Link>.</span>
            </label>
          </div>

          <button type="submit" disabled={loading} style={{ width:'100%', background:loading?'#0a2818':C.green, color:'#000', border:'none', borderRadius:8, padding:'14px', fontSize:15, fontWeight:800, cursor:loading?'not-allowed':'pointer' }}>
            {loading ? 'Creating Account...' : 'Create Account & Start Trial'}
          </button>
        </form>

        <p style={{ textAlign:'center', color:C.sub, fontSize:13, marginTop:20 }}>
          Already have an account? <Link to="/login" style={{ color:C.green }}>Sign in</Link>
        </p>
      </div>
    </div>
  );
}

const inp = { width:'100%', background:'#04060e', border:'1px solid #0f1e30', borderRadius:6, padding:'10px 12px', color:'#e8f4ff', fontFamily:'inherit', fontSize:14, outline:'none', boxSizing:'border-box' };
