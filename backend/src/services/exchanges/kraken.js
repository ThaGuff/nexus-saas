/**
 * PLEX TRADER · Kraken Adapter
 * 
 * API: api.kraken.com/0
 * Auth: API Key + HMAC-SHA512 (nonce + encoded POST body)
 * Taker fee: 0.16% (drops to 0.14% at >$50k 30d volume)
 * 
 * Setup steps for user:
 * 1. kraken.com → Security → API → Generate New Key
 * 2. Permissions: Query Funds + Create & Modify Orders ONLY
 * 3. No withdrawal permission
 */

import axios from 'axios';
import crypto from 'crypto';

const BASE = 'https://api.kraken.com/0';
const TAKER_FEE = 0.0016; // 0.16%

export class KrakenAdapter {
  constructor({ apiKey, apiSecret, mode='PAPER' }) {
    this.apiKey    = apiKey;
    this.apiSecret = apiSecret;
    this.mode      = mode;
    this.name      = 'kraken';
    this.tFee      = TAKER_FEE;
  }

  _sign(path, nonce, postData) {
    const msg = nonce + postData;
    const hash = crypto.createHash('sha256').update(nonce + postData).digest('binary');
    const hmac = crypto.createHmac('sha512', Buffer.from(this.apiSecret, 'base64'));
    hmac.update(path + hash, 'binary');
    return hmac.digest('base64');
  }

  async _private(method, params={}) {
    const nonce = Date.now().toString();
    const postData = new URLSearchParams({ nonce, ...params }).toString();
    const path = `/0/private/${method}`;
    const sig = this._sign(path, nonce, postData);

    const res = await axios.post(`${BASE}/private/${method}`, postData, {
      headers: { 'API-Key':this.apiKey, 'API-Sign':sig, 'Content-Type':'application/x-www-form-urlencoded' },
      timeout: 15000,
    });

    if (res.data.error?.length) throw new Error(`Kraken: ${res.data.error.join(', ')}`);
    return res.data.result;
  }

  // Kraken uses XBT for BTC, plus ZUSD pairs
  toSymbol(s) {
    const map = { BTC:'XBT', ETH:'ETH', SOL:'SOL', XRP:'XRP', BNB:'BNB', AVAX:'AVAX', DOGE:'DOGE', LINK:'LINK', DOT:'DOT', LTC:'LTC' };
    const base = map[s]||s;
    return `${base === 'XBT' ? 'XXBT' : 'X'+base}ZUSD`;
  }

  async verifyCredentials() {
    try {
      const r = await this._private('Balance');
      return { ok:true, assets:Object.keys(r).length };
    } catch(e) {
      return { ok:false, error:e.message };
    }
  }

  async getBalances() {
    const r = await this._private('Balance');
    const bals = {};
    const revMap = { XXBT:'BTC', XETH:'ETH', ZUSD:'USDT', USDT:'USDT' };
    for (const [k,v] of Object.entries(r||{})) {
      const val = parseFloat(v);
      if (val > 0) bals[revMap[k]||k] = val;
    }
    return bals;
  }

  async placeMarketOrder(plexSymbol, side, quoteAmount) {
    if (this.mode === 'PAPER') return this._paperFill(plexSymbol, side, quoteAmount);

    // Kraken market orders use volume (base currency), not quote
    // We need current price to convert quoteAmount → volume
    const ticker = await axios.get(`${BASE}/public/Ticker?pair=${this.toSymbol(plexSymbol)}`);
    const tickData = Object.values(ticker.data.result||{})[0];
    const price = parseFloat(tickData?.c?.[0]||0);
    if (!price) throw new Error(`No price for ${plexSymbol} on Kraken`);

    const volume = (quoteAmount / price).toFixed(8);
    const r = await this._private('AddOrder', {
      pair:        this.toSymbol(plexSymbol),
      type:        side === 'BUY' ? 'buy' : 'sell',
      ordertype:   'market',
      volume,
    });

    const txid = r.txid?.[0];
    const fee  = quoteAmount * this.tFee;

    return {
      orderId:    txid,
      symbol:     plexSymbol,
      side,
      qty:        parseFloat(volume),
      avgPrice:   price,
      quoteSpent: quoteAmount,
      fee,
      feeRate:    this.tFee,
      ts:         new Date().toISOString(),
      exchange:   'kraken',
    };
  }

  _paperFill(symbol, side, quoteAmount) {
    return {
      orderId:'paper-'+Date.now(), symbol, side, qty:null, avgPrice:null,
      quoteSpent:quoteAmount, fee:quoteAmount*0.001, feeRate:0.001,
      ts:new Date().toISOString(), exchange:'kraken-paper',
    };
  }

  async getOpenOrders() {
    const r = await this._private('OpenOrders');
    return Object.entries(r.open||{}).map(([id,o])=>({
      orderId:id, symbol:o.descr?.pair, side:o.descr?.type,
      qty:parseFloat(o.vol), price:parseFloat(o.descr?.price||0),
      status:'open', ts:new Date(o.opentm*1000).toISOString(),
    }));
  }

  async cancelOrder(orderId) {
    await this._private('CancelOrder', { txid:orderId });
    return { ok:true, orderId };
  }
}
