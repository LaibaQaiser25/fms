import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
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
const HomePage = lazy(() => import('./pages/HomePage'));
const AboutPage = lazy(() => import('./pages/AboutPage'));
const ServicesPage = lazy(() => import('./pages/ServicesPage'));
const SpecialitiesPage = lazy(() => import('./pages/SpecialitiesPage'));
const FeedbackPage = lazy(() => import('./pages/FeedbackPage'));
const ContactPage = lazy(() => import('./pages/ContactPage'));

const lazyRoute = (Component) => (
  <Suspense fallback={null}>
    <Component />
  </Suspense>
);

function App() {
  return (
    <ThemeProvider>
    <AuthProvider>
    <BrowserRouter>
      <Routes>
        {/* Public Routes - Accessible to everyone */}
        <Route path="/" element={lazyRoute(HomePage)} />
        <Route path="/about" element={lazyRoute(AboutPage)} />
        <Route path="/services" element={lazyRoute(ServicesPage)} />
        <Route path="/specialities" element={lazyRoute(SpecialitiesPage)} />
        <Route path="/feedback" element={lazyRoute(FeedbackPage)} />
        <Route path="/contact" element={lazyRoute(ContactPage)} />

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
    </BrowserRouter>
    </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
