// const pool = require('../db/pool');
// const crypto = require('crypto');

// class PurchaseController {
//   static generateUniqueId(prefix) {
//     const timestamp = Date.now();
//     const random = crypto.randomBytes(4).toString('hex').substring(0, 6);
//     return `${prefix}-${timestamp}-${random}`;
//   }

//   static async createPurchase(req, res) {
//     const client = await pool.connect();

//     try {
//       const {
//         seller_name,
//         phone,
//         address,
//         category,
//         type,
//         items,
//         total_amount,
//         advance_paid,
//         payment_type,
//         notes
//       } = req.body;

//       if (!seller_name || !category || !items || items.length === 0 || !total_amount) {
//         return res.status(400).json({ error: 'Missing required fields' });
//       }

//       const validCategories = ['stock-ready', 'raw-material'];
//       const validTypes = ['truck', 'bag'];

//       if (!validCategories.includes(category)) {
//         return res.status(400).json({ error: 'Invalid category' });
//       }

//       if (type && !validTypes.includes(type)) {
//         return res.status(400).json({ error: 'Invalid type' });
//       }

//       await client.query('BEGIN');

//       const sellerResult = await client.query(
//         `SELECT id
//          FROM sellers
//          WHERE name = $1
//            AND COALESCE(phone, '') = COALESCE($2, '')
//          LIMIT 1`,
//         [seller_name.trim(), phone || '']
//       );

//       let sellerId;
//       if (sellerResult.rows.length > 0) {
//         sellerId = sellerResult.rows[0].id;
//       } else {
//         const newSellerResult = await client.query(
//           `INSERT INTO sellers (name, phone, address, email)
//            VALUES ($1, $2, $3, $4)
//            RETURNING id`,
//           [seller_name.trim(), phone || null, address || null, null]
//         );
//         sellerId = newSellerResult.rows[0].id;
//       }

//       const purchaseNo = PurchaseController.generateUniqueId('PUR');
//       const balance = Number(total_amount) - Number(advance_paid || 0);

//       const purchaseResult = await client.query(
//         `INSERT INTO purchases (
//           purchase_no,
//           seller_id,
//           seller_name,
//           phone,
//           address,
//           category,
//           type,
//           total_amount,
//           advance_paid,
//           balance,
//           payment_type,
//           status,
//           notes
//         )
//          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
//          RETURNING *`,
//         [
//           purchaseNo,
//           sellerId,
//           seller_name.trim(),
//           phone || null,
//           address || null,
//           category,
//           type || null,
//           Number(total_amount),
//           Number(advance_paid || 0),
//           balance,
//           payment_type || 'Cash',
//           'pending',
//           notes || null
//         ]
//       );

//       const purchaseId = purchaseResult.rows[0].id;

//       for (const item of items) {
//         const itemAmount = Number(item.quantity || 0) * Number(item.price || 0);
//         await client.query(
//           `INSERT INTO purchase_items (purchase_id, description, price, quantity, stock_id, product_name, amount)
//            VALUES ($1, $2, $3, $4, $5, $6, $7)`,
//           [
//             purchaseId,
//             item.description || item.product_name || '',
//             Number(item.price || 0),
//             Number(item.quantity || 0),
//             item.stock_id || null,
//             item.product_name || item.description || '',
//             itemAmount
//           ]
//         );
//       }

//       const invoiceNo = PurchaseController.generateUniqueId('INV');
//       await client.query(
//         `INSERT INTO purchase_invoices (
//           invoice_no,
//           seller_id,
//           seller_name,
//           phone,
//           address,
//           total_amount,
//           advance_paid,
//           outstanding_debt,
//           status,
//           invoice_type,
//           purchase_id,
//           created_at
//         )
//          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'purchase', $10, NOW())`,
//         [
//           invoiceNo,
//           sellerId,
//           seller_name.trim(),
//           phone || null,
//           address || null,
//           Number(total_amount),
//           Number(advance_paid || 0),
//           balance,
//           'unpaid',
//           purchaseId
//         ]
//       );

//       await client.query(
//         `INSERT INTO purchase_ledger (
//           seller_id,
//           seller_name,
//           purchase_id,
//           invoice_no,
//           debit,
//           credit,
//           debt,
//           note,
//           transaction_type,
//           created_at
//         )
//          VALUES ($1, $2, $3, $4, $5, $6, $7, 'New purchase created', 'purchase', NOW())`,
//         [
//           sellerId,
//           seller_name.trim(),
//           purchaseId,
//           invoiceNo,
//           Number(total_amount),
//           Number(advance_paid || 0),
//           balance
//         ]
//       );

