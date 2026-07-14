// ─── PRINTABLE INVOICE COMPONENT ───────────────────────────
export default function InvoicePDF({ invoice }) {
  if (!invoice) return null;
  const date = new Date(invoice.created_at).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric'
  });

  return (
    <div style={pdf.page}>
      {/* Background shapes */}
      <div style={pdf.shapeTL} />
      <div style={pdf.shapeBL} />

      {/* Header */}
      <div style={pdf.header}>
        <div style={pdf.invoiceTitle}>INVOICE</div>
        <div style={pdf.company}>
          <div style={pdf.logo}>❯❯</div>
          <strong>Bin-Zahid & Partners</strong>
          <div>Ittefaq Builders</div>
          <div>Tel: +123-456-7890</div>
        </div>
      </div>

      {/* Meta */}
      <div style={pdf.meta}>
        <div>
          <div style={pdf.metaRow}><b>Invoice No:</b> {invoice.invoice_no}</div>
          <div style={pdf.metaRow}><b>Bill to:</b> {invoice.client_name}</div>
          <div style={pdf.metaRow}><b>Address:</b> {invoice.address}</div>
        </div>
        <div>
          <div style={pdf.metaRow}><b>Date:</b> {date}</div>
          <div style={pdf.metaRow}><b>Phone no.</b> {invoice.phone}</div>
        </div>
      </div>

      {/* Items Table */}
      <table style={pdf.table}>
        <thead>
          <tr>
            <th style={pdf.th}>Item</th>
            <th style={pdf.th}>Description</th>
            <th style={pdf.th}>Price</th>
            <th style={pdf.th}>Qty</th>
            <th style={{ ...pdf.th, textAlign: 'right' }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {(invoice.items || []).map((item, i) => (
            <tr key={item.id}>
              <td style={pdf.td}>{i + 1}.</td>
              <td style={pdf.td}>{item.description}</td>
              <td style={pdf.td}>pkr{Number(item.price).toFixed(0)}</td>
              <td style={pdf.td}>{item.quantity || 1}</td>
              <td style={{ ...pdf.td, textAlign: 'right' }}>
                pkr{(Number(item.price) * Number(item.quantity || 1)).toFixed(0)}
              </td>
            </tr>
          ))}

          <tr>
            <td colSpan="4" style={{ ...pdf.td, textAlign: 'right', fontWeight: 800, borderBottom: 'none' }}>
              Total
            </td>
            <td style={{ ...pdf.td, textAlign: 'right', fontWeight: 800, borderBottom: 'none' }}>
              pkr{(invoice.items || []).reduce((sum, i) => sum + (Number(i.price) * Number(i.quantity || 1)), 0).toFixed(0)}
            </td>
          </tr>

        </tbody>
      </table>

      {/* Total */}
      <div style={pdf.totalRow}>
        <span style={pdf.totalLabel}>Total</span>
        <span style={pdf.totalAmount}>pkr{Number(invoice.total).toFixed(0)}</span>
      </div>

      {/* Bank */}
      <div style={pdf.bank}>
        <div><b>Bank Name:</b> Olivia Wilson</div>
        <div><b>Bank Account:</b> 0123 4567 8901</div>
      </div>

      {/* Outstanding Balance */}
      {invoice.balance && (
        <div style={{
          marginTop: '1.5rem',
          border: '1px solid #eee',
          borderRadius: 6,
          overflow: 'hidden',
          fontSize: '0.78rem'
        }}>
          <div style={{
            background: '#f9f9f9',
            padding: '0.5rem 1rem',
            fontWeight: 800,
            borderBottom: '1px solid #eee',
            fontSize: '0.8rem'
          }}>
            Account Balance
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr' }}>
            <div style={{ padding: '0.7rem 1rem', borderRight: '1px solid #eee' }}>
              <div style={{ color: '#888', marginBottom: 2 }}>Total Invoiced</div>
              <div style={{ fontWeight: 800, color: '#111' }}>
                pkr{invoice.balance.totalDebit.toFixed(0)}
              </div>
            </div>
            <div style={{ padding: '0.7rem 1rem', borderRight: '1px solid #eee' }}>
              <div style={{ color: '#888', marginBottom: 2 }}>Amount Paid</div>
              <div style={{ fontWeight: 800, color: '#16a34a' }}>
                pkr{invoice.balance.totalCredit.toFixed(0)}
              </div>
            </div>
            <div style={{ padding: '0.7rem 1rem' }}>
              <div style={{ color: '#888', marginBottom: 2 }}>Outstanding Debt</div>
              <div style={{ fontWeight: 800, color: invoice.balance.debt > 0 ? '#dc2626' : '#16a34a' }}>
                pkr{invoice.balance.debt.toFixed(0)}
              </div>
            </div>
          </div>
        </div>
      )}


      {/* Footer */}
      <div style={pdf.footer}>
        If you have any question please contact: hello@reallygreatsite.com
      </div>
    </div>
  );
}

// ─── PDF STYLES ─────────────────────────────────────────────
const pdf = {
  page: { position: 'relative', background: '#fff', color: '#111', fontFamily: 'Georgia, serif', padding: '3rem 3rem 2rem', minHeight: '100vh', overflow: 'hidden' },
  shapeTL: { position: 'absolute', top: 0, left: 0, width: 120, height: 120, background: '#e5e5e5', clipPath: 'polygon(0 0, 100% 0, 0 100%)', opacity: 0.5 },
  shapeBL: { position: 'absolute', top: 40, left: 0, width: 80, height: 80, background: '#d0d0d0', clipPath: 'polygon(0 0, 100% 0, 0 100%)', opacity: 0.4 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' },
  invoiceTitle: { fontSize: '3.5rem', fontWeight: 900, letterSpacing: '-0.02em', color: '#111' },
  company: { textAlign: 'right', fontSize: '0.78rem', color: '#555', lineHeight: 1.7 },
  logo: { fontSize: '1.2rem', fontWeight: 900, color: '#111', marginBottom: '0.2rem' },
  meta: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '2rem', fontSize: '0.82rem', borderTop: '1px solid #ddd', paddingTop: '1rem' },
  metaRow: { marginBottom: '0.3rem' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', marginBottom: '0' },
  th: { borderBottom: '2px solid #111', padding: '0.5rem 0', textAlign: 'left', fontWeight: 700 },
  td: { padding: '0.6rem 0', borderBottom: '1px solid #eee' },
  totalRow: { display: 'flex', justifyContent: 'flex-end', gap: '3rem', borderTop: '2px solid #111', paddingTop: '0.8rem', marginTop: '0', fontSize: '1.1rem', fontWeight: 800 },
  totalLabel: {},
  totalAmount: {},
  bank: { marginTop: '1.5rem', fontSize: '0.8rem', lineHeight: 1.8 },
  footer: { marginTop: '1.5rem', borderTop: '1px solid #eee', paddingTop: '0.8rem', fontSize: '0.7rem', color: '#999', textAlign: 'center' },
};
