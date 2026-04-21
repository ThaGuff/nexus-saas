/**
 * NEXUS SAAS · Billing Routes (Stripe)
 */

import express from 'express';
import Stripe from 'stripe';
import { Users, Trades } from '../models/db.js';
import { sendCancelWinBack, sendSubscriptionStarted } from '../services/email.js';
import { requireAuth } from '../middleware/auth.js';

const router  = express.Router();
const stripe  = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');
const FRONTEND = process.env.FRONTEND_URL || 'http://localhost:5173';

const BASIC_PRICE_ID      = process.env.STRIPE_BASIC_PRICE_ID   || process.env.STRIPE_PRICE_ID || '';
const PREMIUM_PRICE_ID    = process.env.STRIPE_PREMIUM_PRICE_ID || '';
const ENTERPRISE_PRICE_ID = process.env.STRIPE_ENTERPRISE_PRICE_ID || '';

function getPlanFromPriceId(priceId) {
  if (!priceId) return 'basic';
  if (ENTERPRISE_PRICE_ID && priceId === ENTERPRISE_PRICE_ID) return 'enterprise';
  if (PREMIUM_PRICE_ID    && priceId === PREMIUM_PRICE_ID)    return 'premium';
  if (BASIC_PRICE_ID      && priceId === BASIC_PRICE_ID)      return 'basic';
  return 'basic';
}

// POST /api/billing/checkout — create Stripe checkout session
router.post('/checkout', requireAuth, async (req, res) => {
  try {
    const { plan } = req.body;
    const priceId = plan === 'enterprise' ? ENTERPRISE_PRICE_ID : plan === 'premium' ? PREMIUM_PRICE_ID : BASIC_PRICE_ID;

    if (!priceId) {
      return res.status(500).json({ error: 'Stripe price ID not configured. Set STRIPE_BASIC_PRICE_ID and STRIPE_PREMIUM_PRICE_ID in Railway env vars.' });
    }

    let customerId = req.user.customerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: req.user.email,
        name:  `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || req.user.email,
        metadata: { userId: req.user.id },
      });
      customerId = customer.id;
      await Users.update(req.user.id, { customerId });
    }

    const session = await stripe.checkout.sessions.create({
      customer:   customerId,
      mode:       'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${FRONTEND}/dashboard?subscribed=true`,
      cancel_url:  `${FRONTEND}/?canceled=true`,
      subscription_data: { metadata: { userId: req.user.id, plan } },
    });

    res.json({ url: session.url });
  } catch (e) {
    console.error('[Billing] Checkout error:', e.message);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// POST /api/billing/portal
router.post('/portal', requireAuth, async (req, res) => {
  try {
    if (!req.user.customerId) return res.status(400).json({ error: 'No subscription found' });
    const session = await stripe.billingPortal.sessions.create({
      customer:   req.user.customerId,
      return_url: `${FRONTEND}/dashboard`,
    });
    res.json({ url: session.url });
  } catch (e) {
    res.status(500).json({ error: 'Failed to open billing portal' });
  }
});

// GET /api/billing/status
router.get('/status', requireAuth, (req, res) => {
  const now = new Date();
  const trialEndsAt = new Date(req.user.trialEndsAt);
  const trialDaysLeft = Math.max(0, Math.ceil((trialEndsAt - now) / 86400000));
  res.json({
    plan:               req.user.plan,
    subscriptionStatus: req.user.subscriptionStatus,
    trialEndsAt:        req.user.trialEndsAt,
    trialDaysLeft,
    isActive: req.user.subscriptionStatus === 'active' || (req.user.plan === 'trial' && trialEndsAt > now),
  });
});

// POST /api/billing/webhook — Stripe webhook
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig    = req.headers['stripe-signature'];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, secret);
  } catch (e) {
    console.error('[Billing] Webhook signature failed:', e.message);
    return res.status(400).send(`Webhook Error: ${e.message}`);
  }

  try {
    switch (event.type) {

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub      = event.data.object;
        const customer = await stripe.customers.retrieve(sub.customer);
        const userId   = customer.metadata?.userId;
        if (userId) {
          const priceId  = sub.items?.data?.[0]?.price?.id || '';
          const planName = getPlanFromPriceId(priceId);
          await Users.update(userId, {
            subscriptionId:     sub.id,
            subscriptionStatus: sub.status,
            plan: sub.status === 'active' ? planName : 'trial',
          });
          // Send subscription confirmation email
          if (sub.status === 'active' && event.type === 'customer.subscription.created') {
            const user = await Users.findById(userId).catch(()=>null);
            if (user) {
              const planLabel = planName.charAt(0).toUpperCase() + planName.slice(1);
              sendSubscriptionStarted(user, planLabel).catch(()=>{});
            }
          }
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub      = event.data.object;
        const customer = await stripe.customers.retrieve(sub.customer);
        const userId   = customer.metadata?.userId;
        if (userId) {
          await Users.update(userId, { subscriptionStatus: 'canceled', plan: 'trial' });
          // Send win-back email with their stats
          const user = await Users.findById(userId).catch(()=>null);
          if (user) {
            const trades = await Trades.forUser(userId, 500).catch(()=>[]);
            const sells  = trades.filter(t=>t.type==='SELL');
            const wins   = sells.filter(t=>t.pnl>0).length;
            const winRate = sells.length ? Math.round(wins/sells.length*100) : 0;
            sendCancelWinBack(user, { tradesCount:trades.length, winRate }).catch(()=>{});
          }
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice  = event.data.object;
        const customer = await stripe.customers.retrieve(invoice.customer);
        const userId   = customer.metadata?.userId;
        if (userId) await Users.update(userId, { subscriptionStatus: 'past_due' });
        break;
      }

    }
  } catch (e) {
    console.error('[Billing] Webhook handler error:', e.message);
  }

  res.json({ received: true });
});

export default router;
