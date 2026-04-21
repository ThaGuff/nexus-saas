/**
 * PLEX TRADER · Email Service
 * 
 * Uses Resend (resend.com) — free tier: 3,000 emails/month, 100/day
 * Setup: Get free API key at resend.com → add RESEND_API_KEY to Railway
 * Sender: Requires a verified domain OR use onboarding@resend.dev for testing
 * 
 * Drip sequences implemented:
 * 1. WELCOME          — immediately on registration
 * 2. DAY_1_SETUP      — 24h after registration (if no bot started)
 * 3. DAY_3_FIRST_TRADE— 3 days after reg (celebrate or nudge)
 * 4. DAY_7_PROGRESS   — weekly performance summary
 * 5. DAY_12_TRIAL_END — 2 days before trial expires
 * 6. TRIAL_EXPIRED    — trial ended, push to subscribe
 * 7. SUBSCRIPTION_WIN — first payment received (celebrate)
 * 8. CANCEL_WIN_BACK  — subscription canceled (re-engagement)
 * 9. ABANDON_REGISTER — started signup, didn't finish (if email captured)
 */

import axios from 'axios';

const RESEND_KEY  = process.env.RESEND_API_KEY || '';
const FROM_EMAIL  = process.env.FROM_EMAIL || 'PLEX Trader <noreply@plexautomation.io>';
const APP_URL     = process.env.FRONTEND_URL || 'https://nexus-saas-production.up.railway.app';

// In-memory drip queue (persists via setInterval; use a proper queue in prod)
const dripQueue   = []; // { userId, email, firstName, sequence, scheduledFor, sent:false }
const sentEmails  = new Set(); // `${userId}:${sequence}` — prevent duplicates

export async function sendEmail({ to, subject, html, text }) {
  if (!RESEND_KEY) {
    console.log(`[Email] No RESEND_API_KEY set — would send to ${to}: "${subject}"`);
    return { ok: false, reason: 'no_key' };
  }
  try {
    const r = await axios.post('https://api.resend.com/emails', {
      from: FROM_EMAIL, to: [to], subject, html, text: text || subject,
    }, {
      headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      timeout: 10000,
    });
    console.log(`[Email] Sent "${subject}" to ${to} (id: ${r.data?.id})`);
    return { ok: true, id: r.data?.id };
  } catch(e) {
    console.error(`[Email] Failed to send "${subject}" to ${to}:`, e.response?.data || e.message);
    return { ok: false, error: e.message };
  }
}

// ── Email Templates ───────────────────────────────────────────────────────────

