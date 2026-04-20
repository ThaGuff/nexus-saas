/**
 * PLEX TRADER · Binance Adapter
 * 
 * API: api.binance.com
 * Auth: API Key header + HMAC-SHA256 signed query
 * Taker fee: 0.10% spot (0.075% with BNB, 0.04% VIP1+)
 * 
 * Setup steps for user:
 * 1. binance.com → Profile → API Management → Create API
 * 2. Enable: "Enable Spot & Margin Trading" ONLY
 * 3. IP restriction: add your Railway server IP
 * 4. Do NOT enable withdrawals
 */

import axios from 'axios';
import crypto from 'crypto';

const BASE = 'https://api.binance.com';
const TAKER_FEE = 0.001; // 0.10%

export class BinanceAdapter {
  constructor({ apiKey, apiSecret, mode='PAPER' }) {
    this.apiKey    = apiKey;
    this.apiSecret = apiSecret;
    this.mode      = mode;
    this.name      = 'binance';
    this.tFee      = TAKER_FEE;
  }

  _sign(params) {
    const qs = new URLSearchParams(params).toString();
    const sig = crypto.createHmac('sha256', this.apiSecret).update(qs).digest('hex');
    return `${qs}&signature=${sig}`;
  }

  async _req(method, path, params={}, signed=true) {
    if (signed) params.timestamp = Date.now();
    const qs = signed ? this._sign(params) : new URLSearchParams(params).toString();
    const url = `${BASE}${path}${method==='GET'?'?'+qs:''}`;
    const res = await axios({
      method, url,
      data: method!=='GET' ? qs : undefined,
      headers: {
        'X-MBX-APIKEY': this.apiKey,
        ...(method!=='GET'?{'Content-Type':'application/x-www-form-urlencoded'}:{}),
      },
      timeout: 15000,
    });
    return res.data;
  }

  toSymbol(s) { return `${s}USDT`; }

  async verifyCredentials() {
    try {
      const r = await this._req('GET', '/api/v3/account');
      return { ok:true, canTrade:r.canTrade, balances:(r.balances||[]).filter(b=>parseFloat(b.free)>0).length };
    } catch(e) {
      return { ok:false, error:e.response?.data?.msg || e.message };
    }
  }

  async getBalances() {
    const r = await this._req('GET', '/api/v3/account');
    const bals = {};
    for (const b of r.balances||[]) {
      const val = parseFloat(b.free);
      if (val > 0) bals[b.asset] = val;
    }
    return bals;
  }

  async placeMarketOrder(plexSymbol, side, quoteAmount) {
    if (this.mode === 'PAPER') return this._paperFill(plexSymbol, side, quoteAmount);

    const symbol = this.toSymbol(plexSymbol);
    const params = {
      symbol,
      side: side === 'BUY' ? 'BUY' : 'SELL',
      type: 'MARKET',
      quoteOrderQty: quoteAmount.toFixed(2),
    };

    const r = await this._req('POST', '/api/v3/order', params);

    const avgPrice = parseFloat(r.cummulativeQuoteQty||0) / parseFloat(r.executedQty||1);
    const qty  = parseFloat(r.executedQty||0);
    const cost = parseFloat(r.cummulativeQuoteQty||0);
    const fee  = cost * this.tFee;

    return {
      orderId:    r.orderId.toString(),
      symbol:     plexSymbol,
      side,
      qty,
      avgPrice,
      quoteSpent: cost,
      fee,
      feeRate:    this.tFee,
      ts:         new Date(r.transactTime).toISOString(),
      exchange:   'binance',
    };
  }

  _paperFill(symbol, side, quoteAmount) {
    return {
      orderId:   `paper-${Date.now()}`,
      symbol, side,
      qty:       null, avgPrice:null,
      quoteSpent: quoteAmount,
      fee:       quoteAmount * 0.001,
      feeRate:   0.001,
      ts:        new Date().toISOString(),
      exchange:  'binance-paper',
    };
  }

  async getOpenOrders() {
    const r = await this._req('GET', '/api/v3/openOrders');
    return (r||[]).map(o=>({
      orderId: o.orderId.toString(),
      symbol:  o.symbol.replace('USDT',''),
      side:    o.side,
      qty:     parseFloat(o.origQty),
      price:   parseFloat(o.price),
      status:  o.status,
      ts:      new Date(o.time).toISOString(),
    }));
  }

  async cancelOrder(orderId, symbol) {
    await this._req('DELETE', '/api/v3/order', { symbol, orderId });
    return { ok:true, orderId };
  }
}
