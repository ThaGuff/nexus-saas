/**
 * NEXUS SAAS · Auth Routes
 */

import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';
import { Users } from '../models/db.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();
const JWT_SECRET  = process.env.JWT_SECRET  || 'dev-secret';
const JWT_EXPIRES = process.env.JWT_EXPIRES_IN || '7d';

function makeToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { email, password, firstName, lastName } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    if (await Users.findByEmail(email)) return res.status(409).json({ error: 'Email already registered' });

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await Users.create({ id: uuid(), email, passwordHash, firstName, lastName });
    const token = makeToken(user.id);

    res.status(201).json({ token, user: Users.safePublic(user) });
  } catch (e) {
    console.error('[Auth] Register error:', e);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await Users.findByEmail(email);
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

    const token = makeToken(user.id);
    res.json({ token, user: Users.safePublic(user) });
  } catch (e) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: Users.safePublic(req.user) });
});

// PUT /api/auth/profile
router.put('/profile', requireAuth, async (req, res) => {
  try {
    const { firstName, lastName, currentPassword, newPassword } = req.body;
    const updates = {};

    if (firstName) updates.firstName = firstName;
    if (lastName)  updates.lastName  = lastName;

    if (newPassword) {
      if (!currentPassword) return res.status(400).json({ error: 'Current password required' });
      const valid = await bcrypt.compare(currentPassword, req.user.passwordHash);
      if (!valid) return res.status(401).json({ error: 'Current password incorrect' });
      updates.passwordHash = await bcrypt.hash(newPassword, 12);
    }

    const updated = await Users.update(req.user.id, updates);
    res.json({ user: Users.safePublic(updated) });
  } catch (e) {
    res.status(500).json({ error: 'Profile update failed' });
  }
});

export default router;
