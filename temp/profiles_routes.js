const express = require('express');
const jwt = require('jsonwebtoken');
const { knex } = require('../../database');
const router = express.Router();

function getUserFromToken(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  try {
    return jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-this');
  } catch {
    return null;
  }
}

// GET /api/profiles/me - get current user profile
router.get('/me', async (req, res) => {
  try {
    const user = getUserFromToken(req);
    if (!user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const userId = user.id || user.userId || user.sub || null;
    if (!userId) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    const profile = await knex('users').where({ id: userId }).first();

    if (!profile) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Remove sensitive fields
    delete profile.password;

    res.json({ profile });
  } catch (err) {
    console.error('GET /api/profiles/me error:', err);
    res.status(500).json({ message: 'Failed to fetch profile' });
  }
});

// PUT /api/profiles/me - update current user profile
router.put('/me', async (req, res) => {
  try {
    const user = getUserFromToken(req);
    if (!user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const userId = user.id || user.userId || user.sub || null;
    if (!userId) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    const { firstName, lastName, email, phone } = req.body;

    // Validate input
    if (!firstName || !lastName || !email) {
      return res.status(400).json({ message: 'First name, last name, and email are required' });
    }

    // Check if email is already taken by another user
    const existingEmail = await knex('users')
      .where({ email })
      .andWhere('id', '!=', userId)
      .first();

    if (existingEmail) {
      return res.status(400).json({ message: 'Email already in use' });
    }

    // Update user profile
    await knex('users').where({ id: userId }).update({
      firstName,
      lastName,
      email,
      phone: phone || null
    });

    const updatedProfile = await knex('users').where({ id: userId }).first();

    // Remove sensitive fields
    delete updatedProfile.password;

    res.json({ message: 'Profile updated successfully', profile: updatedProfile });
  } catch (err) {
    console.error('PUT /api/profiles/me error:', err);
    res.status(500).json({ message: 'Failed to update profile' });
  }
});

module.exports = router;