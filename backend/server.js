const express = require('express');
const cors = require('cors');
const compression = require('compression');
require('dotenv').config();

const invoiceRoutes = require('./routes/invoices');
const stockRoutes   = require('./routes/stock');
const productsRoutes = require('./routes/products');
const ledgerRoutes = require('./routes/ledger');
const expenseRoutes = require('./routes/expenses');
const assetRoutes = require('./routes/assets');
const employeeRoutes = require('./routes/employees');
const salesRoutes = require('./routes/sales');
const purchaseRoutes = require('./routes/purchase');
const sellersRoutes = require('./routes/sellers');
const purchaseInvoiceRoutes = require('./routes/purchaseInvoices');
const purchaseLedgerRoutes = require('./routes/purchaseLedger');
const customersRoutes = require('./routes/customers');
const gatePassRoutes = require('./routes/gatePasses');
const productionRoutes = require('./routes/production');
const rawMaterialsRoutes = require('./routes/rawMaterials');
const rawMaterialConsumptionRoutes = require('./routes/rawMaterialConsumption');
const cashbookRoutes = require('./routes/cashbook');
const reportsRoutes = require('./routes/reports');
const analyticsRoutes = require('./routes/analytics');
const usersRoutes = require('./routes/users');
const authRoutes = require('./routes/auth');
const syncRoutes = require('./routes/sync');
const authMiddleware = require('./middleware/authMiddleware');
const requireOwner = require('./middleware/requireOwner');
const readOnlyMode = require('./middleware/readOnlyMode');
const { startCronJobs } = require('./services/cronJobs');
const { initWebSocketServer } = require('./services/wsServer');
const http = require('http');



let nlpSearch;
try {
  nlpSearch = require('./routes/nlp-search');
  console.log('✅ NLP Search module loaded successfully');
} catch (err) {
  console.error('❌ Error loading NLP Search module:', err.message);
  nlpSearch = null;
}


const app = express();

// We're always behind the Cloudflare Tunnel (cloudflared on the VPS host) —
// trust its X-Forwarded-For so express-rate-limit keys on the real client IP
// instead of throwing ERR_ERL_UNEXPECTED_X_FORWARDED_FOR on every request.
app.set('trust proxy', 1);

// FRONTEND_URL may list several origins, comma-separated — the dashboard
// (app.ittefaqbuilder.com) and the public site are separate origins.
const allowedOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map((o) => o.trim().replace(/\/$/, ''))
  .filter(Boolean);

app.use(cors({
  origin: allowedOrigins.length > 0 ? allowedOrigins : '*',
  credentials: true,
  // Without this, browsers cache the OPTIONS preflight for only ~5s (Chromium
  // default when the header is absent), so almost every authenticated
  // request pays a second full round trip through the tunnel just for the
  // preflight. 24h is Chromium's own cap on Access-Control-Max-Age.
  maxAge: 86400
}));
app.use(compression());

// Factory desktop app -> VPS sync (SYNC_TOKEN auth, not JWT). Mounted before
// the global JSON parser because it needs a larger body limit.
app.use('/sync', syncRoutes);

// Factory desktop app installer + update files (VPS only: DOWNLOADS_DIR is set
// in docker-compose.yml, never by the desktop app itself).
if (process.env.DOWNLOADS_DIR) {
  app.use('/downloads', require('./routes/downloads'));
}

// READ_ONLY_MODE=true once the factory app is the only writer (see middleware).
app.use(readOnlyMode);

// Allow React to talk to Express
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ===== TEMP: auto-deployment test route — DELETE AFTER VERIFYING DEPLOY =====
app.get('/testautodeployment', (req, res) => {
  res.json({ message: 'Auto deployment works!' });
});
// ===== END TEMP ROUTE =====

// Auth routes
app.use('/auth', authRoutes);

// Every /api/* route requires a valid JWT from here on
app.use('/api', authMiddleware);

// Legacy routes
app.use('/api/invoices', invoiceRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/ledger', ledgerRoutes);

// Existing module routes
app.use('/api/expenses', expenseRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/employees', employeeRoutes);

// New dashboard module routes
app.use('/api/sales', salesRoutes);
app.use('/api/purchase', purchaseRoutes);
app.use('/api/purchases', purchaseRoutes);
app.use('/api/sellers', sellersRoutes);
app.use('/api/purchase-invoices', purchaseInvoiceRoutes);
app.use('/api/purchase-ledger', purchaseLedgerRoutes);
app.use('/api/customers', customersRoutes);
app.use('/api/gate-passes', gatePassRoutes);
app.use('/api/production', productionRoutes);
app.use('/api/raw-materials', rawMaterialsRoutes);
app.use('/api/raw-material-consumption', rawMaterialConsumptionRoutes);
// Owner-only — Manager/Guest are blocked from Cashbook per role policy (see middleware/requireOwner.js)
app.use('/api/cashbook', requireOwner, cashbookRoutes);

// Owner-only — Manager/Guest are blocked from Reports per role policy (see middleware/requireOwner.js)
app.use('/api/reports', requireOwner, reportsRoutes);

// Owner-only — Analytics is gated the same way on the frontend (App.jsx); enforce it here too
app.use('/api/analytics', requireOwner, analyticsRoutes);

// Owner-only — user management (create users, edit others' username/email/password, change own password)
app.use('/api/users', requireOwner, usersRoutes);

// Scheduled reports write rows, so in read-only mode only the factory app runs
// them (their results reach this server through /sync like everything else).
if (process.env.READ_ONLY_MODE === 'true') {
  console.log('🔒 READ_ONLY_MODE: writes blocked, cron jobs not started');
} else {
  startCronJobs(); // Start the cron jobs when the server starts
}

// NLP routes with error handling
if (typeof nlpSearch === 'function') {
  app.use('/api/nlp', nlpSearch);
  console.log('✅ NLP route mounted at /api/nlp');
} else {
  console.warn('⚠️  NLP route not available - module failed to load or is disabled');
}

// A plain http.Server wrapping the Express app, instead of app.listen()
// directly, so the WebSocket server can attach to the same port via the
// 'upgrade' event — no second port, no separate process, and it rides the
// same Cloudflare Tunnel ingress rule as the rest of the API.
// Desktop build only (desktop/main.js sets FMS_STATIC_DIR): this same server
// also hands out the built frontend, so the Electron window loads the
// dashboard from this origin. Unset on the VPS, where Vercel serves it.
if (process.env.FMS_STATIC_DIR) {
  const path = require('path');
  const staticDir = process.env.FMS_STATIC_DIR;
  app.use(express.static(staticDir));
  // Client-side routes (/sales, /ledger?...) fall back to index.html, but an
  // unknown /api or /auth path must still 404 rather than return HTML.
  app.get('/{*splat}', (req, res, next) => {
    if (/^\/(api|auth|ws|sync)(\/|$)/.test(req.path)) return next();
    res.sendFile(path.join(staticDir, 'index.html'));
  });
}

const server = http.createServer(app);
initWebSocketServer(server);

// HOST is only set by the desktop build (127.0.0.1, so the factory PC's
// API isn't exposed to the LAN); undefined keeps the default all-interfaces bind.
server.listen(process.env.PORT || 5000, process.env.HOST, () =>
     { console.log('🚀 Server running on port ' + (process.env.PORT || 5000)); });