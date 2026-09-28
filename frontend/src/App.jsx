import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { SocketProvider } from './context/SocketContext';
import ProtectedRoute from './components/ProtectedRoute';
import { APP_URL, SITE } from './config';

import Layout from './components/Layout';
const RoleDashboard = lazy(() => import('./components/RoleDashboard'));
const Analytics = lazy(() => import('./components/Analytics'));
const StockManager = lazy(() => import('./components/StockManager'));
const ProductsManager = lazy(() => import('./components/ProductsManager'));
const CustomerLedger = lazy(() => import('./components/Sales/Ledger/CustomerLedger'));
const PurchaseLedger = lazy(() => import('./components/Purchase/PLedger/PurchaseLedger'));
const OrdersList = lazy(() => import('./components/Sales/OrdersList'));
const RawMaterialsList = lazy(() => import('./components/RawMaterials/RawMaterialsList'));
const ProductionList = lazy(() => import('./components/ProductionList'));
const ExpenseList = lazy(() => import('./components/Expenses/ExpenseList'));
const AssetList = lazy(() => import('./components/Assets/AssetList'));
const EmployeeList = lazy(() => import('./components/Employees/EmployeeList'));
const Cashbook = lazy(() => import('./components/Cashbook'));
const Reports = lazy(() => import('./components/Reports/Reports.jsx'));
const Privacy = lazy(() => import('./components/Privacy/Privacy.jsx'));

// Public Pages
const HomePage = lazy(() => import('./pages/HomePage'));
const AboutPage = lazy(() => import('./pages/AboutPage'));
const ServicesPage = lazy(() => import('./pages/ServicesPage'));
const SpecialitiesPage = lazy(() => import('./pages/SpecialitiesPage'));
const FeedbackPage = lazy(() => import('./pages/FeedbackPage'));
const ContactPage = lazy(() => import('./pages/ContactPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));

// Full-page redirect (different origin, so not a router <Navigate>) keeping
// the path, query and hash — e.g. ittefaqbuilder.com/ledger?customerId=3.
const RedirectToApp = () => {
  const { pathname, search, hash } = window.location;
  window.location.replace(`${APP_URL}${pathname}${search}${hash}`);
  return null;
};

const PageLoadingFallback = () => (
  <div className="text-center py-8">
    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--color-accent)]"></div>
    <p className="mt-2 text-gray-600">Loading...</p>
  </div>
);

const lazyRoute = (Component, fallback = null) => (
  <Suspense fallback={fallback}>
    <Component />
  </Suspense>
);

function App() {
  return (
    <ThemeProvider>
    <AuthProvider>
    <SocketProvider>
    <BrowserRouter>
      <Routes>
        {/* Which routes exist depends on the domain — see SITE in config.js. */}
        {SITE !== 'app' && (
          <>
            {/* Public Routes - Accessible to everyone */}
            <Route path="/" element={lazyRoute(HomePage)} />
            <Route path="/about" element={lazyRoute(AboutPage)} />
            <Route path="/services" element={lazyRoute(ServicesPage)} />
            <Route path="/specialities" element={lazyRoute(SpecialitiesPage)} />
            <Route path="/feedback" element={lazyRoute(FeedbackPage)} />
            <Route path="/contact" element={lazyRoute(ContactPage)} />
          </>
        )}

        {/* Public site has no dashboard: anything else (old /dashboard
            bookmarks, /login, …) goes to the same path on the app domain. */}
        {SITE === 'public' && <Route path="*" element={<RedirectToApp />} />}

        {/* App domain has no public pages — "/" and unknown paths go to login
            (which forwards to /dashboard when already signed in). */}
        {SITE === 'app' && <Route path="*" element={<Navigate to="/login" replace />} />}
        {SITE !== 'public' && <Route path="/login" element={lazyRoute(LoginPage)} />}

        {/* Protected Routes - Require authentication. Guest now has the same
            page access as Manager (Layout's click-blocker makes every action
            on those pages a no-op for Guest — see components/Layout.jsx) —
            only the innermost Owner-only group stays off-limits to both. */}
        {SITE !== 'public' && (
          <Route element={<ProtectedRoute allowedRoles={['owner', 'manager', 'guest']} />}>
            <Route element={<Layout />}>
              <Route path="/dashboard" element={lazyRoute(RoleDashboard, <PageLoadingFallback />)} />
              <Route path="/stock" element={lazyRoute(StockManager, <PageLoadingFallback />)} />
              <Route path="/products" element={lazyRoute(ProductsManager, <PageLoadingFallback />)} />
              <Route path="/ledger" element={lazyRoute(CustomerLedger, <PageLoadingFallback />)} />
              <Route path="/orders" element={lazyRoute(OrdersList, <PageLoadingFallback />)} />
              <Route path="/purchase-ledger" element={lazyRoute(PurchaseLedger, <PageLoadingFallback />)} />
              <Route path="/raw-materials" element={lazyRoute(RawMaterialsList, <PageLoadingFallback />)} />
              <Route path="/production" element={lazyRoute(ProductionList, <PageLoadingFallback />)} />
              <Route path="/expenses" element={lazyRoute(ExpenseList, <PageLoadingFallback />)} />
              <Route path="/assets" element={lazyRoute(AssetList, <PageLoadingFallback />)} />
              <Route path="/employees" element={lazyRoute(EmployeeList, <PageLoadingFallback />)} />
              {/* Owner-only — Analytics, Cashbook, Reports, and Privacy (user management) are off-limits to Manager and Guest */}
              <Route element={<ProtectedRoute allowedRoles={['owner']} />}>
                <Route path="/analytics" element={lazyRoute(Analytics, <PageLoadingFallback />)} />
                <Route path="/cashbook" element={lazyRoute(Cashbook, <PageLoadingFallback />)} />
                <Route path="/reports" element={lazyRoute(Reports, <PageLoadingFallback />)} />
                <Route path="/privacy" element={lazyRoute(Privacy, <PageLoadingFallback />)} />
              </Route>
            </Route>
          </Route>
        )}
      </Routes>
    </BrowserRouter>
    </SocketProvider>
    </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