function base(content, preheader='') {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>PLEX Trader</title>
<style>
  body{margin:0;padding:0;background:#04060e;font-family:'Helvetica Neue',Arial,sans-serif;color:#94a3b8}
  .wrap{max-width:600px;margin:0 auto;padding:40px 20px}
  .logo{color:#00e5a0;font-size:22px;font-weight:900;letter-spacing:-0.02em;margin-bottom:32px;display:block}
  .card{background:#080d1a;border:1px solid #0f1e30;border-radius:12px;padding:32px;margin-bottom:24px}
  h1{color:#e8f4ff;font-size:24px;font-weight:800;margin:0 0 12px}
  h2{color:#e8f4ff;font-size:18px;font-weight:700;margin:0 0 8px}
  p{color:#94a3b8;font-size:15px;line-height:1.7;margin:0 0 16px}
  .btn{display:inline-block;background:#00e5a0;color:#000!important;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:800;font-size:15px;margin:16px 0}
  .btn-secondary{background:transparent;color:#00e5a0!important;border:1px solid #00e5a025;padding:12px 24px}
  .stat{background:#04060e;border:1px solid #0f1e30;border-radius:8px;padding:16px;text-align:center;display:inline-block;margin:6px}
  .stat-num{color:#00e5a0;font-size:28px;font-weight:900;font-family:monospace;display:block}
  .stat-label{color:#3a5068;font-size:11px;text-transform:uppercase;letter-spacing:0.1em}
  .tip{background:#00e5a008;border:1px solid #00e5a020;border-radius:8px;padding:16px;margin:16px 0}
  .warning{background:#ef444408;border:1px solid #ef444420;border-radius:8px;padding:16px;margin:16px 0}
  .footer{color:#1e3448;font-size:11px;text-align:center;margin-top:32px;line-height:1.8}
  a{color:#00e5a0}
</style></head>
<body>
${preheader ? `<span style="display:none;max-height:0;overflow:hidden">${preheader}</span>` : ''}
<div class="wrap">
  <a href="${APP_URL}" class="logo">⚡ PLEX Trader</a>
  ${content}
  <div class="footer">
    © 2026 PLEX Automation · <a href="${APP_URL}/privacy">Privacy</a> · <a href="${APP_URL}/terms">Terms</a><br>
    Not financial advice. Crypto trading involves substantial risk of loss.<br>
    <a href="${APP_URL}/unsubscribe" style="color:#1e3448">Unsubscribe</a>
  </div>
</div>
</body></html>`;
}

const TEMPLATES = {

  // ── 1. Welcome — sent immediately on registration ────────────────────────────
  welcome: ({ firstName }) => ({
    subject: `Welcome to PLEX Trader, ${firstName || 'Trader'} — your 14-day trial starts now`,
    preheader: 'Your AI trading bot is ready. Here\'s how to get started in 5 minutes.',
    html: base(`
      <div class="card">
        <h1>Welcome, ${firstName || 'Trader'}! 👋</h1>
        <p>Your 14-day free trial has started. Here's how to make the most of it:</p>
        <div class="tip">
          <h2>🚀 Get trading in 5 minutes</h2>
          <p style="margin-bottom:8px"><strong style="color:#e8f4ff">Step 1:</strong> Go to your dashboard and click <strong>+ Bot</strong></p>
          <p style="margin-bottom:8px"><strong style="color:#e8f4ff">Step 2:</strong> Choose a strategy — <strong>AGGRESSIVE</strong> is most active for beginners</p>
          <p style="margin-bottom:8px"><strong style="color:#e8f4ff">Step 3:</strong> Start in <strong>Paper mode</strong> — simulated trades with no real money</p>
          <p style="margin-bottom:0"><strong style="color:#e8f4ff">Step 4:</strong> Watch the bot scan 27 coins every 90 seconds for high-confidence setups</p>
        </div>
        <a href="${APP_URL}/dashboard" class="btn">Open Dashboard →</a>
        <p style="font-size:13px;color:#3a5068">Questions? Just reply to this email — Ryan from PLEX reads every one.</p>
      </div>
      <div class="card">
        <h2>What makes PLEX Trader different</h2>
        <p>Most bots buy on a single signal. Ours requires <strong style="color:#00e5a0">8/10 confidence</strong> across RSI, MACD, Bollinger Bands, and volume before entering any trade. Fewer trades — but higher quality ones.</p>
        <p>The AI assistant ARIA can explain any trade, analyze your portfolio, and suggest strategy adjustments based on current market conditions.</p>
      </div>
    `, 'Your AI trading bot is ready. Here\'s how to get started in 5 minutes.'),
  }),

  // ── 2. Day 1 Setup Nudge — if no bot started ────────────────────────────────
  day1_setup: ({ firstName }) => ({
    subject: `${firstName || 'Hey'}, your bot hasn't started yet — need help?`,
    preheader: 'Takes 2 minutes. We\'ll walk you through it.',
    html: base(`
      <div class="card">
        <h1>Your bot is waiting ⏳</h1>
        <p>You signed up yesterday but haven't started a bot yet. That's okay — setup takes less than 2 minutes and there's zero risk in paper mode.</p>
        <div class="tip">
          <h2>Recommended first setup:</h2>
          <p>• Strategy: <strong style="color:#00e5a0">AGGRESSIVE</strong> (most trades, great for getting a feel)<br>
          • Mode: <strong style="color:#00e5a0">Paper</strong> (simulated — no real money)<br>
          • Starting balance: $10,000 (simulated)<br>
          • Max trade: $500</p>
        </div>
        <a href="${APP_URL}/dashboard" class="btn">Start My Bot →</a>
        <p style="font-size:13px;color:#3a5068">Running into issues? Reply to this email and I'll help personally.</p>
      </div>
    `, 'Takes 2 minutes. Start in paper mode — no real money needed.'),
  }),

  // ── 3. Day 3 Check-in ───────────────────────────────────────────────────────
  day3_checkin: ({ firstName, tradesCount, winRate }) => ({
    subject: tradesCount > 0
      ? `Your bot made ${tradesCount} trades — here's how it's doing`
      : `Day 3 update: what's the PLEX Trader algorithm looking for?`,
    preheader: tradesCount > 0 ? `Win rate: ${winRate}%` : 'Market conditions explained.',
    html: base(tradesCount > 0 ? `
      <div class="card">
        <h1>3 days in — ${tradesCount} trades completed 📊</h1>
        <div style="text-align:center;margin:20px 0">
          <div class="stat"><span class="stat-num">${tradesCount}</span><span class="stat-label">Trades</span></div>
          <div class="stat"><span class="stat-num">${winRate}%</span><span class="stat-label">Win Rate</span></div>
        </div>
        <p>The algorithm requires 8/10 confidence before any entry — so you may see cycles where nothing trades. That's by design. Patience is built into the system.</p>
        <a href="${APP_URL}/dashboard" class="btn">View Full Analytics →</a>
      </div>
    ` : `
      <div class="card">
        <h1>Day 3 update 📡</h1>
        <p>Your bot has been scanning the market but waiting for the right conditions. Here's what the algorithm needs before buying:</p>
        <div class="tip">
          <p>• RSI must be <strong style="color:#00e5a0">recovering</strong> (not still falling)<br>
          • MACD must be <strong style="color:#00e5a0">bullish or turning</strong><br>
          • Volume must be <strong style="color:#00e5a0">above average</strong><br>
          • Combined confidence score must hit <strong style="color:#00e5a0">8/10+</strong></p>
        </div>
        <p>In ranging or low-volatility markets, these conditions rarely align — that's intentional. The bot is protecting your capital by waiting for genuine setups.</p>
        <a href="${APP_URL}/dashboard" class="btn">Check Bot Logs →</a>
      </div>
    `),
  }),

  // ── 4. Day 7 Weekly Summary ──────────────────────────────────────────────────
  day7_weekly: ({ firstName, tradesCount, winRate, pnl, trialDaysLeft }) => ({
    subject: `Week 1 summary: ${pnl >= 0 ? '+' : ''}$${Math.abs(pnl).toFixed(2)} ${pnl >= 0 ? '📈' : '📉'}`,
    preheader: `${trialDaysLeft} trial days left. Here's your performance breakdown.`,
    html: base(`
      <div class="card">
        <h1>Week 1 Summary, ${firstName || 'Trader'}</h1>
        <div style="text-align:center;margin:20px 0">
          <div class="stat"><span class="stat-num" style="color:${pnl>=0?'#00e5a0':'#ef4444'}">${pnl>=0?'+':''}$${Math.abs(pnl).toFixed(2)}</span><span class="stat-label">Paper P&L</span></div>
          <div class="stat"><span class="stat-num">${winRate}%</span><span class="stat-label">Win Rate</span></div>
          <div class="stat"><span class="stat-num">${tradesCount}</span><span class="stat-label">Trades</span></div>
        </div>
        <p>You have <strong style="color:#00e5a0">${trialDaysLeft} days</strong> left on your free trial. If your paper results look good, consider connecting a real exchange to start trading with real capital.</p>
        <div class="tip">
          <h2>💡 This week's tip</h2>
          <p>Switch your bot to PRECISION or DCA+ strategy if you want fewer but higher-confidence trades. AGGRESSIVE fires more often but carries more risk per trade.</p>
        </div>
        <a href="${APP_URL}/dashboard" class="btn">View Full Dashboard →</a>
      </div>
    `, `${trialDaysLeft} trial days left.`),
  }),

  // ── 5. Day 12 Trial Ending ───────────────────────────────────────────────────
  day12_trial_ending: ({ firstName, tradesCount, winRate, pnl }) => ({
    subject: `⏳ 2 days left on your trial — lock in your rate`,
    preheader: 'Your bot keeps running after you subscribe. No setup needed.',
    html: base(`
      <div class="card">
        <div class="warning">
          <strong style="color:#ef4444">⏳ Your free trial ends in 2 days</strong>
        </div>
        <h1>Don't lose your progress, ${firstName || 'Trader'}</h1>
        <div style="text-align:center;margin:20px 0">
          <div class="stat"><span class="stat-num" style="color:${pnl>=0?'#00e5a0':'#ef4444'}">${pnl>=0?'+':''}$${Math.abs(pnl||0).toFixed(2)}</span><span class="stat-label">Paper P&L</span></div>
          <div class="stat"><span class="stat-num">${winRate||'—'}%</span><span class="stat-label">Win Rate</span></div>
          <div class="stat"><span class="stat-num">${tradesCount||0}</span><span class="stat-label">Trades</span></div>
        </div>
        <p>Subscribe now to keep your bots running without interruption. Your trade history, bot configuration, and learning data all carry over.</p>
        <div class="tip">
          <strong style="color:#e8f4ff">Basic — $29.99/mo</strong><br>
          <p style="margin:4px 0 0">1 bot, PRECISION + DCA+ strategies, paper & live trading</p>
        </div>
        <div class="tip">
          <strong style="color:#a855f7">Premium — $69.99/mo</strong><br>
          <p style="margin:4px 0 0">3 bots, all 7 strategies, ARIA AI, custom strategies, manual trading</p>
        </div>
        <a href="${APP_URL}/dashboard" class="btn">Subscribe Now →</a>
        <p style="font-size:13px;color:#3a5068">Not ready? Your account stays active — you can subscribe anytime. Trade history is preserved for 30 days.</p>
      </div>
    `, 'Your bot stops in 2 days unless you subscribe. Keep your progress.'),
  }),

  // ── 6. Trial Expired ─────────────────────────────────────────────────────────
  trial_expired: ({ firstName, tradesCount, winRate }) => ({
    subject: `Your PLEX Trader trial has ended — your data is still here`,
    preheader: 'Reactivate in 30 seconds. Your bots pick up where they left off.',
    html: base(`
      <div class="card">
        <div class="warning">Your free trial has ended</div>
        <h1>Come back, ${firstName || 'Trader'}</h1>
        <p>Your bots have paused but your data is intact — trade history, bot configs, and learning data are all still here.</p>
        ${tradesCount > 0 ? `
        <div style="text-align:center;margin:20px 0">
          <div class="stat"><span class="stat-num">${tradesCount}</span><span class="stat-label">Trades Made</span></div>
          <div class="stat"><span class="stat-num">${winRate}%</span><span class="stat-label">Win Rate</span></div>
        </div>` : ''}
        <p>Start a Basic subscription ($29.99/mo) to reactivate immediately. Your bots will resume from where they stopped.</p>
        <a href="${APP_URL}/dashboard" class="btn">Reactivate for $29.99/mo →</a>
        <p style="font-size:13px;color:#3a5068">Data preserved for 30 days from trial end.</p>
      </div>
    `, 'Your bots paused but your data is still here. Reactivate in seconds.'),
  }),

  // ── 7. Subscription Confirmed ────────────────────────────────────────────────
  subscription_started: ({ firstName, plan }) => ({
    subject: `🎉 You're in — ${plan} plan confirmed`,
    preheader: 'Welcome to the PLEX Trader community. Here\'s what\'s unlocked.',
    html: base(`
      <div class="card">
        <h1>You're officially a PLEX Trader subscriber 🎉</h1>
        <p>Your <strong style="color:#00e5a0">${plan}</strong> plan is active. Your bots are running (or ready to start) right now.</p>
        ${plan === 'Premium' || plan === 'Enterprise' ? `
        <div class="tip">
          <h2>Premium features now available:</h2>
          <p>• <strong style="color:#e8f4ff">ARIA AI Assistant</strong> — ask anything about your portfolio<br>
          • <strong style="color:#e8f4ff">7 trading strategies</strong> — MOMENTUM, SWING, REVERSAL, BREAKOUT<br>
          • <strong style="color:#e8f4ff">3 simultaneous bots</strong> — run different strategies in parallel<br>
          • <strong style="color:#e8f4ff">Custom strategy builder</strong> — define your own entry rules</p>
        </div>` : ''}
        <div class="tip">
          <h2>💰 Earn $10 per referral</h2>
          <p>Share your unique referral link from Settings → Referral. When a friend subscribes, you get $10 credit on your next invoice.</p>
        </div>
        <a href="${APP_URL}/dashboard" class="btn">Open Dashboard →</a>
      </div>
    `, `Welcome to PLEX Trader ${plan}!`),
  }),

  // ── 8. Cancellation Win-Back ─────────────────────────────────────────────────
  cancel_winback: ({ firstName, tradesCount, winRate }) => ({
    subject: `We're sorry to see you go, ${firstName || 'Trader'}`,
    preheader: 'Tell us what went wrong — and here\'s 30 days free if you\'d like to try again.',
    html: base(`
      <div class="card">
        <h1>You canceled your subscription</h1>
        <p>Your account stays active until the end of your billing period. After that, your trade history is preserved for 30 days.</p>
        <p>If something wasn't working — please hit reply and tell me. I read every response personally and your feedback directly shapes what we build next.</p>
        ${tradesCount > 0 ? `
        <div style="text-align:center;margin:20px 0">
          <div class="stat"><span class="stat-num">${tradesCount}</span><span class="stat-label">Total Trades</span></div>
          <div class="stat"><span class="stat-num">${winRate}%</span><span class="stat-label">Win Rate</span></div>
        </div>` : ''}
        <div class="tip">
          <h2>Changed your mind?</h2>
          <p>Reply to this email with "reactivate" and I'll personally apply a 30-day extension to your account as a thank-you for the honest feedback.</p>
        </div>
        <a href="${APP_URL}/dashboard" class="btn-secondary btn">Reactivate My Account</a>
      </div>
    `, 'Your data is safe. Tell us what went wrong — or reactivate with a free month.'),
  }),

  // ── 9. Abandon Register Win-Back ─────────────────────────────────────────────
  abandon_register: ({ email }) => ({
    subject: `You almost started your free trial — still interested?`,
    preheader: 'No credit card needed. 14 days free. Takes 2 minutes.',
    html: base(`
      <div class="card">
        <h1>Your free trial is still waiting</h1>
        <p>You started signing up for PLEX Trader but didn't finish. No worries — your trial slot is still open.</p>
        <div class="tip">
          <h2>What you get free for 14 days:</h2>
          <p>✓ AI-powered trading bot scanning 27 coins 24/7<br>
          ✓ 8/10 confidence threshold — only high-quality entries<br>
          ✓ Paper trading mode — zero financial risk to start<br>
          ✓ ARIA AI assistant for portfolio analysis<br>
          ✓ Full dashboard with P&L tracking</p>
        </div>
        <a href="${APP_URL}/register" class="btn">Start Free Trial →</a>
        <p style="font-size:13px;color:#3a5068">No credit card required. Cancel anytime. Takes 2 minutes to set up.</p>
      </div>
    `, 'No credit card needed. 14 days free. Your spot is still open.'),
  }),

};

// ── Drip Scheduler ────────────────────────────────────────────────────────────

export async function scheduleUserDrip(user) {
  const { id, email, firstName } = user;
  const now = Date.now();
  const HOUR = 3600000;
  const DAY  = 86400000;

  const drips = [
    { sequence:'welcome',          delayMs: 0 },
    { sequence:'day1_setup',       delayMs: DAY * 1 },
    { sequence:'day3_checkin',     delayMs: DAY * 3 },
    { sequence:'day7_weekly',      delayMs: DAY * 7 },
    { sequence:'day12_trial_ending', delayMs: DAY * 12 },
    { sequence:'trial_expired',    delayMs: DAY * 14 + HOUR * 2 },
  ];

  for (const { sequence, delayMs } of drips) {
    const key = `${id}:${sequence}`;
    if (!sentEmails.has(key)) {
      dripQueue.push({
        userId: id, email, firstName,
        sequence, scheduledFor: now + delayMs,
        sent: false,
      });
    }
  }
}

export async function sendWelcome(user) {
  const tmpl = TEMPLATES.welcome(user);
  const result = await sendEmail({ to: user.email, ...tmpl });
  if (result.ok) sentEmails.add(`${user.id}:welcome`);
  return result;
}

export async function sendCancelWinBack(user, stats = {}) {
  const key = `${user.id}:cancel_winback`;
  if (sentEmails.has(key)) return;
  const tmpl = TEMPLATES.cancel_winback({ ...user, ...stats });
  const result = await sendEmail({ to: user.email, ...tmpl });
  if (result.ok) sentEmails.add(key);
}

export async function sendSubscriptionStarted(user, plan) {
  const key = `${user.id}:subscription_started:${plan}`;
  if (sentEmails.has(key)) return;
  const tmpl = TEMPLATES.subscription_started({ ...user, plan });
  const result = await sendEmail({ to: user.email, ...tmpl });
  if (result.ok) sentEmails.add(key);
}

export async function sendAbandonEmail(email) {
  const key = `abandon:${email}`;
  if (sentEmails.has(key)) return;
  const tmpl = TEMPLATES.abandon_register({ email });
  const result = await sendEmail({ to: email, subject: tmpl.subject, html: tmpl.html });
  if (result.ok) sentEmails.add(key);
}

// ── Drip processor — runs every 5 minutes ────────────────────────────────────
async function processDripQueue() {
  const now = Date.now();
  const pending = dripQueue.filter(d => !d.sent && d.scheduledFor <= now);

  for (const drip of pending) {
    const key = `${drip.userId}:${drip.sequence}`;
    if (sentEmails.has(key)) { drip.sent = true; continue; }

    try {
      // Get fresh user stats for context
      const { Users } = await import('../models/db.js');
      const { Trades } = await import('../models/db.js');
      const user = await Users.findById(drip.userId).catch(()=>null);
      if (!user) { drip.sent = true; continue; }

      // Skip trial emails if user already subscribed
      if (['trial_expired','day12_trial_ending'].includes(drip.sequence) && user.plan !== 'trial') {
        drip.sent = true; continue;
      }

      const trades  = await Trades.forUser(drip.userId, 500).catch(()=>[]);
      const sells   = trades.filter(t => t.type === 'SELL');
      const wins    = sells.filter(t => t.pnl > 0).length;
      const winRate = sells.length ? Math.round(wins/sells.length*100) : 0;
      const pnl     = sells.reduce((s,t) => s+(t.pnl||0), 0);

      const trialEndsAt = new Date(user.trialEndsAt);
      const trialDaysLeft = Math.max(0, Math.ceil((trialEndsAt - new Date()) / 86400000));

      const tmpl = TEMPLATES[drip.sequence]({
        firstName: user.firstName, email: user.email,
        tradesCount: trades.length, winRate, pnl, trialDaysLeft,
      });

      const result = await sendEmail({ to: user.email, subject: tmpl.subject, html: tmpl.html });
      drip.sent = true;
      if (result.ok) {
        sentEmails.add(key);
        console.log(`[Drip] Sent ${drip.sequence} to ${user.email}`);
      }
    } catch(e) {
      console.error(`[Drip] Error processing ${drip.sequence} for ${drip.userId}:`, e.message);
    }
  }
}

// Start drip processor
setInterval(processDripQueue, 5 * 60 * 1000); // every 5 minutes
console.log('[Email] Drip processor started');

export { TEMPLATES };
