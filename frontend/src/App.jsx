import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import ProtectedRoute from './components/ProtectedRoute';

import Layout from './components/Layout';
// HomePage stays a static import — it's the landing page nearly every first
// visit hits, so eagerly bundling it avoids paying a chunk round-trip on the
// most common entry point. Everything else below is route-level code
// splitting: business modules pull in heavy, page-specific libraries
// (xlsx, jspdf, html2canvas-pro, react-to-print) that previously shipped to
// every visitor regardless of which page they used.
import HomePage from './pages/HomePage';

const RoleDashboard = lazy(() => import('./components/RoleDashboard'));
const Analytics = lazy(() => import('./components/Analytics'));
const StockManager = lazy(() => import('./components/StockManager'));
const ProductsManager = lazy(() => import('./components/ProductsManager'));
const CustomerLedger = lazy(() => import('./components/Sales/Ledger/CustomerLedger'));
const PurchaseLedger = lazy(() => import('./components/Purchase/PLedger/PurchaseLedger'));
const RawMaterialsList = lazy(() => import('./components/RawMaterials/RawMaterialsList'));
const ProductionList = lazy(() => import('./components/ProductionList'));
const ExpenseList = lazy(() => import('./components/Expenses/ExpenseList'));
const AssetList = lazy(() => import('./components/Assets/AssetList'));
const EmployeeList = lazy(() => import('./components/Employees/EmployeeList'));
const Cashbook = lazy(() => import('./components/Cashbook'));
const Reports = lazy(() => import('./components/Reports/Reports.jsx'));
const Privacy = lazy(() => import('./components/Privacy/Privacy.jsx'));

// Public Pages
const AboutPage = lazy(() => import('./pages/AboutPage'));
const ServicesPage = lazy(() => import('./pages/ServicesPage'));
const SpecialitiesPage = lazy(() => import('./pages/SpecialitiesPage'));
const FeedbackPage = lazy(() => import('./pages/FeedbackPage'));
const ContactPage = lazy(() => import('./pages/ContactPage'));

function App() {
  return (
    <ThemeProvider>
    <AuthProvider>
    <BrowserRouter>
      <Suspense fallback={<div className="flex items-center justify-center min-h-screen text-sm text-gray-500">Loading…</div>}>
      <Routes>
        {/* Public Routes - Accessible to everyone */}
        <Route path="/" element={<HomePage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/services" element={<ServicesPage />} />
        <Route path="/specialities" element={<SpecialitiesPage />} />
        <Route path="/feedback" element={<FeedbackPage />} />
        <Route path="/contact" element={<ContactPage />} />

        {/* Protected Routes - Require authentication. Guest now has the same
            page access as Manager (Layout's click-blocker makes every action
            on those pages a no-op for Guest — see components/Layout.jsx) —
            only the innermost Owner-only group stays off-limits to both. */}
        <Route element={<ProtectedRoute allowedRoles={['owner', 'manager', 'guest']} />}>
          <Route element={<Layout />}>
            <Route path="/dashboard" element={<RoleDashboard />} />
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
      </Routes>
      </Suspense>
    </BrowserRouter>
    </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