//       await client.query('COMMIT');

//       res.status(201).json({
//         success: true,
//         message: 'Purchase created successfully',
//         data: {
//           purchase: purchaseResult.rows[0],
//           purchaseNo,
//           invoiceNo
//         }
//       });
//     } catch (error) {
//       await client.query('ROLLBACK');
//       console.error('❌ Error creating purchase:', error);
//       res.status(500).json({ error: error.message });
//     } finally {
//       client.release();
//     }
//   }

//   static async getAllPurchases(req, res) {
//     try {
//       const { page = 1, limit = 10 } = req.query;
//       const offset = (page - 1) * limit;

//       const result = await pool.query(
//         `SELECT *
//          FROM purchases
//          ORDER BY created_at DESC
//          LIMIT $1 OFFSET $2`,
//         [limit, offset]
//       );

//       const countResult = await pool.query('SELECT COUNT(*) FROM purchases');
//       const total = parseInt(countResult.rows[0].count, 10);

//       res.json({
//         success: true,
//         data: result.rows,
//         pagination: {
//           page: parseInt(page, 10),
//           limit: parseInt(limit, 10),
//           total,
//           pages: Math.ceil(total / limit)
//         }
//       });
//     } catch (error) {
//       console.error('❌ Error fetching purchases:', error);
//       res.status(500).json({ error: error.message });
//     }
//   }

//   static async getPurchaseInvoices(req, res) {
//     try {
//       const { page = 1, limit = 10 } = req.query;
//       const offset = (page - 1) * limit;

//       const result = await pool.query(
//         `SELECT *
//          FROM purchase_invoices
//          ORDER BY created_at DESC
//          LIMIT $1 OFFSET $2`,
//         [limit, offset]
//       );

//       const countResult = await pool.query('SELECT COUNT(*) FROM purchase_invoices');
//       const total = parseInt(countResult.rows[0].count, 10);

//       res.json({
//         success: true,
//         data: result.rows,
//         pagination: {
//           page: parseInt(page, 10),
//           limit: parseInt(limit, 10),
//           total,
//           pages: Math.ceil(total / limit)
//         }
//       });
//     } catch (error) {
//       console.error('❌ Error fetching purchase invoices:', error);
//       res.status(500).json({ error: error.message });
//     }
//   }

//   static async getPurchaseInvoiceById(req, res) {
//     try {
//       const { id } = req.params;
//       const invoiceResult = await pool.query('SELECT * FROM purchase_invoices WHERE id = $1', [id]);

//       if (invoiceResult.rows.length === 0) {
//         return res.status(404).json({ error: 'Purchase invoice not found' });
//       }

//       res.json({
//         success: true,
//         data: invoiceResult.rows[0]
//       });
//     } catch (error) {
//       console.error('❌ Error fetching purchase invoice:', error);
//       res.status(500).json({ error: error.message });
//     }
//   }

//   static async recordPurchasePayment(req, res) {
//     const client = await pool.connect();

//     try {
//       const {
//         seller_id,
//         seller_name,
//         purchase_id,
//         invoice_id,
//         payment_amount,
//         payment_type,
//         notes
//       } = req.body;

//       if (!seller_id || payment_amount === undefined) {
//         return res.status(400).json({ error: 'Missing required fields' });
//       }

//       await client.query('BEGIN');

//       const paymentResult = await client.query(
//         `INSERT INTO purchase_payment_records (
//           seller_id,
//           seller_name,
//           purchase_id,
//           invoice_id,
//           payment_amount,
//           payment_type,
//           notes,
//           created_at
//         )
//          VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
//          RETURNING *`,
//         [
//           seller_id,
//           seller_name || null,
//           purchase_id || null,
//           invoice_id || null,
//           Number(payment_amount),
//           payment_type || null,
//           notes || null
//         ]
//       );

//       let updatedBalance = null;
//       if (purchase_id) {
//         const purchaseResult = await client.query(
//           'SELECT balance FROM purchases WHERE id = $1',
//           [purchase_id]
//         );

