// ── API Client ────────────────────────────────────────────────────────────────
const BASE = '/api';

function getToken() { return localStorage.getItem('nexus_token'); }
export function setToken(t) { localStorage.setItem('nexus_token', t); }
export function clearToken() { localStorage.removeItem('nexus_token'); }

async function request(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export const api = {
  // Auth
  register:    (body) => request('POST', '/auth/register', body),
  login:       (body) => request('POST', '/auth/login', body),
  me:          ()     => request('GET',  '/auth/me'),
  profile:     (body) => request('PUT',  '/auth/profile', body),

  // Bot
  botState:    ()     => request('GET',  '/bot/state'),
  botStart:    ()     => request('POST', '/bot/start'),
  botStop:     ()     => request('POST', '/bot/stop'),
  botReset:    ()     => request('POST', '/bot/reset'),
  botSettings: (body) => request('PUT',  '/bot/settings', body),

  // Exchanges
  exchanges:   ()               => request('GET',    '/exchanges'),
  connectEx:   (body)           => request('POST',   '/exchanges/connect', body),
  disconnectEx:(exchange)       => request('DELETE', `/exchanges/${exchange}`),

  // Billing
  billingStatus:   ()   => request('GET',  '/billing/status'),
  billingCheckout: ()   => request('POST', '/billing/checkout'),
  billingPortal:   ()   => request('POST', '/billing/portal'),
};
