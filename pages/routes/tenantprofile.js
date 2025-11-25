const express = require('express');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { knex } = require('../../database');

const router = express.Router();

// Extract user id from JWT payload
function extractUserId(payload) {
  return payload?.id || payload?.userId || payload?.user_id || payload?.sub || null;
}

// Tenant JWT middleware -> sets req.tenantId
function jwtTenantIdMiddleware(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) {
    req.tenantId = null;
    return next();
  }
  try {
    const secret = process.env.JWT_SECRET || 'dev-secret';
    const payload = jwt.verify(token, secret);
    req.tenantId = extractUserId(payload);
  } catch (err) {
    req.tenantId = null;
  }
  next();
}

// Multer storage for profile images
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const id = req.tenantId || 'unknown';
    const uploadDir = path.join(__dirname, '..', '..', 'uploads', `tenant${id}`, 'profile');
    fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    cb(null, `${Date.now()}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 4 * 1024 * 1024 } }); // 4MB

// GET /api/tenants/profile -> returns tenant profile from users table
router.get('/profile', jwtTenantIdMiddleware, async (req, res) => {
  if (!req.tenantId) return res.status(401).json({ message: 'Unauthorized' });

  try {
    const user = await knex('users').where({ id: req.tenantId }).first();
    if (!user) return res.status(404).json({ message: 'User not found' });

    const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();

    return res.json({
      id: user.id,
      fullName: fullName || '',
      email: user.email || '',
      phone: user.phone || '',
      address: user.address || '',
      emergencyContact: user.emergency_contact || '',
      profile_picture: user.profile_picture || null,
    });
  } catch (err) {
    console.error('[tenantProfile] GET error', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/tenants/profile -> update fields and optional file upload
router.put('/profile', jwtTenantIdMiddleware, upload.single('profile_picture'), async (req, res) => {
  if (!req.tenantId) return res.status(401).json({ message: 'Unauthorized' });

  try {
    const body = req.body || {};
    const update = {};

    if (body.fullName) {
      const parts = String(body.fullName).trim().split(/\s+/);
      update.firstName = parts.shift() || null;
      update.lastName = parts.length ? parts.join(' ') : null;
    }
    if (body.email) update.email = body.email;
    if (body.phone) update.phone = body.phone;
    if (body.address) update.address = body.address;
    if (body.emergencyContact) update.emergency_contact = body.emergencyContact;

    if (req.file) {
      const rel = path.relative(path.join(__dirname, '..', '..', 'uploads'), req.file.path).replace(/\\/g, '/');
      update.profile_picture = rel;
    }

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ message: 'No fields to update' });
    }

    await knex('users').where({ id: req.tenantId }).update(update);

    const updated = await knex('users').where({ id: req.tenantId }).first();
    const fullName = [updated.firstName, updated.lastName].filter(Boolean).join(' ').trim();

    return res.json({
      message: 'Profile updated',
      profile: {
        id: updated.id,
        fullName,
        email: updated.email,
        phone: updated.phone,
        address: updated.address,
        emergencyContact: updated.emergency_contact,
        profile_picture: updated.profile_picture || null,
      }
    });
  } catch (err) {
    console.error('[tenantProfile] PUT error', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;