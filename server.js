'use strict';

// Load .env in local development
const dotenvResult = require('dotenv').config();
if (dotenvResult.error) {
  console.warn('[server] .env file not found — relying on system environment variables.');
} else {
  console.log('[server] .env loaded.');
}

const express = require('express');
const path = require('path');
const notifyHandler = require('./api/notify');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ─────────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from project root
app.use(express.static(path.join(__dirname)));

// ── API routes ─────────────────────────────────────────────────────────────────
app.post('/api/notify', notifyHandler);

// ── SPA fallback ───────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ── Start ──────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  const smtpPass = process.env.ZOHO_SMTP_PASSWORD;
  const smtpHost = process.env.ZOHO_SMTP_HOST || 'smtp.zoho.com';
  console.log(`\n  Plyra dev server running at http://localhost:${PORT}`);
  console.log(`  SMTP host:     ${smtpHost}`);
  console.log(`  SMTP user:     alerts@plyra.dev`);
  console.log(`  SMTP password: ${smtpPass ? smtpPass.slice(0,4) + '****' + ' (loaded, length=' + smtpPass.length + ')' : '✗ NOT SET'}\n`);
});
