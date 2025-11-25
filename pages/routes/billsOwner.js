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

// GET /api/bills/owner - bills_rent rows for this owner, with property name, room number, monthlyRent and tenant name
router.get('/', jwtOwnerIdMiddleware, async (req, res) => {
  try {
    if (!req.ownerId) {
      return res.status(401).json({ message: 'Invalid or missing token' });
    }
    const bills = await knex('bills_rent')
      .join('rooms', 'bills_rent.roomid', 'rooms.id')
      .join('properties', 'bills_rent.propertyid', 'properties.id')
      .join('users', 'bills_rent.tenantid', 'users.id')
      .select(
        'bills_rent.*',
        'rooms.monthlyRent',
        'rooms.roomnumber',
        'properties.propertyname',
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

// ...rest of your code (unchanged)...
router.post('/verify/:id', jwtOwnerIdMiddleware, async (req, res) => {
  try {
    const billId = req.params.id;
    const updated = await knex('bills_rent')
      .where({ id: billId, ownerid: req.ownerId })
      .update({ status: 'Paid', Action: 'Verify' });
    if (updated) {
      return res.json({ success: true });
    } else {
      return res.status(404).json({ message: 'Bill not found or not authorized' });
    }
  } catch (err) {
    console.error('POST /api/bills/verify/:id error:', err);
    return res.status(500).json({ message: 'Failed to verify bill' });
  }
});

router.post('/sendback/:id', jwtOwnerIdMiddleware, async (req, res) => {
  try {
    const billId = req.params.id;
    const updated = await knex('bills_rent')
      .where({ id: billId, ownerid: req.ownerId })
      .update({ status: 'Unpaid', receipt: null, Action: 'Send Back' });
    if (updated) {
      return res.json({ success: true });
    } else {
      return res.status(404).json({ message: 'Bill not found or not authorized' });
    }
  } catch (err) {
    console.error('POST /api/bills/sendback/:id error:', err);
    return res.status(500).json({ message: 'Failed to send back bill' });
  }
});

router.post('/remind/:id', jwtOwnerIdMiddleware, async (req, res) => {
  try {
    const billId = req.params.id;
    const updated = await knex('bills_rent')
      .where({ id: billId, ownerid: req.ownerId })
      .update({ Action: 'Remind' });
    if (updated) {
      return res.json({ success: true });
    } else {
      return res.status(404).json({ message: 'Bill not found or not authorized' });
    }
  } catch (err) {
    console.error('POST /api/bills/remind/:id error:', err);
    return res.status(500).json({ message: 'Failed to remind bill' });
  }
});

module.exports = router;