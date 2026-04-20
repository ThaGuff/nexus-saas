/**
 * PLEX TRADER · Exchange Adapter Registry
 * 
 * Loads and caches exchange adapters per bot.
 * Handles credential decryption from DB.
 */

import { CoinbaseAdapter } from './coinbase.js';
import { BinanceAdapter }  from './binance.js';
import { KrakenAdapter }   from './kraken.js';
import { CryptoComAdapter } from './cryptocom.js';
import { Exchanges } from '../../models/db.js';

const ADAPTERS = { coinbase:CoinbaseAdapter, binance:BinanceAdapter, kraken:KrakenAdapter, cryptocom:CryptoComAdapter };

// Per-bot adapter cache  
const adapterCache = new Map(); // botId → adapter instance

// Taker fees per exchange for paper simulation
export const EXCHANGE_FEES = {
  coinbase:  0.001,  // 0.10% (Advanced Trade taker at <$10k vol)
  binance:   0.001,  // 0.10% spot taker
  kraken:    0.0016, // 0.16% taker
  cryptocom: 0.00075,// 0.075% taker
  paper:     0.001,  // 0.10% paper simulation
};

/**
 * Get or create an exchange adapter for a bot.
 * For PAPER mode bots with no exchange, returns null (bot handles internally).
 * For LIVE mode bots, loads exchange credentials from DB.
 */
export async function getAdapter(bot) {
  // Paper mode with no exchange connection — no adapter needed
  if (bot.botMode === 'PAPER' && (!bot.exchangeId || bot.exchangeId === 'paper')) {
    return null;
  }

  // Check cache
  if (adapterCache.has(bot.id)) return adapterCache.get(bot.id);

  // Load exchange connection from DB
  const conn = await Exchanges.findById(bot.exchangeId).catch(()=>null);
  if (!conn || !conn._apiKey) {
    console.warn(`[Exchange] Bot ${bot.id.slice(0,6)} has no valid exchange connection`);
    return null;
  }

  const AdapterClass = ADAPTERS[conn.exchange];
  if (!AdapterClass) {
    console.warn(`[Exchange] Unknown exchange: ${conn.exchange}`);
    return null;
  }

  const adapter = new AdapterClass({
    apiKey:    conn._apiKey,
    apiSecret: conn._apiSecret,
    apiPassphrase: conn._apiPassphrase,
    mode:      bot.botMode,
  });

  adapterCache.set(bot.id, adapter);
  console.log(`[Exchange] Adapter loaded: ${conn.exchange} for bot ${bot.id.slice(0,6)} (${bot.botMode})`);
  return adapter;
}

/**
 * Clear cached adapter (call when exchange credentials change)
 */
export function clearAdapter(botId) {
  adapterCache.delete(botId);
}

/**
 * Verify an exchange connection using stored credentials.
 * Returns { ok, error?, details? }
 */
export async function verifyExchange(exchangeId) {
  const conn = await Exchanges.findById(exchangeId).catch(()=>null);
  if (!conn) return { ok:false, error:'Connection not found' };
  if (!conn._apiKey) return { ok:false, error:'No API key stored' };

  const AdapterClass = ADAPTERS[conn.exchange];
  if (!AdapterClass) return { ok:false, error:`Unsupported exchange: ${conn.exchange}` };

  const adapter = new AdapterClass({
    apiKey:    conn._apiKey,
    apiSecret: conn._apiSecret,
    apiPassphrase: conn._apiPassphrase,
    mode:      'PAPER', // don't trade during verify
  });

  return adapter.verifyCredentials();
}

/**
 * Get live balances from an exchange connection
 */
export async function getLiveBalances(exchangeId) {
  const conn = await Exchanges.findById(exchangeId).catch(()=>null);
  if (!conn || !conn._apiKey) return {};

  const AdapterClass = ADAPTERS[conn.exchange];
  if (!AdapterClass) return {};

  const adapter = new AdapterClass({
    apiKey:conn._apiKey, apiSecret:conn._apiSecret,
    apiPassphrase:conn._apiPassphrase, mode:'LIVE',
  });

  return adapter.getBalances().catch(()=>({}));
}

export { ADAPTERS };
