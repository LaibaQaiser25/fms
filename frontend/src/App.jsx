import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout       from './components/Layout';
import InvoiceList  from './components/InvoiceList';
import InvoiceForm  from './components/InvoiceForm';
import StockManager from './components/StockManager';
import Ledger from './components/Ledger';
import ExpenseList from './components/Expenses/ExpenseList';
import AssetList from './components/Assets/AssetList';
import EmployeeList from './components/Employees/EmployeeList';

function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          {/* Invoice Routes */}
          <Route path="/"       element={<InvoiceList />} />
          <Route path="/create" element={<InvoiceForm />} />
          
          {/* Stock Routes */}
          <Route path="/stock"  element={<StockManager />} />
          <Route path="/ledger" element={<Ledger />} />
          
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