/**
 * NEXUS SAAS · Auth Middleware
 */

import jwt from 'jsonwebtoken';
import { Users } from '../models/db.js';

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await Users.findById(payload.userId);
    if (!user) return res.status(401).json({ error: 'User not found' });

    // Check subscription status
    const now = new Date();
    const trialEnded = user.plan === 'trial' && new Date(user.trialEndsAt) < now;
    const subCanceled = user.subscriptionStatus === 'canceled' || user.subscriptionStatus === 'past_due';

    if (trialEnded && subCanceled) {
      return res.status(402).json({ error: 'Subscription required', code: 'SUBSCRIPTION_REQUIRED' });
    }

    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

export function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.email !== process.env.ADMIN_EMAIL) {
      return res.status(403).json({ error: 'Admin only' });
    }
    next();
  });
}
