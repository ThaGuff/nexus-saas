/**
 * PLEX TRADER · Market data + news — v2
 * 
 * News sources (in priority order):
 * 1. CryptoCompare — FREE, no key needed, always works, updated every ~5min
 * 2. CryptoPanic   — if CRYPTOPANIC_KEY is set in env
 * 3. CoinGecko     — fallback
 * 
 * Cache TTLs: news 8min, fear&greed 15min, global 5min
 */
import express from 'express';
import axios   from 'axios';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

const cache = {
  news:      { data: [], ts: 0, ttl: 8 * 60 * 1000, isFallback: false },
  fearGreed: { data: null, ts: 0, ttl: 15 * 60 * 1000 },
  global:    { data: null, ts: 0, ttl:  5 * 60 * 1000 },
};

function isCacheFresh(bucket) {
  const c = cache[bucket];
  if (c.isFallback) return false; // always retry if serving fallback
  return Date.now() - c.ts < c.ttl && (Array.isArray(c.data) ? c.data.length > 0 : !!c.data);
}

// ── Source 1: CryptoCompare — FREE, no key, most reliable ────────────────────
async function fetchCryptoCompare() {
  const r = await axios.get('https://min-api.cryptocompare.com/data/v2/news/', {
    params: { lang: 'EN', sortOrder: 'latest', extraParams: 'PLEX_Trader' },
    timeout: 8000,
    headers: { 'User-Agent': 'PLEX-Trader/1.0' },
  });
  const items = r.data?.Data || [];
  return items.slice(0, 20).map(a => ({
    id:        `cc-${a.id}`,
    title:     a.title,
    url:       a.url,
    source:    a.source_info?.name || a.source || 'CryptoCompare',
    published: new Date(a.published_on * 1000).toISOString(),
    coins:     (a.categories || '').split('|').filter(Boolean).slice(0, 4),
    sentiment: a.tags?.toLowerCase().includes('bearish') ? 'bearish'
              : a.tags?.toLowerCase().includes('bullish') ? 'bullish' : 'neutral',
    image:     a.imageurl || null,
    body:      a.body?.slice(0, 200) || null,
    _src:      'cryptocompare',
  }));
}

// ── Source 2: CryptoPanic — needs CRYPTOPANIC_KEY env var ─────────────────────
async function fetchCryptoPanic() {
  const key = process.env.CRYPTOPANIC_KEY;
  if (!key || key === 'public') return [];
  const r = await axios.get('https://cryptopanic.com/api/v1/posts/', {
    params: { auth_token: key, public: true, kind: 'news', filter: 'hot', regions: 'en' },
    timeout: 8000,
  });
  return (r.data.results || []).slice(0, 15).map(a => ({
    id:        `cp-${a.id}`,
    title:     a.title,
    url:       a.url,
    source:    a.source?.title || 'CryptoPanic',
    published: a.published_at,
    coins:     (a.currencies || []).map(c => c.code).slice(0, 4),
    sentiment: a.votes
      ? (a.votes.positive > a.votes.negative ? 'bullish'
        : a.votes.negative > a.votes.positive ? 'bearish' : 'neutral')
      : 'neutral',
    _src: 'cryptopanic',
  }));
}

// ── Source 3: CoinGecko news ──────────────────────────────────────────────────
async function fetchCoinGecko() {
  const r = await axios.get('https://api.coingecko.com/api/v3/news', {
    timeout: 8000,
    headers: { 'Accept': 'application/json' },
  });
  return (r.data.data || []).slice(0, 10).map((a, i) => ({
    id:        `cg-${i}-${Date.now()}`,
    title:     a.title,
    url:       a.url,
    source:    a.author || 'CoinGecko',
    published: a.updated_at ? new Date(a.updated_at * 1000).toISOString() : new Date().toISOString(),
    coins:     [],
    sentiment: 'neutral',
    image:     a.thumb_2x || null,
    _src:      'coingecko',
  }));
}

