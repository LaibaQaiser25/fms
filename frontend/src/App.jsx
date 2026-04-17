import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout       from './components/Layout';
import Dashboard from './components/Dashboard';
import InvoiceList  from './components/InvoiceList';
import InvoiceForm  from './components/InvoiceForm';
import StockManager from './components/StockManager';
import CustomerLedger from './components/CustomerLedger';
import ProductionList from './components/ProductionList';
import ExpenseList from './components/Expenses/ExpenseList';
import AssetList from './components/Assets/AssetList';
import EmployeeList from './components/Employees/EmployeeList';

function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          {/* Dashboard */}
          <Route path="/"       element={<Dashboard />} />
          
          {/* Invoice Routes */}
          <Route path="/invoices"       element={<InvoiceList />} />
          <Route path="/invoices/create" element={<InvoiceForm />} />
          
          {/* Stock Routes */}
          <Route path="/stock"  element={<StockManager />} />
          
          {/* Ledger & Production Routes */}
          <Route path="/ledger" element={<CustomerLedger />} />
          <Route path="/production" element={<ProductionList />} />
          
          {/* Finance Routes */}
          <Route path="/expenses" element={<ExpenseList />} />
          <Route path="/assets" element={<AssetList />} />
          
          {/* HR Routes */}
          <Route path="/employees" element={<EmployeeList />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;