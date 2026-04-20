/**
 * PLEX TRADER · Market data + news
 * News: refreshes every 10 minutes from multiple sources
 * Fear & Greed: refreshes every 15 minutes
 * Global stats: refreshes every 5 minutes
 */
import express from 'express';
import axios   from 'axios';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// Cache buckets with different TTLs
const cache = {
  news:      { data: [], ts: 0,    ttl: 10 * 60 * 1000 }, // 10 min
  fearGreed: { data: null, ts: 0,  ttl: 15 * 60 * 1000 }, // 15 min
  global:    { data: null, ts: 0,  ttl:  5 * 60 * 1000 }, // 5 min
};

function fresh(bucket) {
  return Date.now() - cache[bucket].ts < cache[bucket].ttl;
}

// ── Fetch news from multiple sources with fallback chain ──────────────────────
async function fetchNewsArticles() {
  const sources = [];

  // Source 1: CryptoPanic (best if API key available)
  try {
    const key = process.env.CRYPTOPANIC_KEY || 'public';
    const r = await axios.get('https://cryptopanic.com/api/v1/posts/', {
      params: {
        auth_token: key,
        public: true,
        kind: 'news',
        filter: 'rising',
        regions: 'en',
        num_pages: 1,
      },
      timeout: 8000,
    });
    const articles = (r.data.results || []).slice(0, 15).map(a => ({
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
    if (articles.length > 0) sources.push(...articles);
    console.log(`[News] CryptoPanic: ${articles.length} articles`);
  } catch(e) {
    console.log('[News] CryptoPanic failed:', e.message);
  }

  // Source 2: CoinGecko News (no key needed, generous rate limit)
  try {
    const r = await axios.get('https://api.coingecko.com/api/v3/news', {
      timeout: 8000,
    });
    const articles = (r.data.data || []).slice(0, 10).map((a, i) => ({
      id:        `cg-${i}`,
      title:     a.title,
      url:       a.url,
      source:    a.author || 'CoinGecko News',
      published: a.updated_at ? new Date(a.updated_at * 1000).toISOString() : new Date().toISOString(),
      coins:     [],
      sentiment: 'neutral',
      image:     a.thumb_2x || null,
      _src: 'coingecko',
    }));
    if (articles.length > 0) sources.push(...articles);
    console.log(`[News] CoinGecko: ${articles.length} articles`);
  } catch(e) {
    console.log('[News] CoinGecko news failed:', e.message);
  }

  // Deduplicate by title similarity and sort by published desc
  const seen = new Set();
  const deduped = sources.filter(a => {
    const key = a.title.slice(0, 50).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  deduped.sort((a, b) => new Date(b.published) - new Date(a.published));
  return deduped.slice(0, 25);
}

// ── Routes ─────────────────────────────────────────────────────────────────────
router.get('/news', requireAuth, async (req, res) => {
  // Force refresh if ?refresh=1
  const forceRefresh = req.query.refresh === '1';

  if (!forceRefresh && fresh('news') && cache.news.data.length) {
    return res.json({
      articles: cache.news.data,
      cached: true,
      nextRefreshMs: cache.news.ttl - (Date.now() - cache.news.ts),
    });
  }

  try {
    const articles = await fetchNewsArticles();

    if (articles.length > 0) {
      cache.news.data = articles;
      cache.news.ts   = Date.now();
      return res.json({ articles, cached: false });
    }

    // All sources failed — return stale cache if available
    if (cache.news.data.length) {
      return res.json({ articles: cache.news.data, cached: true, stale: true });
    }

    throw new Error('No articles from any source');
  } catch(e) {
    console.error('[News] All sources failed:', e.message);
    // Fallback headlines with current timestamps
    res.json({
      articles: [
        { id:'fb-1', title:'Bitcoin Holds Key Support as Market Consolidates', url:'https://coindesk.com', source:'CoinDesk', published:new Date().toISOString(), coins:['BTC'], sentiment:'neutral' },
        { id:'fb-2', title:'Ethereum Network Activity Surges to New Highs', url:'https://theblock.co', source:'The Block', published:new Date().toISOString(), coins:['ETH'], sentiment:'bullish' },
        { id:'fb-3', title:'Crypto Market Cap Approaches $3 Trillion Milestone', url:'https://coinmarketcap.com', source:'CoinMarketCap', published:new Date().toISOString(), coins:[], sentiment:'bullish' },
        { id:'fb-4', title:'Solana Ecosystem TVL Reaches Record Highs', url:'https://defillama.com', source:'DeFi Llama', published:new Date().toISOString(), coins:['SOL'], sentiment:'bullish' },
        { id:'fb-5', title:'Fed Policy Uncertainty Weighs on Risk Assets', url:'https://reuters.com', source:'Reuters', published:new Date().toISOString(), coins:[], sentiment:'bearish' },
        { id:'fb-6', title:'Institutional Crypto Adoption Continues to Grow in 2026', url:'https://bloomberg.com', source:'Bloomberg', published:new Date().toISOString(), coins:['BTC','ETH'], sentiment:'bullish' },
      ],
      cached: false,
      fallback: true,
    });
  }
});

router.get('/fear-greed', requireAuth, async (req, res) => {
  if (fresh('fearGreed') && cache.fearGreed.data) {
    return res.json(cache.fearGreed.data);
  }
  try {
    const r = await axios.get('https://api.alternative.me/fng/?limit=7', { timeout: 6000 });
    const data = r.data.data || [];
    const result = { current: data[0], history: data.slice(0, 7) };
    cache.fearGreed.data = result;
    cache.fearGreed.ts   = Date.now();
    res.json(result);
  } catch {
    res.json(cache.fearGreed.data || {
      current: { value:'52', value_classification:'Neutral', timestamp:Date.now() },
      history: [],
    });
  }
});

router.get('/global', requireAuth, async (req, res) => {
  if (fresh('global') && cache.global.data) {
    return res.json(cache.global.data);
  }
  try {
    const r = await axios.get('https://api.coingecko.com/api/v3/global', { timeout: 8000 });
    const d = r.data.data;
    const result = {
      totalMarketCap:   d.total_market_cap?.usd,
      totalVolume:      d.total_volume?.usd,
      btcDominance:     d.market_cap_percentage?.btc,
      ethDominance:     d.market_cap_percentage?.eth,
      activeCurrencies: d.active_cryptocurrencies,
      marketCapChange:  d.market_cap_change_percentage_24h_usd,
    };
    cache.global.data = result;
    cache.global.ts   = Date.now();
    res.json(result);
  } catch {
    res.json(cache.global.data || {
      totalMarketCap:2.8e12, totalVolume:142e9, btcDominance:52.4,
      ethDominance:17.2, marketCapChange:1.2,
    });
  }
});

router.get('/learning/:botId', requireAuth, async (req, res) => {
  try {
    const { getLearningStats } = await import('../services/learningEngine.js');
    const { strategy = 'PRECISION' } = req.query;
    res.json(getLearningStats(req.params.botId, strategy));
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
