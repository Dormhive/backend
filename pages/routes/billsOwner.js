const express = require('express');
const jwt = require('jsonwebtoken');
const { knex } = require('../../database');

const router = express.Router();

function extractUserId(payload) {
  return (
    payload?.id ||
    payload?.userId ||
    payload?.user_id ||
    payload?.sub ||
    null
  );
}

function jwtOwnerIdMiddleware(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) {
    req.ownerId = null;
    return next();
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-this');
    req.ownerId = extractUserId(payload);
  } catch (err) {
    req.ownerId = null;
  }
  next();
}

// GET /api/bills/owner - bills_rent rows for this owner, with monthlyRent and tenant name
router.get('/', jwtOwnerIdMiddleware, async (req, res) => {
  try {
    if (!req.ownerId) {
      return res.status(401).json({ message: 'Invalid or missing token' });
    }
    const bills = await knex('bills_rent')
      .join('rooms', 'bills_rent.roomid', 'rooms.id')
      .join('users', 'bills_rent.tenantid', 'users.id')
      .select(
        'bills_rent.*',
        'rooms.monthlyRent',
        knex.raw("CONCAT(users.firstName, ' ', users.lastName) as tenant_name")
      )
      .where('bills_rent.ownerid', req.ownerId)
      .orderBy('bills_rent.due_date', 'desc');
    return res.json({ bills });
  } catch (err) {
    console.error('GET /api/bills/owner error:', err);
    return res.status(500).json({ message: 'Failed to fetch owner bills' });
  }
});

module.exports = router;