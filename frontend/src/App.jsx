import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';

import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import Analytics from './components/Analytics';
import InvoiceList from './components/InvoiceList';
import InvoiceForm from './components/InvoiceForm';
import StockManager from './components/StockManager';
import CustomerLedger from './components/CustomerLedger';
import ProductionList from './components/ProductionList';
import ExpenseList from './components/Expenses/ExpenseList';
import AssetList from './components/Assets/AssetList';
import EmployeeList from './components/Employees/EmployeeList';

// Public Pages
import HomePage from './pages/HomePage';
import AboutPage from './pages/AboutPage';
import ServicesPage from './pages/ServicesPage';
import SpecialitiesPage from './pages/SpecialitiesPage';
import FeedbackPage from './pages/FeedbackPage';
import ContactPage from './pages/ContactPage';

function App() {
  return (
    <AuthProvider>
    <BrowserRouter>
      <Routes>
        {/* Public Routes - Accessible to everyone */}
        <Route path="/" element={<HomePage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/services" element={<ServicesPage />} />
        <Route path="/specialities" element={<SpecialitiesPage />} />
        <Route path="/feedback" element={<FeedbackPage />} />
        <Route path="/contact" element={<ContactPage />} />

        {/* Protected Routes - Require authentication */}
        <Route element={<ProtectedRoute allowedRoles={['owner', 'manager']} />}>
          <Route element={<Layout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/invoices" element={<InvoiceList />} />
            <Route path="/stock" element={<StockManager />} />
            <Route path="/ledger" element={<CustomerLedger />} />
            <Route path="/production" element={<ProductionList />} />
            <Route path="/expenses" element={<ExpenseList />} />
            <Route path="/assets" element={<AssetList />} />
            <Route path="/employees" element={<EmployeeList />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
    </AuthProvider>
  );
}

export default App;