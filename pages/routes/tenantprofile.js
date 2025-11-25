const express = require('express');
const jwt = require('jsonwebtoken');
const { knex } = require('../../database');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();

function getUserFromToken(req) {
  // Support "Authorization: Bearer <token>" header or token cookie
  const authHeader = (req.headers && req.headers.authorization) || '';
  const cookieToken = (req.cookies && req.cookies.token) || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : (authHeader || cookieToken).trim();

  if (!token) return null;

  try {
    const secret = process.env.JWT_SECRET || 'your-secret-key-change-this';
    const payload = jwt.verify(token, secret);

    // normalize userId fields if present
    const userId = payload.id || payload.userId || payload.sub || null;
    if (!userId) return null;

    // attach normalized fields to request for downstream handlers
    req.user = payload;
    req.userId = userId;
    return payload;
  } catch (err) {
    // token invalid / expired -> return null (handlers should return 401)
    console.warn('Invalid JWT:', err.message);
    return null;
  }
}

// storage for profile picture, saved to uploads/(role)(id)/ with filename (role)(id)<ext>
const profileStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const payload = getUserFromToken(req);
    const userId = payload?.id || payload?.userId || payload?.sub || 'unknown';
    const role = (payload?.role || 'tenant').toString();
    const folderName = `${role}${userId}`;
    const uploadDir = path.join(__dirname, '..', '..', 'uploads', folderName);
    fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const payload = getUserFromToken(req);
    const userId = payload?.id || payload?.userId || payload?.sub || 'unknown';
    const role = (payload?.role || 'tenant').toString();
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${role}${userId}${ext}`);
  }
});
const profileUpload = multer({ storage: profileStorage });

/**
 * Updates editable profile fields for a given user.
 * Accepts: firstName, lastName, phone, emergencyContact, profilePicture (string path)
 */
async function updateEditableProfile(userId, { firstName, lastName, phone, emergencyContact, profilePicture }) {
  const updatePayload = {};

  if (typeof firstName !== 'undefined') updatePayload.firstName = firstName;
  if (typeof lastName !== 'undefined') updatePayload.lastName = lastName;
  if (typeof phone !== 'undefined') updatePayload.phone = phone || null;
  if (typeof emergencyContact !== 'undefined') updatePayload.emergencyContact = emergencyContact || null;
  if (typeof profilePicture !== 'undefined') updatePayload.profilePicture = profilePicture || null;

  if (Object.keys(updatePayload).length === 0) {
    return null;
  }

  await knex('users').where({ id: userId }).update(updatePayload);
  return await knex('users').where({ id: userId }).first();
}

// Add or replace GET /me to always resolve by numeric id (token or ?id)
router.get('/me', async (req, res) => {
  try {
    // try token first (getUserFromToken normalizes req.userId)
    const payload = getUserFromToken(req);
    let userId = payload?.id || payload?.userId || payload?.sub || req.userId || null;

    // fallback to explicit numeric ?id= on the query string (useful for refresh/dev)
    if (!userId && req.query?.id) {
      const n = Number(req.query.id);
      if (!Number.isNaN(n) && Number.isInteger(n) && n > 0) userId = n;
    }

    if (!userId) return res.status(401).json({ message: 'Unauthorized: missing user id' });

    const profile = await knex('users').where({ id: userId }).first();
    if (!profile) return res.status(404).json({ message: 'User not found' });

    // Normalize DB -> API fields (support camelCase or snake_case)
    const normalized = { ...profile };
    normalized.firstName = normalized.firstName || normalized.first_name || '';
    normalized.lastName = normalized.lastName || normalized.last_name || '';
    normalized.emergencyContact = normalized.emergencyContact || normalized.emergency_contact || '';
    normalized.profilePicture = normalized.profilePicture || normalized.profile_picture || '';
    normalized.createdAt = normalized.createdAt || normalized.created_at || null;

    delete normalized.password;
    res.json({ profile: normalized });
  } catch (err) {
    console.error('GET /api/profiles/me error:', err);
    res.status(500).json({ message: 'Failed to fetch profile' });
  }
});

module.exports = router;