async function fetchNewsArticles() {
  const results = await Promise.allSettled([
    fetchCryptoCompare(),
    fetchCryptoPanic(),
    fetchCoinGecko(),
  ]);

  const sources = [];
  const labels = ['CryptoCompare', 'CryptoPanic', 'CoinGecko'];
  for (let i = 0; i < results.length; i++) {
    if (results[i].status === 'fulfilled' && results[i].value.length > 0) {
      sources.push(...results[i].value);
      console.log(`[News] ${labels[i]}: ${results[i].value.length} articles`);
    } else {
      console.log(`[News] ${labels[i]}: failed —`, results[i].reason?.message || 'empty');
    }
  }

  if (sources.length === 0) return [];

  // Deduplicate by title (first 60 chars)
  const seen = new Set();
  const deduped = sources.filter(a => {
    const k = a.title.slice(0, 60).toLowerCase().replace(/[^a-z0-9]/g, '');
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  deduped.sort((a, b) => new Date(b.published) - new Date(a.published));
  return deduped.slice(0, 25);
}

// ── Routes ─────────────────────────────────────────────────────────────────────
router.get('/news', requireAuth, async (req, res) => {
  const forceRefresh = req.query.refresh === '1';

  if (!forceRefresh && isCacheFresh('news')) {
    return res.json({
      articles: cache.news.data,
      cached: true,
      source: 'cache',
      nextRefreshMs: cache.news.ttl - (Date.now() - cache.news.ts),
    });
  }

  try {
    const articles = await fetchNewsArticles();
    if (articles.length > 0) {
      cache.news.data = articles;
      cache.news.ts = Date.now();
      cache.news.isFallback = false;
      return res.json({ articles, cached: false, count: articles.length });
    }
    // All sources returned empty — serve stale if available
    if (cache.news.data.length > 0 && !cache.news.isFallback) {
      return res.json({ articles: cache.news.data, cached: true, stale: true });
    }
    throw new Error('No articles from any source');
  } catch(e) {
    console.error('[News] All sources failed:', e.message);
    // True fallback — mark as fallback so next request retries
    const fallback = [
      { id:'fb-1', title:'Bitcoin Holds Key Support Amid Market Volatility', url:'https://coindesk.com', source:'CoinDesk', published:new Date().toISOString(), coins:['BTC'], sentiment:'neutral' },
      { id:'fb-2', title:'Ethereum Staking Yields Attract Institutional Interest', url:'https://theblock.co', source:'The Block', published:new Date().toISOString(), coins:['ETH'], sentiment:'bullish' },
      { id:'fb-3', title:'Crypto Markets Show Resilience Despite Macro Headwinds', url:'https://coinmarketcap.com', source:'CoinMarketCap', published:new Date().toISOString(), coins:[], sentiment:'neutral' },
    ];
    cache.news.data = fallback;
    cache.news.ts = Date.now();
    cache.news.isFallback = true; // force retry next request
    res.json({ articles: fallback, fallback: true });
  }
});

router.get('/fear-greed', requireAuth, async (req, res) => {
  if (isCacheFresh('fearGreed')) return res.json(cache.fearGreed.data);
  try {
    const r = await axios.get('https://api.alternative.me/fng/?limit=7', { timeout: 6000 });
    const data = r.data.data || [];
    const result = { current: data[0], history: data.slice(0, 7) };
    cache.fearGreed.data = result;
    cache.fearGreed.ts = Date.now();
    res.json(result);
  } catch {
    res.json(cache.fearGreed.data || { current:{value:'50',value_classification:'Neutral'}, history:[] });
  }
});

router.get('/global', requireAuth, async (req, res) => {
  if (isCacheFresh('global')) return res.json(cache.global.data);
  try {
    const r = await axios.get('https://api.coingecko.com/api/v3/global', { timeout: 8000 });
    const d = r.data.data;
    const result = {
      totalMarketCap:  d.total_market_cap?.usd,
      totalVolume:     d.total_volume?.usd,
      btcDominance:    d.market_cap_percentage?.btc,
      ethDominance:    d.market_cap_percentage?.eth,
      activeCurrencies:d.active_cryptocurrencies,
      marketCapChange: d.market_cap_change_percentage_24h_usd,
    };
    cache.global.data = result;
    cache.global.ts = Date.now();
    res.json(result);
  } catch {
    res.json(cache.global.data || { totalMarketCap:2.8e12, totalVolume:142e9, btcDominance:52.4, ethDominance:17.2, marketCapChange:1.2 });
  }
});

router.get('/learning/:botId', requireAuth, async (req, res) => {
  try {
    const { getLearningStats } = await import('../services/learningEngine.js');
    const { strategy='PRECISION' } = req.query;
    res.json(getLearningStats(req.params.botId, strategy));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

export default router;
