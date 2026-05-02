import { BrowserRouter, Routes, Route } from 'react-router-dom';
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
    <BrowserRouter>
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<HomePage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/services" element={<ServicesPage />} />
        <Route path="/specialities" element={<SpecialitiesPage />} />
        <Route path="/feedback" element={<FeedbackPage />} />
        <Route path="/contact" element={<ContactPage />} />

        {/* Dashboard Routes */}
        <Route element={<Layout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/analytics" element={<Analytics />} />
          
          {/* Invoice Routes */}
          <Route path="/invoices" element={<InvoiceList />} />
          
          {/* Stock Routes */}
          <Route path="/stock" element={<StockManager />} />
          
          {/* Ledger & Production Routes */}
          <Route path="/ledger" element={<CustomerLedger />} />
          <Route path="/production" element={<ProductionList />} />
          
          {/* Finance Routes */}
          <Route path="/expenses" element={<ExpenseList />} />
          <Route path="/assets" element={<AssetList />} />
          
          {/* HR Routes */}
          <Route path="/employees" element={<EmployeeList />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;