/**
 * PLEX TRADER · Affiliate Referral System
 * 
 * How it works:
 * - Each user gets a unique referral code (e.g. plexus-r7x2k)
 * - Share link: https://nexus-saas-production.up.railway.app/?ref=r7x2k
 * - When a referred user signs up → referral recorded
 * - When referred user becomes paying subscriber → referrer earns credit
 * - Credits applied automatically to next invoice (via Stripe credit balance)
 * 
 * Credit structure: $10 per referred paying subscriber (month 1 only)
 */
import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { Users } from '../models/db.js';

const router = express.Router();

// In-memory referral store (persist to Supabase in production via schema_referrals.sql)
const referralCodes = new Map();   // code → userId
const referredUsers = new Map();   // newUserId → referrerUserId
const referralStats = new Map();   // userId → { referred:[], earnings:0, pending:0 }

function generateCode(userId) {
  return 'plex-' + userId.slice(0,4) + Math.random().toString(36).slice(2,6);
}

function getOrCreateCode(userId) {
  // Check if user already has a code
  for (const [code, uid] of referralCodes.entries()) {
    if (uid === userId) return code;
  }
  const code = generateCode(userId);
  referralCodes.set(code, userId);
  return code;
}

function getStats(userId) {
  if (!referralStats.has(userId)) {
    referralStats.set(userId, { referred:[], earnings:0, pending:0, code: getOrCreateCode(userId) });
  }
  return referralStats.get(userId);
}

// GET /api/referrals/me — get my referral code + stats
router.get('/me', requireAuth, (req, res) => {
  const stats = getStats(req.user.id);
  const code  = getOrCreateCode(req.user.id);
  const host  = process.env.FRONTEND_URL || 'https://nexus-saas-production.up.railway.app';
  res.json({
    code,
    link:     `${host}?ref=${code}`,
    referred: stats.referred.length,
    earnings: stats.earnings,
    pending:  stats.pending,
    howItWorks: [
      'Share your unique link with friends or on social media',
      'When they sign up and start a free trial, they\'re linked to you',
      'When they become a paying subscriber, you earn $10 credit',
      'Credits are applied to your next month\'s invoice automatically',
    ],
  });
});

// POST /api/referrals/track — called on registration with ?ref= param
router.post('/track', async (req, res) => {
  const { code, newUserId } = req.body;
  if (!code || !newUserId) return res.json({ ok:false });

  const referrerId = referralCodes.get(code);
  if (!referrerId || referrerId === newUserId) return res.json({ ok:false });

  referredUsers.set(newUserId, referrerId);
  const stats = getStats(referrerId);
  stats.referred.push({ userId:newUserId, joinedAt:new Date().toISOString(), status:'trial' });
  stats.pending++;

  console.log(`[Referral] ${newUserId} referred by ${referrerId} via code ${code}`);
  res.json({ ok:true });
});

// POST /api/referrals/convert — called by billing webhook on subscription start
router.post('/convert', async (req, res) => {
  const { userId } = req.body;
  const referrerId = referredUsers.get(userId);
  if (!referrerId) return res.json({ ok:false, msg:'No referrer' });

  const stats = getStats(referrerId);
  const ref   = stats.referred.find(r => r.userId === userId);
  if (ref && ref.status !== 'converted') {
    ref.status    = 'converted';
    ref.convertedAt = new Date().toISOString();
    stats.earnings += 10;
    stats.pending   = Math.max(0, stats.pending - 1);
    console.log(`[Referral] Conversion! Referrer ${referrerId} earned $10`);
    // TODO: Apply Stripe credit balance to referrerId's customer
    // stripe.customers.createBalanceTransaction(customerId, { amount:-1000, currency:'usd' })
  }
  res.json({ ok:true, referrerId, earned:10 });
});

// GET /api/referrals/leaderboard — top referrers (public, gamification)
router.get('/leaderboard', requireAuth, (req, res) => {
  const entries = [];
  for (const [userId, stats] of referralStats.entries()) {
    if (stats.earnings > 0 || stats.referred.length > 0) {
      entries.push({ referred:stats.referred.length, earnings:stats.earnings });
    }
  }
  entries.sort((a,b) => b.earnings - a.earnings);
  res.json({ leaderboard: entries.slice(0,10) });
});

export { referralCodes, referredUsers };
export default router;
