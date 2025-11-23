const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const { knex } = require('../../database');

const router = express.Router();

// Helper to extract userId from JWT payload
function extractUserId(payload) {
  return (
    payload?.id ||
    payload?.userId ||
    payload?.user_id ||
    payload?.sub ||
    null
  );
}

// Middleware to extract tenantId from JWT before multer runs
function jwtTenantIdMiddleware(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  console.log('Authorization header:', req.headers.authorization); // Log the full header
  console.log('Extracted token:', token); // Log the token string
  if (!token) {
    req.tenantId = null;
    return next();
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-this');
    req.tenantId = extractUserId(payload);
    console.log('JWT payload:', payload);
    console.log('Extracted tenantId:', req.tenantId);
  } catch (err) {
    req.tenantId = null;
    console.log('JWT verification failed:', err.message);
  }
  next();
}

// Multer storage: dynamic destination and filename
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const userId = req.tenantId;
    const folderName = userId ? `tenant${userId}` : 'tenant_unknown';
    const billType = req.body.type || 'unknown';
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}${mm}${dd}`;
    const uploadDir = path.join(__dirname, '..', '..', 'uploads', folderName, String(billType), dateStr);
    fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}${mm}${dd}`;
    const ext = path.extname(file.originalname) || '';
    cb(null, `${dateStr}${ext}`);
  },
});
const upload = multer({ storage });

router.post('/', jwtTenantIdMiddleware, upload.single('receipt'), async (req, res) => {
  try {
    if (!req.tenantId) {
      console.log('Tenant ID missing or invalid after JWT extraction');
      return res.status(401).json({ message: 'Invalid or missing token' });
    }

    const { amount, type } = req.body;
    const amountNum = amount ? Number(amount) : 0;
    if (amount && (isNaN(amountNum) || amountNum < 0)) {
      return res.status(400).json({ message: 'Invalid amount' });
    }

    let receiptPath = null;
    if (req.file) {
      receiptPath = path.relative(path.join(__dirname, '..', '..', 'uploads'), req.file.path);
    }

    const insertPayload = {
      tenantId: req.tenantId,
      amount: amountNum || 0,
      type: type || 'rent',
      status: 'unpaid',
      verification: 'pending',
      created_at: new Date(),
      receipt: receiptPath,
    };

    const [insertId] = await knex('bills').insert(insertPayload);

    return res.status(201).json({
      message: 'Payment submitted. Verification status set to pending.',
      billId: insertId,
      receiptPath,
    });
  } catch (err) {
    console.error('POST /api/bills error:', err);
    return res.status(500).json({ message: 'Failed to submit payment' });
  }
});

module.exports = router;