//         if (purchaseResult.rows.length > 0) {
//           updatedBalance = Number(purchaseResult.rows[0].balance) - Number(payment_amount);
//           updatedBalance = Math.max(0, updatedBalance);

//           await client.query(
//             'UPDATE purchases SET balance = $1, updated_at = NOW() WHERE id = $2',
//             [updatedBalance, purchase_id]
//           );
//         }
//       }

//       let invoiceNo = null;
//       if (invoice_id) {
//         const invoiceResult = await client.query(
//           'SELECT invoice_no FROM purchase_invoices WHERE id = $1',
//           [invoice_id]
//         );

//         if (invoiceResult.rows.length > 0) {
//           invoiceNo = invoiceResult.rows[0].invoice_no;
//         }
//       }

//       await client.query(
//         `INSERT INTO purchase_ledger (
//           seller_id,
//           seller_name,
//           purchase_id,
//           invoice_no,
//           debit,
//           credit,
//           debt,
//           transaction_type,
//           note,
//           created_at
//         )
//          VALUES ($1, $2, $3, $4, 0, $5, $6, 'payment', $7, NOW())`,
//         [
//           seller_id,
//           seller_name || null,
//           purchase_id || null,
//           invoiceNo,
//           Number(payment_amount),
//           updatedBalance,
//           `Payment recorded: ${payment_type || 'Unknown'}`
//         ]
//       );

//       await client.query('COMMIT');

//       res.status(201).json({
//         success: true,
//         message: 'Purchase payment recorded successfully',
//         data: {
//           payment: paymentResult.rows[0],
//           updatedBalance
//         }
//       });
//     } catch (error) {
//       await client.query('ROLLBACK');
//       console.error('❌ Error recording purchase payment:', error);
//       res.status(500).json({ error: error.message });
//     } finally {
//       client.release();
//     }
//   }

//   static async getPurchasePayments(req, res) {
//     try {
//       const { seller_id } = req.params;
//       const result = await pool.query(
//         `SELECT *
//          FROM purchase_payment_records
//          WHERE seller_id = $1
//          ORDER BY created_at DESC`,
//         [seller_id]
//       );

//       res.json({
//         success: true,
//         data: result.rows
//       });
//     } catch (error) {
//       console.error('❌ Error fetching purchase payments:', error);
//       res.status(500).json({ error: error.message });
//     }
//   }

//   static async getPurchaseLedger(req, res) {
//     try {
//       const { seller_id } = req.params;
//       const result = await pool.query(
//         `SELECT *
//          FROM purchase_ledger
//          WHERE seller_id = $1
//          ORDER BY created_at DESC`,
//         [seller_id]
//       );

//       res.json({
//         success: true,
//         data: result.rows
//       });
//     } catch (error) {
//       console.error('❌ Error fetching purchase ledger:', error);
//       res.status(500).json({ error: error.message });
//     }
//   }

//   static async getPurchase(req, res) {
//     try {
//       const { id } = req.params;
//       const purchaseResult = await pool.query('SELECT * FROM purchases WHERE id = $1', [id]);

//       if (purchaseResult.rows.length === 0) {
//         return res.status(404).json({ error: 'Purchase not found' });
//       }

//       const itemsResult = await pool.query('SELECT * FROM purchase_items WHERE purchase_id = $1', [id]);

//       res.json({
//         success: true,
//         data: {
//           purchase: purchaseResult.rows[0],
//           items: itemsResult.rows
//         }
//       });
//     } catch (error) {
//       console.error('❌ Error fetching purchase:', error);
//       res.status(500).json({ error: error.message });
//     }
//   }

//   static async updatePurchase(req, res) {
//     try {
//       const { id } = req.params;
//       const {
//         seller_name,
//         phone,
//         address,
//         category,
//         type,
//         total_amount,
//         advance_paid,
//         payment_type,
//         status,
//         notes
//       } = req.body;

//       const balance = total_amount !== undefined && advance_paid !== undefined
//         ? Number(total_amount) - Number(advance_paid)
//         : null;

//       const result = await pool.query(
//         `UPDATE purchases
//          SET seller_name = COALESCE($1, seller_name),
//              phone = COALESCE($2, phone),
//              address = COALESCE($3, address),
//              category = COALESCE($4, category),
//              type = COALESCE($5, type),
//              total_amount = COALESCE($6, total_amount),
//              advance_paid = COALESCE($7, advance_paid),
//              balance = COALESCE($8, balance),
//              payment_type = COALESCE($9, payment_type),
//              status = COALESCE($10, status),
//              notes = COALESCE($11, notes),
//              updated_at = NOW()
//          WHERE id = $12
//          RETURNING *`,
//         [seller_name, phone, address, category, type, total_amount, advance_paid, balance, payment_type, status, notes, id]
//       );

