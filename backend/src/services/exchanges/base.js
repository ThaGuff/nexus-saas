/**
 * PLEX TRADER · Exchange Adapter Base Class
 * All exchange adapters implement this interface.
 * 
 * ORDER FLOW:
 * 1. Bot calls placeOrder() → adapter places real order on exchange
 * 2. Adapter returns fill details (actualPrice, actualQty, fee)
 * 3. Bot updates portfolio with real fill data
 * 
 * SAFETY:
 * - All orders are market orders (immediate fill, no slippage risk from limit drift)
 * - Maximum single order size enforced before sending
 * - Each adapter validates credentials before first real order
 */

export class BaseExchangeAdapter {
  constructor(config) {
    this.apiKey        = config.apiKey;
    this.apiSecret     = config.apiSecret;
    this.apiPassphrase = config.apiPassphrase || null;
    this.exchangeName  = config.exchange;
    this.mode          = config.mode || 'PAPER'; // 'PAPER' | 'LIVE'
  }

  // Verify credentials are valid — call before first live order
  async verifyCredentials() { throw new Error('Not implemented'); }

  // Get current balances { USD: number, BTC: number, ... }
  async getBalances() { throw new Error('Not implemented'); }

  // Place a market order
  // Returns: { orderId, symbol, side, qty, avgPrice, fee, feeRate, ts }
  async placeMarketOrder(symbol, side, quoteAmount) { throw new Error('Not implemented'); }

  // Get open orders
  async getOpenOrders() { throw new Error('Not implemented'); }

  // Cancel an order
  async cancelOrder(orderId) { throw new Error('Not implemented'); }

  // Get recent fills for a symbol
  async getRecentFills(symbol, limit=10) { throw new Error('Not implemented'); }

  // Helper: sign a request with HMAC-SHA256
  signHmac256(secret, message) {
    const { createHmac } = await import('crypto');
    return createHmac('sha256', secret).update(message).digest('hex');
  }

  // Helper: convert PLEX symbol (BTC) to exchange symbol (BTC-USD, BTCUSDT, etc.)
  toExchangeSymbol(plexSymbol) { return plexSymbol; }

  // Helper: parse exchange symbol back to PLEX symbol
  fromExchangeSymbol(exSymbol) { return exSymbol; }
}
