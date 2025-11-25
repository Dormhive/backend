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

/**
 * Updates editable profile fields for a given user.
 * Accepts: firstName, lastName, phone, emergencyContact.
 * Maps emergencyContact -> emergency_contact for DB column.
 */
async function updateEditableProfile(userId, { firstName, lastName, phone, emergencyContact }) {
  const updatePayload = {};

  if (typeof firstName !== 'undefined') updatePayload.firstName = firstName;
  if (typeof lastName !== 'undefined') updatePayload.lastName = lastName;
  if (typeof phone !== 'undefined') updatePayload.phone = phone || null;

  // DB column is snake_case for emergency contact
  if (typeof emergencyContact !== 'undefined') updatePayload.emergency_contact = emergencyContact || null;

  if (Object.keys(updatePayload).length === 0) {
    return null; // nothing to update
  }

  await knex('users').where({ id: userId }).update(updatePayload);
  return await knex('users').where({ id: userId }).first();
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

    // Normalize DB -> API (support either naming but do not assume first_name exists)
    const normalized = { ...profile };
    if (!normalized.firstName && normalized.first_name) normalized.firstName = normalized.first_name;
    if (!normalized.lastName && normalized.last_name) normalized.lastName = normalized.last_name;
    if (!normalized.emergencyContact && normalized.emergency_contact) normalized.emergencyContact = normalized.emergency_contact;
    if (!normalized.createdAt && normalized.created_at) normalized.createdAt = normalized.created_at;

    delete normalized.password;

    res.json({ profile: normalized });
  } catch (err) {
    console.error('GET /api/profiles/me error:', err);
    res.status(500).json({ message: 'Failed to fetch profile' });
  }
});

// PUT /api/profiles/me - update current user profile (email not editable)
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

    // accept only editable fields
    const { firstName, lastName, phone, emergencyContact } = req.body;

    // Validate input — email is intentionally not updated here, emergencyContact optional
    if (!firstName || !lastName) {
      return res.status(400).json({ message: 'First name and last name are required' });
    }

    const updatedProfile = await updateEditableProfile(userId, { firstName, lastName, phone, emergencyContact });

    if (!updatedProfile) {
      return res.status(400).json({ message: 'Nothing to update' });
    }
    if (!updatedProfile) {
      return res.status(404).json({ message: 'User not found after update' });
    }

    // Normalize DB -> API (do NOT map updated_at)
    const normalized = { ...updatedProfile };
    if (!normalized.firstName && normalized.first_name) normalized.firstName = normalized.first_name;
    if (!normalized.lastName && normalized.last_name) normalized.lastName = normalized.last_name;
    if (!normalized.emergencyContact && normalized.emergency_contact) normalized.emergencyContact = normalized.emergency_contact;
    if (!normalized.createdAt && normalized.created_at) normalized.createdAt = normalized.created_at;

    delete normalized.password;

    res.json({ message: 'Profile updated successfully', profile: normalized });
  } catch (err) {
    console.error('PUT /api/profiles/me error:', err);
    res.status(500).json({ message: 'Failed to update profile' });
  }
});

module.exports = router;