import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';

const C = { bg:'#04060e', green:'#0ff078', red:'#f0365a', text:'#b8d0e8', sub:'#3a5068', card:'#080d1a', border:'#0f1e30' };
const inp = { width:'100%', background:'#04060e', border:'1px solid #0f1e30', borderRadius:6, padding:'10px 12px', color:'#e8f4ff', fontFamily:'inherit', fontSize:14, outline:'none', boxSizing:'border-box' };

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      nav('/dashboard');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight:'100vh', background:C.bg, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:20 }}>
      <Link to="/" style={{ color:C.green, fontWeight:800, fontSize:22, textDecoration:'none', marginBottom:32 }}>NEXUS</Link>
      <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:'40px', width:'100%', maxWidth:400 }}>
        <h1 style={{ color:'#e8f4ff', fontSize:24, fontWeight:800, marginBottom:8 }}>Welcome back</h1>
        <p style={{ color:C.sub, fontSize:14, marginBottom:32 }}>Sign in to your NEXUS account</p>

        {error && <div style={{ background:`${C.red}15`, border:`1px solid ${C.red}33`, borderRadius:6, padding:'10px 14px', color:C.red, fontSize:13, marginBottom:20 }}>{error}</div>}

        <form onSubmit={submit}>
          <div style={{ marginBottom:16 }}>
            <label style={{ color:C.sub, fontSize:11, letterSpacing:'0.1em', display:'block', marginBottom:6 }}>EMAIL ADDRESS</label>
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" required style={inp} />
          </div>
          <div style={{ marginBottom:24 }}>
            <label style={{ color:C.sub, fontSize:11, letterSpacing:'0.1em', display:'block', marginBottom:6 }}>PASSWORD</label>
            <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" required style={inp} />
          </div>
          <button type="submit" disabled={loading} style={{ width:'100%', background:loading?'#0a2818':C.green, color:'#000', border:'none', borderRadius:8, padding:'14px', fontSize:15, fontWeight:800, cursor:loading?'not-allowed':'pointer' }}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p style={{ textAlign:'center', color:C.sub, fontSize:13, marginTop:20 }}>
          No account? <Link to="/register" style={{ color:C.green }}>Start free trial</Link>
        </p>
      </div>
    </div>
  );
}
