const express = require('express'); 
const cors = require('cors'); 
require('dotenv').config();

const invoiceRoutes = require('./routes/invoices');
const stockRoutes   = require('./routes/stock');
const ledgerRoutes = require('./routes/ledger');
const expenseRoutes = require('./routes/expenses');
const assetRoutes = require('./routes/assets');
const employeeRoutes = require('./routes/employees');

const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true
}));
// Allow React to talk toExpress
app.use(express.json());

// Legacy routes
app.use('/api/invoices', invoiceRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/ledger', ledgerRoutes);

// New module routes
app.use('/api/expenses', expenseRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/employees', employeeRoutes);

app.listen(process.env.PORT || 5000, () =>
     { console.log('🚀 Server running on port 5000'); });