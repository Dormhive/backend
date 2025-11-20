const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const { knex } = require('../../database');

const router = express.Router();

// ensure uploads directory exists (backend/uploads/receipts)
const receiptsDir = path.join(__dirname, '..', '..', 'uploads', 'receipts');
fs.mkdirSync(receiptsDir, { recursive: true });

// multer config — store files in backend/uploads/receipts
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, receiptsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    cb(null, name);
  },
});
const upload = multer({ storage });

/**
 * GET /api/bills
 * Returns bills for the authenticated tenant
 */
router.get('/', async (req, res) => {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ message: 'Missing token' });

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    } catch (err) {
      return res.status(401).json({ message: 'Invalid token' });
    }
    const tenantId = payload.id || payload.userId || payload.sub;
    if (!tenantId) return res.status(401).json({ message: 'Invalid token payload' });

    const bills = await knex('bills').where({ tenantId }).orderBy('created_at', 'desc');
    return res.json({ bills });
  } catch (err) {
    console.error('GET /api/bills error:', err);
    return res.status(500).json({ message: 'Failed to fetch bills' });
  }
});

/**
 * POST /api/bills
 * Accepts multipart/form-data:
 * - amount (optional)
 * - type ('rent'|'utility')
 * - receipt (file, optional)
 *
 * Creates a bills record with verification = 'pending'
 */
router.post('/', upload.single('receipt'), async (req, res) => {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ message: 'Missing token' });

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    } catch (err) {
      return res.status(401).json({ message: 'Invalid token' });
    }
    const tenantId = payload.id || payload.userId || payload.sub;
    if (!tenantId) return res.status(401).json({ message: 'Invalid token payload' });

    const { amount, type } = req.body;
    const amountNum = amount ? Number(amount) : 0;
    if (amount && (isNaN(amountNum) || amountNum < 0)) {
      return res.status(400).json({ message: 'Invalid amount' });
    }

    const receiptFile = req.file ? req.file.filename : null;

    const insertPayload = {
      tenantId: tenantId,
      amount: amountNum || 0,
      type: type || 'rent',
      status: 'unpaid',
      // verification defaults to 'pending' per your DB migration; set explicitly to be safe
      verification: 'pending',
      created_at: new Date(),
    };

    // If you added a 'receipt' column to bills table, uncomment:
    // insertPayload.receipt = receiptFile;

    const [insertId] = await knex('bills').insert(insertPayload);

    return res.status(201).json({
      message: 'Payment submitted. Verification status set to pending.',
      billId: insertId,
    });
  } catch (err) {
    console.error('POST /api/bills error:', err);
    return res.status(500).json({ message: 'Failed to submit payment' });
  }
});

module.exports = router;