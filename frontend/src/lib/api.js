const BASE = '/api';
function getToken() { return localStorage.getItem('nexus_token'); }
export function setToken(t) { localStorage.setItem('nexus_token', t); }
export function clearToken() { localStorage.removeItem('nexus_token'); }

async function req(method, path, body) {
  const headers = { 'Content-Type':'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export const api = {
  register:       b => req('POST', '/auth/register', b),
  login:          b => req('POST', '/auth/login', b),
  me:             ()=> req('GET',  '/auth/me'),
  botState:       ()=> req('GET',  '/bot/state'),
  botStart:       ()=> req('POST', '/bot/start'),
  botStop:        ()=> req('POST', '/bot/stop'),
  botReset:       ()=> req('POST', '/bot/reset'),
  botSettings:    b => req('PUT',  '/bot/settings', b),
  strategies:     ()=> req('GET',  '/bot/strategies'),
  exchanges:      ()=> req('GET',  '/exchanges'),
  connectEx:      b => req('POST', '/exchanges/connect', b),
  disconnectEx:   ex=> req('DELETE',`/exchanges/${ex}`),
  billingStatus:  ()=> req('GET',  '/billing/status'),
  billingCheckout:()=> req('POST', '/billing/checkout'),
  billingPortal:  ()=> req('POST', '/billing/portal'),
};