//       if (result.rows.length === 0) {
//         return res.status(404).json({ error: 'Purchase not found' });
//       }

//       res.json({
//         success: true,
//         message: 'Purchase updated successfully',
//         data: result.rows[0]
//       });
//     } catch (error) {
//       console.error('❌ Error updating purchase:', error);
//       res.status(500).json({ error: error.message });
//     }
//   }

//   static async deletePurchase(req, res) {
//     try {
//       const { id } = req.params;
//       const result = await pool.query('DELETE FROM purchases WHERE id = $1 RETURNING *', [id]);

//       if (result.rows.length === 0) {
//         return res.status(404).json({ error: 'Purchase not found' });
//       }

//       res.json({
//         success: true,
//         message: 'Purchase deleted successfully',
//         data: result.rows[0]
//       });
//     } catch (error) {
//       console.error('❌ Error deleting purchase:', error);
//       res.status(500).json({ error: error.message });
//     }
//   }
// }

// module.exports = PurchaseController;


const pool = require('../db/pool');
const crypto = require('crypto');
const { sendWhatsApp } = require('../services/whatsappService');

class PurchaseController {
  /**
   * Generate a truly unique ID with timestamp + random + counter
   */
  static generateUniqueId(prefix) {
    const timestamp = Date.now();
    const random = crypto.randomBytes(4).toString('hex').substring(0, 6);
    return `${prefix}-${timestamp}-${random}`;
  }

