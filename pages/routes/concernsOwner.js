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

// GET /api/concerns/owner - list concerns for this owner
router.get('/', jwtOwnerIdMiddleware, async (req, res) => {
  try {
    if (!req.ownerId) {
      return res.status(401).json({ message: 'Invalid or missing token' });
    }

    const concerns = await knex('concerns')
      .leftJoin('properties', 'concerns.propertyid', 'properties.id')
      .leftJoin('rooms', 'concerns.roomid', 'rooms.id')
      .leftJoin('users', 'concerns.tenantid', 'users.id')
      .select(
        'concerns.*',
        'properties.propertyname',
        'rooms.roomnumber',
        knex.raw("CONCAT(users.firstName, ' ', users.lastName) as tenant_name")
      )
      .where('concerns.ownerid', req.ownerId)
      .orderBy('concerns.created_at', 'desc');

    return res.json({ concerns });
  } catch (err) {
    console.error('GET /api/concerns/owner error:', err);
    return res.status(500).json({ message: 'Failed to fetch concerns' });
  }
});

// POST /api/concerns/owner/resolve/:id -> mark concern resolved
router.post('/resolve/:id', jwtOwnerIdMiddleware, async (req, res) => {
  try {
    if (!req.ownerId) return res.status(401).json({ message: 'Invalid or missing token' });
    const id = req.params.id;
    const updated = await knex('concerns')
      .where({ id, ownerid: req.ownerId })
      .update({ status: 'Resolved', resolved_at: knex.fn.now() });
    if (updated) return res.json({ success: true });
    return res.status(404).json({ message: 'Concern not found or not authorized' });
  } catch (err) {
    console.error('POST /api/concerns/owner/resolve/:id error:', err);
    return res.status(500).json({ message: 'Failed to resolve concern' });
  }
});

// POST /api/concerns/owner/reopen/:id -> mark concern open
router.post('/reopen/:id', jwtOwnerIdMiddleware, async (req, res) => {
  try {
    if (!req.ownerId) return res.status(401).json({ message: 'Invalid or missing token' });
    const id = req.params.id;
    const updated = await knex('concerns')
      .where({ id, ownerid: req.ownerId })
      .update({ status: 'Open', resolved_at: null });
    if (updated) return res.json({ success: true });
    return res.status(404).json({ message: 'Concern not found or not authorized' });
  } catch (err) {
    console.error('POST /api/concerns/owner/reopen/:id error:', err);
    return res.status(500).json({ message: 'Failed to reopen concern' });
  }
});

// GET /api/concerns/owner/:id/messages -> get all messages for a concern
router.get('/:id/messages', jwtOwnerIdMiddleware, async (req, res) => {
  try {
    if (!req.ownerId) return res.status(401).json({ message: 'Invalid or missing token' });
    const { id } = req.params;

    // verify concern belongs to owner
    const concern = await knex('concerns').where({ id, ownerid: req.ownerId }).first();
    if (!concern) return res.status(404).json({ message: 'Concern not found' });

    // get all messages (replies) for this concern
    const messages = await knex('concern_messages')
      .where({ concernid: id })
      .orderBy('created_at', 'asc');

    return res.json({ messages });
  } catch (err) {
    console.error('GET /api/concerns/owner/:id/messages error:', err);
    return res.status(500).json({ message: 'Failed to fetch messages' });
  }
});

// POST /api/concerns/owner/:id/reply -> owner sends reply to concern
router.post('/:id/reply', jwtOwnerIdMiddleware, async (req, res) => {
  try {
    if (!req.ownerId) return res.status(401).json({ message: 'Invalid or missing token' });
    const { id } = req.params;
    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ message: 'Message cannot be empty' });
    }

    // verify concern belongs to owner
    const concern = await knex('concerns').where({ id, ownerid: req.ownerId }).first();
    if (!concern) return res.status(404).json({ message: 'Concern not found' });

    // insert message as owner reply with status 'sent'
    const inserted = await knex('concern_messages').insert({
      concernid: id,
      sender: 'owner',
      message: message.trim(),
      status: 'sent',
      created_at: new Date()
    });

    // fetch and return the inserted message
    const newMsg = await knex('concern_messages').where({ id: inserted[0] }).first();

    return res.json({ message: newMsg });
  } catch (err) {
    console.error('POST /api/concerns/owner/:id/reply error:', err);
    return res.status(500).json({ message: 'Failed to send reply' });
  }
});

module.exports = router;