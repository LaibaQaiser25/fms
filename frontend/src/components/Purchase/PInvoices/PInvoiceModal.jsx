import React, { useState, useEffect, useRef } from 'react';
import { X, Printer, Download, List } from 'lucide-react';
import html2canvas from 'html2canvas-pro';
import jsPDF from 'jspdf';
import * as purchaseInvoiceApi from '../../../api/purchaseInvoiceApi';

function PurchaseInvoiceModal({ invoiceId, onClose }) {
  const [currentInvoiceId, setCurrentInvoiceId] = useState(invoiceId);
  const [invoice, setInvoice] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showInvoiceList, setShowInvoiceList] = useState(false);
  const [sellerInvoices, setSellerInvoices] = useState([]);
  const invoiceContentRef = useRef(null);

  useEffect(() => {
    fetchInvoice();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentInvoiceId]);

  const fetchInvoice = async () => {
    try {
      setLoading(true);
      const response = await purchaseInvoiceApi.getPurchaseInvoice(currentInvoiceId);
      setInvoice(response.data.data.invoice);
      setItems(response.data.data.items || []);

      // Fetch all invoices for this seller for the list
      if (response.data.data.invoice.seller_id) {
        const invoicesResponse = await purchaseInvoiceApi.getSellerInvoices(response.data.data.invoice.seller_id);
        setSellerInvoices(invoicesResponse.data.data || []);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Error loading invoice');
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-PK', {
      style: 'currency',
      currency: 'PKR'
    }).format(amount || 0);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPDF = async () => {
    if (!invoiceContentRef.current) return;
    const canvas = await html2canvas(invoiceContentRef.current, { scale: 2 });
    const imgData = canvas.toDataURL('image/jpeg', 0.98);

    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const pageWidth = pdf.internal.pageSize.getWidth() - 20;
    const pageHeight = pdf.internal.pageSize.getHeight() - 20;
    const imgHeight = (canvas.height * pageWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = 10;

    pdf.addImage(imgData, 'JPEG', 10, position, pageWidth, imgHeight);
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight + 10;
      pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 10, position, pageWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    pdf.save(`${invoice?.invoice_no || 'invoice'}.pdf`);
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--color-accent)]"></div>
          <p className="mt-2 text-gray-600">Loading invoice...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 max-w-md">
          <p className="text-red-600 font-semibold">{error}</p>
          <button
            onClick={onClose}
            className="mt-4 w-full py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 max-w-md">
          <p className="text-gray-600">Invoice not found</p>
          <button
            onClick={onClose}
            className="mt-4 w-full py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 sticky top-0 bg-white">
          <h2 className="text-2xl font-bold text-gray-800">Purchase Invoice</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              title="Print"
              className="p-2 hover:bg-gray-100 rounded transition"
            >
              <Printer className="w-5 h-5 text-gray-700" />
            </button>
            <button
              onClick={handleDownloadPDF}
              title="Download PDF"
              className="p-2 hover:bg-gray-100 rounded transition"
            >
              <Download className="w-5 h-5 text-gray-700" />
            </button>
            <button
              onClick={() => setShowInvoiceList(!showInvoiceList)}
              title="View all invoices"
              className="p-2 hover:bg-gray-100 rounded transition"
            >
              <List className="w-5 h-5 text-gray-700" />
            </button>
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-100 rounded"
            >
              <X className="w-6 h-6 text-gray-600" />
            </button>
          </div>
        </div>

        {/* Invoice List Dropdown */}
        {showInvoiceList && (
          <div className="border-b border-gray-200 bg-gray-50 p-4">
            <h3 className="font-semibold text-gray-800 mb-3">All Invoices for {invoice.seller_name}</h3>
            {sellerInvoices.length <= 1 ? (
              <p className="text-sm text-gray-500">No previous invoices</p>
            ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {sellerInvoices.map(inv => (
                <button
                  key={inv.id}
                  onClick={() => {
                    setCurrentInvoiceId(inv.id);
                    setShowInvoiceList(false);
                  }}
                  className={`p-2 text-left rounded border transition ${
                    inv.id === currentInvoiceId
                      ? 'border-[var(--color-selected)] bg-[var(--color-selected-soft)]'
                      : 'border-gray-300 hover:border-gray-500'
                  }`}
                >
                  <p className="font-semibold text-sm text-gray-800">{inv.invoice_no}</p>
                  <p className="text-xs text-gray-600">{new Date(inv.created_at).toLocaleDateString()}</p>
                </button>
              ))}
            </div>
            )}
          </div>
        )}

        {/* Invoice Content — hidden while the invoice list is open, so the list is all that shows */}
        {!showInvoiceList && (
        <div ref={invoiceContentRef} className="p-8 print:p-0">
          {/* Company Header */}
          <div className="flex items-start justify-between mb-8 pb-8 border-b-2 border-gray-900">
            <div>
              <h1 className="text-4xl font-bold text-gray-900">PURCHASE INVOICE</h1>
            </div>
            <div className="text-right">
              <p className="font-bold text-gray-900">Bin-Zahid & Partners</p>
              <p className="text-sm text-gray-700">Sugar Mill Road, Near Kuthiala Sayedan, Mandi Bahauddin</p>
              <p className="text-sm text-gray-700">Tel: +92 345 7579505</p>
            </div>
          </div>

          {/* Invoice Details */}
          <div className="grid grid-cols-2 gap-8 mb-8">
            <div>
              <p className="text-sm font-semibold text-gray-700">Invoice No: <span className="font-bold text-gray-900">{invoice.invoice_no}</span></p>
              <p className="text-sm font-semibold text-gray-700">Seller: <span className="font-bold text-gray-900">{invoice.seller_name}</span></p>
              <p className="text-sm font-semibold text-gray-700">Address: <span className="font-bold text-gray-900">{invoice.address || 'N/A'}</span></p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-gray-700">Date: <span className="font-bold text-gray-900">{new Date(invoice.created_at).toLocaleDateString()}</span></p>
              <p className="text-sm font-semibold text-gray-700">Phone no. <span className="font-bold text-gray-900">{invoice.phone || 'N/A'}</span></p>
            </div>
          </div>

          {/* Items Table */}
          <div className="mb-8">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b-2 border-t-2 border-gray-900">
                  <th className="text-left py-3 px-4 font-semibold text-gray-900">Item</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-900">Description</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-900">Price</th>
                  <th className="text-center py-3 px-4 font-semibold text-gray-900">Qty</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-900">Amount</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr key={idx} className="border-b border-gray-200">
                    <td className="py-3 px-4 text-gray-900">{idx + 1}.</td>
                    <td className="py-3 px-4 text-gray-700">{item.product_name}</td>
                    <td className="py-3 px-4 text-right text-gray-700">{formatCurrency(item.price)}</td>
                    <td className="py-3 px-4 text-center text-gray-700">{item.quantity}</td>
                    <td className="py-3 px-4 text-right text-gray-700">{formatCurrency(item.amount || item.quantity * item.price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div></div>
            <div className="text-right">
              <p className="py-1 font-semibold text-gray-900">Total</p>
              <div className="border-t-2 border-gray-900 pt-1 mt-1">
                <p className="py-1 font-bold text-xl text-gray-900">{formatCurrency(invoice.total_amount)}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="py-1 font-semibold text-gray-900">{formatCurrency(invoice.total_amount)}</p>
              <div className="border-t-2 border-gray-900 pt-1 mt-1">
                <p className="py-1 font-bold text-xl text-gray-900">{formatCurrency(invoice.total_amount)}</p>
              </div>
            </div>
          </div>

          {/* Payment Method */}
          <div className="mb-8 pb-8 border-b-2 border-gray-900">
            <p className="text-sm font-semibold text-gray-900">Payment Method: <span className="text-gray-700">{invoice.payment_type || 'N/A'}</span></p>
            {invoice.payment_type === 'Bank Transfer' && invoice.bank_name && (
              <p className="text-sm font-semibold text-gray-900">Bank: <span className="text-gray-700">{invoice.bank_name}</span></p>
            )}
          </div>

          {/* Account Balance */}
          <div className="bg-gray-50 p-4 rounded border border-gray-300 mb-8">
            <h3 className="font-semibold text-gray-900 mb-3">Account Balance</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-gray-700">Total Invoiced</p>
                <p className="text-xl font-bold text-gray-900">{formatCurrency(invoice.total_amount)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-700">Amount Paid</p>
                <p className="text-xl font-bold text-gray-900">{formatCurrency(invoice.advance_paid)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-700">Outstanding Debt</p>
                <p className="text-xl font-bold text-red-600">{formatCurrency(invoice.outstanding_debt)}</p>
              </div>
            </div>
          </div>

          {/* Footer */}
          <p className="text-center text-xs text-gray-600">If you have any question please contact: nasir_mirza202@yahoo.com</p>
        </div>
        )}

        {/* Action Buttons */}
        {!showInvoiceList && (
        <div className="flex gap-2 p-6 border-t border-gray-200 bg-gray-50 print:hidden">
          <button
            onClick={onClose}
            className="flex-1 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition font-semibold"
          >
            Close
          </button>
          <button
            onClick={handlePrint}
            className="flex-1 py-2 bg-[var(--color-accent)] text-white rounded-lg hover:bg-[var(--color-accent-hover)] transition font-semibold flex items-center justify-center gap-2"
          >
            <Printer className="w-4 h-4" />
            Print
          </button>
        </div>
        )}
      </div>
    </div>
  );
}

export default PurchaseInvoiceModal;
