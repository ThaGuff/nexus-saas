const BASE = '/api';
const token = () => localStorage.getItem('nexus_token');
export const setToken = t => localStorage.setItem('nexus_token', t);
export const clearToken = () => localStorage.removeItem('nexus_token');

async function req(method, path, body) {
  const h = { 'Content-Type': 'application/json' };
  const t = token();
  if (t) h['Authorization'] = `Bearer ${t}`;
  const r = await fetch(`${BASE}${path}`, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
  return d;
}

export const api = {
  // Auth
  register: b => req('POST', '/auth/register', b),
  login:    b => req('POST', '/auth/login', b),
  me:       () => req('GET', '/auth/me'),

  // Bots
  getBots:    () => req('GET', '/bot/bots'),
  createBot:  b  => req('POST', '/bot/bots', b),
  updateBot:  (id, b) => req('PATCH', `/bot/bots/${id}`, b),
  deleteBot:  id => req('DELETE', `/bot/bots/${id}`),
  startBot:   id => req('POST', `/bot/bots/${id}/start`),
  stopBot:    id => req('POST', `/bot/bots/${id}/stop`),
  resetBot:   id => req('POST', `/bot/bots/${id}/reset`),
  botSettings: b => req('PUT', '/bot/settings', b),
  strategies:  () => req('GET', '/bot/strategies'),

  // Exchanges
  exchanges:   () => req('GET', '/exchanges'),
  connectEx:   b  => req('POST', '/exchanges/connect', b),
  disconnectEx:id => req('DELETE', `/exchanges/${id}`),

  // Market
  news:       () => req('GET', '/market/news'),
  fearGreed:  () => req('GET', '/market/fear-greed'),
  globalMkt:  () => req('GET', '/market/global'),
  learning:   (botId, strategy) => req('GET', `/market/learning/${botId}?strategy=${strategy}`),

  // AI assistant
  aiChat:     msg => req('POST', '/ai/chat', { message: msg }),
  aiClear:    () => req('DELETE', '/ai/chat'),

  // Manual trading
  manualTrade: b => req('POST', '/manual/trade', b),
  watchlist:   () => req('GET', '/manual/watchlist'),
  saveWatchlist: s => req('POST', '/manual/watchlist', { symbols: s }),

  // Custom strategies
  customStrategies: () => req('GET', '/custom'),
  createCustom:  b  => req('POST', '/custom', b),
  deleteCustom:  id => req('DELETE', `/custom/${id}`),
  strategySchema: () => req('GET', '/custom/schema'),

  // Plans
  plans:          () => req('GET', '/plans'),
  billingStatus:  () => req('GET', '/billing/status'),
  billingCheckout: plan => req('POST', '/billing/checkout', { plan }),
  billingPortal:  () => req('POST', '/billing/portal'),
};
