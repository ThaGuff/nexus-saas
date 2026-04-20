/**
 * PLEX TRADER · Coinbase Advanced Trade Adapter
 * 
 * API: api.coinbase.com/api/v3/brokerage
 * Auth: API Key + Secret (JWT signing with ES256 for Advanced Trade)
 * Taker fee: 0.06% (maker 0.02% for >$10k 30d volume)
 * 
 * Setup steps for user:
 * 1. coinbase.com → Settings → API → New API Key
 * 2. Select "Advanced Trade" 
 * 3. Permissions: View + Trade (NOT Withdraw)
 * 4. Copy API Key Name + Private Key
 */

import axios from 'axios';
import crypto from 'crypto';

const BASE = 'https://api.coinbase.com/api/v3/brokerage';
export const TAKER_FEE = 0.006; // 0.6% default, drops to 0.06% at >$1k volume

export class CoinbaseAdapter {
  constructor({ apiKey, apiSecret, mode='PAPER' }) {
    this.apiKey    = apiKey;
    this.apiSecret = apiSecret;
    this.mode      = mode;
    this.name      = 'coinbase';
    this.tFee      = TAKER_FEE;
  }

  // Coinbase Advanced uses JWT auth
  _buildJWT(method, path) {
    const now = Math.floor(Date.now() / 1000);
    const uri = `${method} api.coinbase.com${path}`;
    const payload = {
      sub: this.apiKey,
      iss: 'coinbase-cloud',
      nbf: now,
      exp: now + 120,
      uri,
    };
    // Encode JWT manually (RS256 with EC key)
    const header = Buffer.from(JSON.stringify({ alg:'ES256', kid:this.apiKey, nonce:crypto.randomBytes(16).toString('hex') })).toString('base64url');
    const body   = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig    = crypto.createSign('SHA256').update(`${header}.${body}`).sign({ key:this.apiSecret, format:'pem' }, 'base64url');
    return `${header}.${body}.${sig}`;
  }

  async _req(method, path, data=null) {
    const jwt = this._buildJWT(method, path);
    const res = await axios({
      method, url:`${BASE}${path}`, data,
      headers:{ Authorization:`Bearer ${jwt}`, 'Content-Type':'application/json' },
      timeout:15000,
    });
    return res.data;
  }

  // Convert PLEX symbol (BTC) → Coinbase product ID (BTC-USD)
  toSymbol(s) { return `${s}-USDT`; }

  async verifyCredentials() {
    try {
      const r = await this._req('GET', '/accounts');
      return { ok:true, accounts:(r.accounts||[]).length };
    } catch(e) {
      return { ok:false, error:e.response?.data?.error || e.message };
    }
  }

  async getBalances() {
    const r = await this._req('GET', '/accounts');
    const bals = {};
    for (const a of r.accounts||[]) {
      const sym = a.currency;
      const val = parseFloat(a.available_balance?.value||0);
      if (val > 0) bals[sym] = val;
    }
    return bals;
  }

  async placeMarketOrder(plexSymbol, side, quoteAmount) {
    if (this.mode === 'PAPER') {
      // Paper simulation — return fake fill at current market price
      return this._paperFill(plexSymbol, side, quoteAmount);
    }

    const productId = this.toSymbol(plexSymbol);
    const clientOrderId = `plex-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;

    const order = {
      client_order_id: clientOrderId,
      product_id: productId,
      side: side === 'BUY' ? 'BUY' : 'SELL',
      order_configuration: {
        market_market_ioc: {
          quote_size: quoteAmount.toFixed(2), // buy with USD amount
        },
      },
    };

    const r = await this._req('POST', '/orders', order);
    if (!r.success) throw new Error(`Coinbase order failed: ${JSON.stringify(r.error_response)}`);

    const fill = r.order_configuration?.market_market_ioc;
    const avgPrice = parseFloat(fill?.quote_size||0) / parseFloat(fill?.base_size||1);
    const qty  = parseFloat(fill?.base_size||0);
    const fee  = quoteAmount * this.tFee;

    return {
      orderId:  r.order_id,
      symbol:   plexSymbol,
      side,
      qty,
      avgPrice,
      quoteSpent: quoteAmount,
      fee,
      feeRate: this.tFee,
      ts: new Date().toISOString(),
      exchange: 'coinbase',
    };
  }

  _paperFill(symbol, side, quoteAmount) {
    // Returns a simulated fill — actual price comes from algorithm's price cache
    return {
      orderId:   `paper-${Date.now()}`,
      symbol, side,
      qty:       null, // set by bot after getting real price
      avgPrice:  null, // set by bot
      quoteSpent: quoteAmount,
      fee:       quoteAmount * 0.001, // 0.1% paper sim
      feeRate:   0.001,
      ts:        new Date().toISOString(),
      exchange:  'coinbase-paper',
    };
  }

  async getOpenOrders() {
    const r = await this._req('GET', '/orders/historical/batch?order_status=OPEN');
    return (r.orders||[]).map(o=>({
      orderId:   o.order_id,
      symbol:    o.product_id.replace('-USDT','').replace('-USD',''),
      side:      o.side,
      qty:       parseFloat(o.base_size||0),
      price:     parseFloat(o.limit_price||0),
      status:    o.status,
      ts:        o.created_time,
    }));
  }

  async cancelOrder(orderId) {
    await this._req('POST', '/orders/batch_cancel', { order_ids:[orderId] });
    return { ok:true, orderId };
  }
}
