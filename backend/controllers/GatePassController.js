const pool = require('../db/pool');

// kind -> which side of the business it covers. 'order' passes are outward
// (a ready sale leaving the gate); 'received' passes are inward (purchased
// goods arriving).
const KINDS = ['order', 'received'];

class GatePassController {
  /**
   * Search records a gate pass can still be generated for, by party name or phone.
   * GET /api/gate-passes/eligible?kind=order|received&search=...
   *   order    -> sales with status 'ready' and no gate pass yet
   *   received -> purchases that aren't cancelled and have no gate pass yet
   */
  static async searchEligible(req, res) {
    try {
      const { kind, search = '' } = req.query;
      if (!KINDS.includes(kind)) {
        return res.status(400).json({ error: 'kind must be "order" or "received"' });
      }
      const term = `%${search.trim()}%`;

      const result = kind === 'order'
        ? await pool.query(
          `SELECT s.id, s.sale_no AS ref_no, s.customer_name AS party_name, s.phone, s.address,
                  s.total_amount, s.status, s.created_at
             FROM sales s
            WHERE s.status = 'ready'
              AND NOT EXISTS (SELECT 1 FROM gate_passes g WHERE g.sale_id = s.id)
              AND (s.customer_name ILIKE $1 OR s.phone ILIKE $1 OR s.sale_no ILIKE $1)
            ORDER BY s.created_at DESC
            LIMIT 20`,
          [term]
        )
        : await pool.query(
          `SELECT p.id, p.purchase_no AS ref_no, p.seller_name AS party_name, p.phone, p.address,
                  p.total_amount, p.status, p.created_at
             FROM purchases p
            WHERE COALESCE(p.status, 'pending') <> 'cancelled'
              AND NOT EXISTS (SELECT 1 FROM gate_passes g WHERE g.purchase_id = p.id)
              AND (p.seller_name ILIKE $1 OR p.phone ILIKE $1 OR p.purchase_no ILIKE $1)
            ORDER BY p.created_at DESC
            LIMIT 20`,
          [term]
        );

      res.json({ success: true, data: result.rows });
    } catch (error) {
      console.error('❌ Error searching gate pass records:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Generate a gate pass for a sale (kind 'order') or purchase (kind 'received').
   * An order gate pass moves the sale from 'ready' to 'delivered'; a received
   * gate pass moves a still-'pending' purchase to 'received'.
   * POST /api/gate-passes  { kind, ref_id, vehicle_no, driver_name, notes }
   */
  static async createGatePass(req, res) {
    const { kind, ref_id, vehicle_no, driver_name, notes } = req.body;
    if (!KINDS.includes(kind) || !ref_id) {
      return res.status(400).json({ error: 'kind and ref_id are required' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      let party;
      if (kind === 'order') {
        const saleResult = await client.query(
          'SELECT id, customer_name AS party_name, phone, address, status FROM sales WHERE id = $1 FOR UPDATE',
          [ref_id]
        );
        party = saleResult.rows[0];
        if (!party) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: 'Sale not found' });
        }
        if (party.status !== 'ready') {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: `Sale is "${party.status}" — only ready sales can get a gate pass` });
        }
      } else {
        const purchaseResult = await client.query(
          'SELECT id, seller_name AS party_name, phone, address, status FROM purchases WHERE id = $1 FOR UPDATE',
          [ref_id]
        );
        party = purchaseResult.rows[0];
        if (!party) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: 'Purchase not found' });
        }
        if (party.status === 'cancelled') {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Purchase is cancelled' });
        }
      }

      const idResult = await client.query(
        "SELECT nextval(pg_get_serial_sequence('gate_passes', 'id')) AS id"
      );
      const id = Number(idResult.rows[0].id);
      const gatePassNo = `GP-${kind === 'order' ? 'OUT' : 'IN'}-${String(id).padStart(5, '0')}`;

      const insertResult = await client.query(
        `INSERT INTO gate_passes (id, gate_pass_no, kind, sale_id, purchase_id, party_name, phone, address,
                                  vehicle_no, driver_name, notes, created_by, created_by_name)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING *`,
        [
          id, gatePassNo, kind,
          kind === 'order' ? ref_id : null,
          kind === 'received' ? ref_id : null,
          party.party_name, party.phone, party.address,
          vehicle_no || null, driver_name || null, notes || null,
          req.user?.id || null, req.user?.username || null
        ]
      );

      if (kind === 'order') {
        await client.query(
          "UPDATE sales SET status = 'delivered', updated_at = NOW() WHERE id = $1",
          [ref_id]
        );
      } else if (party.status !== 'received') {
        await client.query(
          "UPDATE purchases SET status = 'received', updated_at = NOW() WHERE id = $1",
          [ref_id]
        );
      }

      await client.query('COMMIT');
      res.status(201).json({ success: true, data: insertResult.rows[0] });
    } catch (error) {
      await client.query('ROLLBACK');
      // Unique index on sale_id/purchase_id — two people generating at once
      if (error.code === '23505') {
        return res.status(409).json({ error: 'A gate pass already exists for this record' });
      }
      console.error('❌ Error creating gate pass:', error);
      res.status(500).json({ error: error.message });
    } finally {
      client.release();
    }
  }

  /**
   * Get a gate pass with its source record and items
   * GET /api/gate-passes/:id
   */
  static async getGatePass(req, res) {
    try {
      const { id } = req.params;
      const gpResult = await pool.query('SELECT * FROM gate_passes WHERE id = $1', [id]);
      const gatePass = gpResult.rows[0];
      if (!gatePass) {
        return res.status(404).json({ error: 'Gate pass not found' });
      }

      const [refResult, itemsResult] = gatePass.kind === 'order'
        ? await Promise.all([
          pool.query('SELECT sale_no AS ref_no, created_at FROM sales WHERE id = $1', [gatePass.sale_id]),
          pool.query('SELECT product_name, quantity FROM sale_items WHERE sale_id = $1 ORDER BY id', [gatePass.sale_id])
        ])
        : await Promise.all([
          pool.query('SELECT purchase_no AS ref_no, category, type, created_at FROM purchases WHERE id = $1', [gatePass.purchase_id]),
          pool.query(
            'SELECT COALESCE(product_name, description) AS product_name, quantity FROM purchase_items WHERE purchase_id = $1 ORDER BY id',
            [gatePass.purchase_id]
          )
        ]);

      res.json({
        success: true,
        data: {
          gatePass,
          reference: refResult.rows[0] || null,
          items: itemsResult.rows
        }
      });
    } catch (error) {
      console.error('❌ Error fetching gate pass:', error);
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = GatePassController;
