import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';

import Layout from './components/Layout';
import RoleDashboard from './components/RoleDashboard';
import Analytics from './components/Analytics';
import StockManager from './components/StockManager';
import ProductsManager from './components/ProductsManager';
import CustomerLedger from './components/Sales/Ledger/CustomerLedger';
import PurchaseLedger from './components/Purchase/PLedger/PurchaseLedger';
import RawMaterialsList from './components/RawMaterials/RawMaterialsList';
import ProductionList from './components/ProductionList';
import ExpenseList from './components/Expenses/ExpenseList';
import AssetList from './components/Assets/AssetList';
import EmployeeList from './components/Employees/EmployeeList';
import Cashbook from './components/Cashbook';
import Reports from './components/Reports/Reports.jsx';
import Privacy from './components/Privacy/Privacy.jsx';

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

        {/* Protected Routes - Require authentication. Guest is dashboard-only:
            it's allowed through this outer gate (so /dashboard works) but the
            nested ProtectedRoute below excludes it from every other route,
            and ProtectedRoute redirects a denied role back to /dashboard. */}
        <Route element={<ProtectedRoute allowedRoles={['owner', 'manager', 'guest']} />}>
          <Route element={<Layout />}>
            <Route path="/dashboard" element={<RoleDashboard />} />
            {/* Owner + Manager only — Guest cannot reach any of these */}
            <Route element={<ProtectedRoute allowedRoles={['owner', 'manager']} />}>
              <Route path="/stock" element={<StockManager />} />
              <Route path="/products" element={<ProductsManager />} />
              <Route path="/ledger" element={<CustomerLedger />} />
              <Route path="/purchase-ledger" element={<PurchaseLedger />} />
              <Route path="/raw-materials" element={<RawMaterialsList />} />
              <Route path="/production" element={<ProductionList />} />
              <Route path="/expenses" element={<ExpenseList />} />
              <Route path="/assets" element={<AssetList />} />
              <Route path="/employees" element={<EmployeeList />} />
              {/* Owner-only — Analytics, Cashbook, Reports, and Privacy (user management) are off-limits to Manager and Guest */}
              <Route element={<ProtectedRoute allowedRoles={['owner']} />}>
                <Route path="/analytics" element={<Analytics />} />
                <Route path="/cashbook" element={<Cashbook />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/privacy" element={<Privacy />} />
              </Route>
            </Route>
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
