const express = require('express');
const jwt = require('jsonwebtoken');
const { knex } = require('../../database');
const router = express.Router();

/**
 * Helper to extract a user id from common token claim names
 */
function extractUserId(payload) {
  return (
    payload?.id ||
    payload?.userId ||
    payload?.user_id ||
    payload?.sub ||
    null
  );
}

/**
 * Inline JWT middleware
 * - Parses Authorization header "Bearer <token>"
 * - Verifies token and attaches { user, userId, jwtToken } on req
 * - Does NOT auto-401: route handlers enforce auth/role as needed
 */
function jwtMiddleware(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;

  req.user = null;
  req.userId = null;
  req.jwtToken = token || null;

  if (!token) return next();

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-this');
    req.user = payload;
    req.userId = extractUserId(payload);
  } catch (err) {
    req.user = null;
    req.userId = null;
  }

  next();
}

// GET /api/tenants/me/profile  (mounted at /api/tenants -> final path /api/tenants/me/profile)
// Validate token and fetch user row from DB using knex (returns only safe fields)
router.get('/me/profile', jwtMiddleware, async (req, res) => {
  try {
    console.log('GET /tenants/me/profile - incoming Authorization header:', req.headers.authorization);
    console.log('GET /tenants/me/profile - jwtMiddleware attached:', { user: req.user, userId: req.userId, token: req.jwtToken });

    const userPayload = req.user;
    if (!userPayload || userPayload.role !== 'tenant') {
      console.log('GET /tenants/me/profile - unauthorized (missing payload or role)');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = req.userId;
    console.log('GET /tenants/me/profile - resolved userId:', userId, 'typeof:', typeof userId);
    if (!userId) {
      console.log('GET /tenants/me/profile - user id missing in token payload');
      return res.status(401).json({ error: 'Unauthorized: user id missing' });
    }

    // Select a minimal, safe set of camelCase columns matching your DB schema
    const fields = [
      'id',
      'firstName',
      'lastName',
      'email',
      'phone'
    ];

    console.log('GET /tenants/me/profile - knex query fields:', fields, 'where id =', userId);
    const user = await knex('users').select(fields).where({ id: userId }).first();
    console.log('GET /tenants/me/profile - DB returned user:', user);

    if (!user) {
      console.log('GET /tenants/me/profile - user not found for id:', userId);
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({ user });
  } catch (err) {
    console.error('GET /tenants/me/profile error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;