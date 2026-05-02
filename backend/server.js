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
const customersRoutes = require('./routes/customers');
const productionRoutes = require('./routes/production');
const nlpSearch = require('./routes/nlp-search');


const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));
// Allow React to talk to Express
app.use(express.json());

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
app.use('/api/customers', customersRoutes);
app.use('/api/production', productionRoutes);

//nlp
app.use('/api/nlp', nlpSearch);

app.listen(process.env.PORT || 5000, () =>
     { console.log('🚀 Server running on port ' + (process.env.PORT || 5000)); });