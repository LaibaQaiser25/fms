const express = require('express'); 
const cors = require('cors'); 
require('dotenv').config();

const invoiceRoutes = require('./routes/invoices');
const stockRoutes   = require('./routes/stock');
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
const productionRoutes = require('./routes/production');
const authRoutes = require('./routes/auth');
const authMiddleware = require('./middleware/authMiddleware');
const { startCronJobs } = require('./services/cronJobs');



let nlpSearch;
try {
  nlpSearch = require('./routes/nlp-search');
  console.log('✅ NLP Search module loaded successfully');
} catch (err) {
  console.error('❌ Error loading NLP Search module:', err.message);
  nlpSearch = null;
}


const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));
// Allow React to talk to Express
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Auth routes
app.use('/auth', authRoutes);

// Every /api/* route requires a valid JWT from here on
app.use('/api', authMiddleware);

// Legacy routes
app.use('/api/invoices', invoiceRoutes);
app.use('/api/stock', stockRoutes);
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
app.use('/api/production', productionRoutes);

startCronJobs(); // Start the cron jobs when the server starts

// NLP routes with error handling
// if (nlpSearch) {
  app.use('/api/nlp', nlpSearch);
//   console.log('✅ NLP route mounted at /api/nlp');
// } else {
//   console.warn('⚠️  NLP route not available - module failed to load');
// }

app.listen(process.env.PORT || 5000, () =>
     { console.log('🚀 Server running on port ' + (process.env.PORT || 5000)); });