/**
 * PLEX TRADER · Crypto.com Exchange Adapter
 * 
 * API: api.crypto.com/v1
 * Auth: API Key + HMAC-SHA256 signature
 * Taker fee: 0.075% (0.04% VIP1+)
 * 
 * Setup:
 * 1. crypto.com/exchange → API Management → Create New API Key
 * 2. Enable: Spot Trading, Read
 * 3. Do NOT enable Withdrawals
 */

import axios from 'axios';
import crypto from 'crypto';

const BASE = 'https://api.crypto.com/v1';
const TAKER_FEE = 0.00075; // 0.075%

export class CryptoComAdapter {
  constructor({ apiKey, apiSecret, mode='PAPER' }) {
    this.apiKey    = apiKey;
    this.apiSecret = apiSecret;
    this.mode      = mode;
    this.name      = 'cryptocom';
    this.tFee      = TAKER_FEE;
  }

  _sign(method, id, params={}) {
    const paramStr = Object.keys(params).sort().map(k=>`${k}${params[k]}`).join('');
    const msg = `${method}${id}${this.apiKey}${paramStr}${id}`;
    return crypto.createHmac('sha256', this.apiSecret).update(msg).digest('hex');
  }

  async _private(method, params={}) {
    const nonce = Date.now();
    const sig = this._sign(method, nonce, params);
    const body = { id:nonce, method:`private/${method}`, api_key:this.apiKey,
      params, sig, nonce };

    const res = await axios.post(`${BASE}/private/${method}`, body, {
      headers:{ 'Content-Type':'application/json' }, timeout:15000,
    });

    if (res.data.code !== 0) throw new Error(`Crypto.com: ${res.data.message||res.data.code}`);
    return res.data.result;
  }

  toSymbol(s) { return `${s}_USDT`; }

  async verifyCredentials() {
    try {
      const r = await this._private('get-account-summary');
      return { ok:true, accounts:(r.accounts||[]).length };
    } catch(e) {
      return { ok:false, error:e.message };
    }
  }

  async getBalances() {
    const r = await this._private('get-account-summary');
    const bals = {};
    for (const a of r.accounts||[]) {
      const val = parseFloat(a.available);
      if (val > 0) bals[a.currency] = val;
    }
    return bals;
  }

  async placeMarketOrder(plexSymbol, side, quoteAmount) {
    if (this.mode === 'PAPER') return this._paperFill(plexSymbol, side, quoteAmount);

    const params = {
      instrument_name: this.toSymbol(plexSymbol),
      side: side === 'BUY' ? 'BUY' : 'SELL',
      type: 'MARKET',
      notional: quoteAmount.toFixed(2), // quote amount for market orders
    };

    const r = await this._private('create-order', params);
    const fee = quoteAmount * this.tFee;

    return {
      orderId:    r.order_id.toString(),
      symbol:     plexSymbol,
      side,
      qty:        parseFloat(r.quantity||0),
      avgPrice:   parseFloat(r.avg_price||0),
      quoteSpent: quoteAmount,
      fee,
      feeRate:    this.tFee,
      ts:         new Date().toISOString(),
      exchange:   'cryptocom',
    };
  }

  _paperFill(symbol, side, quoteAmount) {
    return {
      orderId:'paper-'+Date.now(), symbol, side, qty:null, avgPrice:null,
      quoteSpent:quoteAmount, fee:quoteAmount*0.001, feeRate:0.001,
      ts:new Date().toISOString(), exchange:'cryptocom-paper',
    };
  }

  async getOpenOrders() {
    const r = await this._private('get-open-orders');
    return (r.order_list||[]).map(o=>({
      orderId:o.order_id.toString(), symbol:o.instrument_name.replace('_USDT',''),
      side:o.side, qty:parseFloat(o.quantity), price:parseFloat(o.price||0),
      status:o.status, ts:new Date(o.create_time).toISOString(),
    }));
  }

  async cancelOrder(orderId, symbol) {
    await this._private('cancel-order', { instrument_name:this.toSymbol(symbol), order_id:orderId });
    return { ok:true, orderId };
  }
}