  /**
   * Create a new purchase with invoice and ledger entry
   * POST /api/purchase
   * Body: { seller_id, seller_name, phone, address, category, type, items, total_amount, advance_paid, payment_type, notes }
   * - category: 'stock-ready' | 'raw-material'
   * - type: 'truck' | 'bag' (optional)
   *
   * Unlike a sale (which decreases stock), a purchase increases stock —
   * but only for category = 'stock-ready'. 'raw-material' purchases feed
   * production, not sellable stock, so they never touch the stock table.
   */
  static async createPurchase(req, res) {
    const client = await pool.connect();
    try {
      const { seller_id, seller_name, phone, address, category, type, items, total_amount, advance_paid, payment_type, notes } = req.body;

      // Validate input
      if (!seller_id || !items || items.length === 0 || !total_amount || !category) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      if (!['stock-ready', 'raw-material'].includes(category)) {
        return res.status(400).json({ error: 'Invalid category' });
      }

      // Validate total_amount matches the sum of item amounts (boundary check
      // on client input) — mirrors SalesController.createSale. Purchase items
      // use `price` where sale items use `unit_price`.
      const computedTotal = items.reduce(
        (sum, item) => sum + (Number(item.quantity) * Number(item.price)),
        0
      );
      if (Math.abs(computedTotal - Number(total_amount)) > 0.01) {
        return res.status(400).json({ error: 'total_amount does not match sum of item amounts' });
      }

      // An advance above the total produces a negative balance, an invoice
      // marked paid, and a negative debt in the ledger
      const advance = Number(advance_paid) || 0;
      if (advance < 0 || advance > Number(total_amount) + 0.01) {
        return res.status(400).json({ error: 'advance_paid must be between 0 and total_amount' });
      }

      await client.query('BEGIN');

      // 1. Generate unique purchase number
      const purchaseNo = PurchaseController.generateUniqueId('PUR');

      // 2. Create purchase record
      const balance = Number(total_amount) - advance;

      // Goods are recorded as received the moment the purchase is created
      const status = 'received';

      const purchaseResult = await client.query(
        `INSERT INTO purchases (purchase_no, seller_id, seller_name, phone, address, category, type, total_amount, advance_paid, balance, payment_type, status, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING *`,
        [purchaseNo, seller_id, seller_name, phone, address, category, type || null, total_amount, advance, balance, payment_type, status, notes]
      );

      const purchaseId = purchaseResult.rows[0].id;

      // 3. Create purchase items
      for (const item of items) {
        const itemAmount = item.quantity * item.price;
        let rawMaterialId = null;

        if (category === 'raw-material') {
          rawMaterialId = item.raw_material_id || null;

          if (!rawMaterialId) {
            // Match an existing raw material by name, or create it on the fly
            // (same pattern already used for new sellers during a purchase).
            const existing = await client.query(
              'SELECT id FROM raw_materials WHERE LOWER(name) = LOWER($1)',
              [item.product_name]
            );

            if (existing.rows.length > 0) {
              rawMaterialId = existing.rows[0].id;
            } else {
              const created = await client.query(
                `INSERT INTO raw_materials (name, unit, quantity)
                 VALUES ($1, $2, 0)
                 RETURNING id`,
                [item.product_name, item.unit || null]
              );
              rawMaterialId = created.rows[0].id;
            }
          }

          await client.query(
            'UPDATE raw_materials SET quantity = quantity + $1, updated_at = NOW() WHERE id = $2',
            [item.quantity, rawMaterialId]
          );
        }

        await client.query(
          `INSERT INTO purchase_items (purchase_id, stock_id, raw_material_id, product_name, description, quantity, price, amount)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [purchaseId, item.stock_id || null, rawMaterialId, item.product_name, item.description, item.quantity, item.price, itemAmount]
        );

        // Increase stock — only for stock-ready purchases with a matched stock item
        if (category === 'stock-ready' && item.stock_id) {
          await client.query(
            'UPDATE stock SET quantity = quantity + $1 WHERE id = $2',
            [item.quantity, item.stock_id]
          );
        }
      }

      // 4. Create Purchase Invoice
      // Note: purchase_items links to purchase_id directly (there is no
      // separate purchase_invoice_items table), so the invoice's line
      // items are looked up later via purchase_invoices.purchase_id.
      const invoiceNo = PurchaseController.generateUniqueId('PINV');

      // Status has to reflect what was actually paid up front, the same way
      // SalesController does it — hardcoding 'unpaid' left fully-prepaid
      // purchases sitting in the pending-payments list forever.
      const invoiceStatus = balance <= 0 ? 'paid' : (advance > 0 ? 'partial' : 'unpaid');

      const invoiceResult = await client.query(
        `INSERT INTO purchase_invoices (invoice_no, purchase_id, seller_id, seller_name, phone, address, total_amount, advance_paid, outstanding_debt, invoice_type, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'purchase_invoice', $10)
         RETURNING *`,
        [invoiceNo, purchaseId, seller_id, seller_name, phone, address, total_amount, advance, balance, invoiceStatus]
      );

      // 5. Create Seller Ledger Entry
      await client.query(
        `INSERT INTO purchase_ledger (seller_id, seller_name, purchase_id, invoice_no, debit, credit, debt, transaction_type, note)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'purchase', 'New purchase created')`,
        [seller_id, seller_name, purchaseId, invoiceNo, total_amount, advance, balance]
      );

      await client.query('COMMIT');

      // Check outstanding balance owed to seller
      if (balance > 0) {
        await sendWhatsApp(
          `💰 *New Payable Balance*\n\n• Seller: ${seller_name}\n• Amount: Rs.${balance}\n• Invoice: ${invoiceNo}`
        );
      }

      res.status(201).json({
        success: true,
        message: 'Purchase created successfully',
        data: {
          purchase: purchaseResult.rows[0],
          invoice: invoiceResult.rows[0],
          invoiceNo: invoiceNo
        }
      });

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Error creating purchase:', error);
      res.status(500).json({ error: error.message });
    } finally {
      client.release();
    }
  }

  /**
   * Get all purchases with pagination
   * GET /api/purchase?page=1&limit=10
   */
  static async getAllPurchases(req, res) {
    try {
      const { page = 1, limit = 10 } = req.query;
      const offset = (page - 1) * limit;

      const result = await pool.query(
        `SELECT * FROM purchases ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
        [limit, offset]
      );

      const countResult = await pool.query('SELECT COUNT(*) FROM purchases');
      const total = parseInt(countResult.rows[0].count);

      res.json({
        success: true,
        data: result.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: total,
          pages: Math.ceil(total / limit)
        }
      });

    } catch (error) {
      console.error('❌ Error fetching purchases:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Get single purchase with items
   * GET /api/purchase/:id
   */
  static async getPurchase(req, res) {
    try {
      const { id } = req.params;

      const purchaseResult = await pool.query(
        'SELECT * FROM purchases WHERE id = $1',
        [id]
      );

      if (purchaseResult.rows.length === 0) {
        return res.status(404).json({ error: 'Purchase not found' });
      }

      const itemsResult = await pool.query(
        'SELECT * FROM purchase_items WHERE purchase_id = $1',
        [id]
      );

      res.json({
        success: true,
        data: {
          purchase: purchaseResult.rows[0],
          items: itemsResult.rows
        }
      });

    } catch (error) {
      console.error('❌ Error fetching purchase:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Update purchase status
   * PUT /api/purchase/:id/status
   */
  static async updatePurchaseStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      const validStatuses = ['pending', 'received', 'cancelled'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }

      const result = await pool.query(
        'UPDATE purchases SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
        [status, id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Purchase not found' });
      }

      res.json({
        success: true,
        message: 'Purchase status updated',
        data: result.rows[0]
      });

    } catch (error) {
      console.error('❌ Error updating purchase:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Get today's purchases summary
   * GET /api/purchase/summary/today
   */
  static async getTodaysPurchasesSummary(req, res) {
    try {
      const result = await pool.query(
        `SELECT 
          COUNT(*) as total_purchases,
          SUM(total_amount) as total_amount,
          SUM(advance_paid) as total_advance,
          SUM(balance) as total_pending
         FROM purchases 
         WHERE DATE(created_at) = CURRENT_DATE`
      );

      res.json({
        success: true,
        data: result.rows[0]
      });

    } catch (error) {
      console.error('❌ Error fetching purchases summary:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Get purchase totals for an arbitrary date range (inclusive) — used by Reports.
   * GET /api/purchase/summary/range?startDate=&endDate=
   */
  static async getPurchasesSummary(req, res) {
    try {
      const { startDate, endDate } = req.query;
      if (!startDate || !endDate) {
        return res.status(400).json({ error: 'startDate and endDate are required' });
      }

      const result = await pool.query(
        `SELECT
          COUNT(*) as total_purchases,
          COALESCE(SUM(total_amount), 0) as total_amount
         FROM purchases
         WHERE created_at::date BETWEEN $1 AND $2`,
        [startDate, endDate]
      );

      res.json({
        success: true,
        data: {
          count: parseInt(result.rows[0].total_purchases, 10),
          total: parseFloat(result.rows[0].total_amount)
        }
      });

    } catch (error) {
      console.error('❌ Error fetching purchases summary:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Get recent purchases (last 10)
   * GET /api/purchase/recent/list
   */
  static async getRecentPurchases(req, res) {
    try {
      const result = await pool.query(
        `SELECT id, purchase_no, seller_name, total_amount, status, created_at 
         FROM purchases 
         ORDER BY created_at DESC 
         LIMIT 10`
      );

      res.json({
        success: true,
        data: result.rows
      });

    } catch (error) {
      console.error('❌ Error fetching recent purchases:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Get consolidated dashboard data (all-in-one)
   * GET /api/purchase/dashboard/data
   * Returns: purchases summary, recent purchases, pending payments to sellers
   */
  static async getDashboardData(req, res) {
    try {
      const [purchasesResult, recentResult, paymentsResult] = await Promise.all([
        // 1. Today's purchases summary
        pool.query(
          `SELECT 
            COUNT(*) as total_purchases,
            SUM(total_amount) as total_amount,
            SUM(advance_paid) as total_advance,
            SUM(balance) as total_pending
           FROM purchases 
           WHERE DATE(created_at) = CURRENT_DATE`
        ),
        // 2. Recent purchases
        pool.query(
          `SELECT id, purchase_no, seller_name, total_amount, status, created_at 
           FROM purchases 
           ORDER BY created_at DESC 
           LIMIT 10`
        ),
        // 3. Pending payments to sellers
        pool.query(
          `SELECT id, invoice_no, seller_name, total_amount, advance_paid, outstanding_debt, status, created_at
           FROM purchase_invoices 
           WHERE status IN ('unpaid', 'partial')
           ORDER BY created_at DESC`
        )
      ]);

      res.json({
        success: true,
        data: {
          purchasesSummary: purchasesResult.rows[0],
          recentPurchases: recentResult.rows,
          pendingPayments: paymentsResult.rows
        }
      });

    } catch (error) {
      console.error('❌ Error fetching dashboard data:', error);
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = PurchaseController;
