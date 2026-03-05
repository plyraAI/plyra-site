'use strict';

const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

// ── Waitlist storage ──────────────────────────────────────────────────────────
// Uses a local JSON file. On read-only serverless environments (e.g. Vercel)
// writes are silently skipped; swap this section for a DB/KV store later.
const WAITLIST_FILE = path.join(process.cwd(), 'waitlist.json');

function loadWaitlist() {
  try {
    if (fs.existsSync(WAITLIST_FILE)) {
      return JSON.parse(fs.readFileSync(WAITLIST_FILE, 'utf-8'));
    }
  } catch (_) {}
  return [];
}

function saveWaitlist(list) {
  try {
    fs.writeFileSync(WAITLIST_FILE, JSON.stringify(list, null, 2), 'utf-8');
  } catch (_) {
    // Silently skip on read-only filesystems (serverless)
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function validateEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function loadTemplate(email) {
  const templatePath = path.join(process.cwd(), 'email_templates', 'waitlist_confirmation.html');
  let html = fs.readFileSync(templatePath, 'utf-8');
  return html.replace(/\{\{email\}\}/g, escapeHtml(email));
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── SMTP transporter ───────────────────────────────────────────────────────────
function createTransporter() {
  const pass = process.env.ZOHO_SMTP_PASSWORD;
  if (!pass) throw new Error('ZOHO_SMTP_PASSWORD environment variable is not set.');

  return nodemailer.createTransport({
    host: process.env.ZOHO_SMTP_HOST || 'smtp.zoho.com',
    port: 465,
    secure: true,
    auth: {
      user: 'alerts@plyra.dev',
      pass,
    },
    authMethod: 'LOGIN',
    pool: false,
  });
}

// ── Main handler (Vercel serverless + Express compatible) ──────────────────────
module.exports = async function handler(req, res) {
  // CORS for local dev
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed.' });
  }

  // ── Parse body ──
  const body = req.body || {};
  const raw = (body.email || '').toString().trim().toLowerCase();

  if (!raw) {
    return res.status(400).json({ success: false, error: 'Email address is required.' });
  }

  if (!validateEmail(raw)) {
    return res.status(400).json({ success: false, error: 'Please enter a valid email address.' });
  }

  // ── Duplicate check ──
  const waitlist = loadWaitlist();
  const alreadyExists = waitlist.some((entry) => entry.email === raw);

  if (alreadyExists) {
    console.log(`[notify] Duplicate signup ignored: ${raw}`);
    return res.status(200).json({ success: true, duplicate: true });
  }

  console.log(`[notify] New signup: ${raw}`);

  // ── Send emails ──
  let transporter;
  try {
    transporter = createTransporter();
  } catch (err) {
    console.error('[notify] Transporter error:', err.message);
    return res.status(500).json({ success: false, error: 'Mail service configuration error.' });
  }

  try {
    const confirmationHtml = loadTemplate(raw);

    // 1. Confirmation email → user
    console.log(`[notify] Sending confirmation to ${raw}...`);
    await transporter.sendMail({
      from: '"Plyra" <alerts@plyra.dev>',
      to: raw,
      subject: "You're on the Plyra waitlist 🚀",
      html: confirmationHtml,
      text: [
        'Hello,',
        '',
        "Thanks for signing up to be notified about Plyra.",
        '',
        "We're building open infrastructure for safe and observable AI agents.",
        '',
        "We'll notify you before the public launch.",
        '',
        '— Plyra Team',
        'https://plyra.dev',
      ].join('\n'),
    });
    console.log(`[notify] Confirmation sent to ${raw}`);

    // 2. Alert email → alerts@plyra.dev
    console.log(`[notify] Sending alert to alerts@plyra.dev...`);
    await transporter.sendMail({
      from: '"Plyra Alerts" <alerts@plyra.dev>',
      to: 'alerts@plyra.dev',
      subject: 'New Plyra Waitlist Signup',
      text: `The following email joined the Plyra waitlist:\n\n${raw}\n\nSigned up at: ${new Date().toISOString()}`,
      html: `
        <div style="font-family:monospace;font-size:14px;color:#1a202c;padding:24px;">
          <p>The following email joined the Plyra waitlist:</p>
          <p style="font-size:16px;font-weight:bold;color:#0d9488;">${escapeHtml(raw)}</p>
          <p style="color:#718096;font-size:12px;">
            Signed up at: ${new Date().toISOString()}
          </p>
        </div>
      `,
    });
    console.log('[notify] Alert sent to alerts@plyra.dev');

    // ── Persist only after emails succeed ──
    waitlist.push({ email: raw, signedUpAt: new Date().toISOString() });
    saveWaitlist(waitlist);
    console.log(`[notify] Saved to waitlist. Total: ${waitlist.length}`);

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[notify] Email send error:', err);
    return res.status(500).json({ success: false, error: 'Failed to send confirmation email. Please try again.' });
  }
};
