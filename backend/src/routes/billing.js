/**
 * NEXUS SAAS · Billing Routes (Stripe)
 */

import express from 'express';
import Stripe from 'stripe';
import { Users } from '../models/db.js';
import { requireAuth } from '../middleware/auth.js';

const router  = express.Router();
const stripe  = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');
const PRICE_ID = process.env.STRIPE_PRICE_ID || '';
const FRONTEND = process.env.FRONTEND_URL || 'http://localhost:5173';

// POST /api/billing/checkout — create Stripe checkout session
router.post('/checkout', requireAuth, async (req, res) => {
  try {
    let customerId = req.user.customerId;

    // Create Stripe customer if doesn't exist
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: req.user.email,
        name:  `${req.user.firstName} ${req.user.lastName}`.trim() || req.user.email,
        metadata: { userId: req.user.id },
      });
      customerId = customer.id;
      Users.update(req.user.id, { customerId });
    }

    const session = await stripe.checkout.sessions.create({
      customer:    customerId,
      mode:        'subscription',
      line_items:  [{ price: PRICE_ID, quantity: 1 }],
      success_url: `${FRONTEND}/dashboard?subscribed=true`,
      cancel_url:  `${FRONTEND}/pricing?canceled=true`,
      subscription_data: {
        trial_period_days: 0, // Trial already running via our system
        metadata: { userId: req.user.id },
      },
    });

    res.json({ url: session.url });
  } catch (e) {
    console.error('[Billing] Checkout error:', e.message);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// POST /api/billing/portal — customer portal for managing subscription
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
    isActive:           req.user.subscriptionStatus === 'active' || (req.user.plan === 'trial' && trialEndsAt > now),
  });
});

// POST /api/billing/webhook — Stripe webhook
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig     = req.headers['stripe-signature'];
  const secret  = process.env.STRIPE_WEBHOOK_SECRET;

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
        const sub = event.data.object;
        const customer = await stripe.customers.retrieve(sub.customer);
        const userId = customer.metadata?.userId;
        if (userId) {
          Users.update(userId, {
            subscriptionId:     sub.id,
            subscriptionStatus: sub.status,
            plan:               sub.status === 'active' ? 'pro' : 'trial',
          });
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const customer = await stripe.customers.retrieve(sub.customer);
        const userId = customer.metadata?.userId;
        if (userId) {
          Users.update(userId, { subscriptionStatus: 'canceled', plan: 'trial' });
        }
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const customer = await stripe.customers.retrieve(invoice.customer);
        const userId = customer.metadata?.userId;
        if (userId) Users.update(userId, { subscriptionStatus: 'past_due' });
        break;
      }
    }
  } catch (e) {
    console.error('[Billing] Webhook handler error:', e.message);
  }

  res.json({ received: true });
});

export default router;
