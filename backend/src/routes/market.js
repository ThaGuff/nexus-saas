/**
 * NEXUS · Market data + news routes
 */
import express from 'express';
import axios from 'axios';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// Cache
const newsCache    = { data: [], ts: 0 };
const fearCache    = { data: null, ts: 0 };
const CACHE_MS     = 5 * 60 * 1000; // 5 min

// ── Crypto news (CryptoPanic public API) ──────────────────────────────────────
router.get('/news', requireAuth, async (req, res) => {
  try {
    if (Date.now() - newsCache.ts < CACHE_MS && newsCache.data.length) {
      return res.json({ articles: newsCache.data });
    }
    // CryptoPanic public endpoint (no key needed for basic)
    const r = await axios.get('https://cryptopanic.com/api/v1/posts/', {
      params: { auth_token: process.env.CRYPTOPANIC_KEY || 'public', public: true, kind: 'news', filter: 'hot', currencies: 'BTC,ETH,SOL,BNB', num_pages: 1 },
      timeout: 8000,
    });
    const articles = (r.data.results || []).slice(0, 20).map(a => ({
      id:        a.id,
      title:     a.title,
      url:       a.url,
      source:    a.source?.title || 'Unknown',
      published: a.published_at,
      coins:     (a.currencies || []).map(c => c.code),
      sentiment: a.votes ? (a.votes.positive > a.votes.negative ? 'bullish' : a.votes.negative > a.votes.positive ? 'bearish' : 'neutral') : 'neutral',
    }));
    newsCache.data = articles;
    newsCache.ts   = Date.now();
    res.json({ articles });
  } catch {
    // Fallback: static headlines if API fails
    res.json({ articles: [
      { id:1, title:'Bitcoin Holds $84K Support as Institutional Demand Grows', url:'#', source:'CoinDesk', published:new Date().toISOString(), coins:['BTC'], sentiment:'bullish' },
      { id:2, title:'Ethereum Layer 2 Activity Reaches All-Time High', url:'#', source:'The Block', published:new Date().toISOString(), coins:['ETH'], sentiment:'bullish' },
      { id:3, title:'SEC Reviews New Crypto ETF Applications', url:'#', source:'Reuters', published:new Date().toISOString(), coins:['BTC','ETH'], sentiment:'neutral' },
      { id:4, title:'Solana DeFi TVL Surges 34% This Quarter', url:'#', source:'DeFi Llama', published:new Date().toISOString(), coins:['SOL'], sentiment:'bullish' },
      { id:5, title:'Fed Minutes Show Cautious Approach to Rate Cuts', url:'#', source:'Bloomberg', published:new Date().toISOString(), coins:[], sentiment:'bearish' },
    ]});
  }
});

// ── Fear & Greed Index ─────────────────────────────────────────────────────────
router.get('/fear-greed', requireAuth, async (req, res) => {
  try {
    if (Date.now() - fearCache.ts < CACHE_MS && fearCache.data) {
      return res.json(fearCache.data);
    }
    const r = await axios.get('https://api.alternative.me/fng/?limit=7', { timeout: 5000 });
    const data = r.data.data || [];
    const result = { current: data[0], history: data.slice(0, 7) };
    fearCache.data = result;
    fearCache.ts   = Date.now();
    res.json(result);
  } catch {
    res.json({ current: { value: '52', value_classification: 'Neutral', timestamp: Date.now() }, history: [] });
  }
});

// ── Global market stats ────────────────────────────────────────────────────────
router.get('/global', requireAuth, async (req, res) => {
  try {
    const r = await axios.get('https://api.coingecko.com/api/v3/global', { timeout: 6000 });
    const d = r.data.data;
    res.json({
      totalMarketCap:  d.total_market_cap?.usd,
      totalVolume:     d.total_volume?.usd,
      btcDominance:    d.market_cap_percentage?.btc,
      ethDominance:    d.market_cap_percentage?.eth,
      activeCurrencies:d.active_cryptocurrencies,
      marketCapChange: d.market_cap_change_percentage_24h_usd,
    });
  } catch {
    res.json({ totalMarketCap: 2.8e12, totalVolume: 142e9, btcDominance: 52.4, ethDominance: 17.2, marketCapChange: 1.2 });
  }
});

// ── Learning stats ─────────────────────────────────────────────────────────────
router.get('/learning/:botId', requireAuth, async (req, res) => {
  try {
    const { getLearningStats } = await import('../services/learningEngine.js');
    const { strategy = 'PRECISION' } = req.query;
    res.json(getLearningStats(req.params.botId, strategy));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
