const express = require('express');
const jwt = require('jsonwebtoken');
const { knex } = require('../../database');

const router = express.Router();
const JWT_SECRET = 'your-secret-key-change-this'; // use same secret as auth.js

// simple JWT auth middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Token required' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: 'Invalid token' });
    req.user = user;
    next();
  });
}

// GET /api/properties -> properties for logged-in owner
router.get('/', authenticateToken, async (req, res) => {
  try {
    const props = await knex('properties').where({ ownerId: req.user.id });
    res.json(props);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error fetching properties' });
  }
});

// POST /api/properties -> create property (owner)
router.post('/', authenticateToken, async (req, res) => {
  const { propertyName, address, description } = req.body;
  if (!propertyName || !address) {
    return res.status(400).json({ message: 'Property name and address required' });
  }
  try {
    const [id] = await knex('properties').insert({
      ownerId: req.user.id,
      propertyName,
      address,
      description: description || null,
    });
    const created = await knex('properties').where({ id }).first();
    res.status(201).json(created);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error creating property' });
  }
});

// GET /api/properties/:propertyId/rooms -> list rooms with tenants for property (owner only)
router.get('/:propertyId/rooms', authenticateToken, async (req, res) => {
  const { propertyId } = req.params;
  try {
    const prop = await knex('properties').where({ id: propertyId, ownerId: req.user.id }).first();
    if (!prop) return res.status(404).json({ message: 'Property not found' });

    const roomList = await knex('rooms').where({ propertyId }).orderBy('id', 'asc');

    // fetch tenants for each room - INCLUDE phone field
    const roomsWithTenants = await Promise.all(
      roomList.map(async (room) => {
        const tenants = await knex('room_tenants')
          .join('users', 'room_tenants.tenantId', 'users.id')
          .where({ roomId: room.id })
          .select(
            'users.id',
            'users.firstName',
            'users.lastName',
            'users.email',
            'users.phone'
          );
        return { ...room, tenants };
      })
    );

    res.json(roomsWithTenants);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error fetching rooms' });
  }
});

// POST /api/properties/:propertyId/rooms -> add room to property (owner only)
router.post('/:propertyId/rooms', authenticateToken, async (req, res) => {
  const { propertyId } = req.params;
  const { roomNumber, type, monthlyRent, capacity, amenities } = req.body;

  if (!roomNumber || !type || monthlyRent === undefined) {
    return res.status(400).json({ message: 'roomNumber, type and monthlyRent are required' });
  }

  try {
    // ensure property belongs to owner
    const prop = await knex('properties').where({ id: propertyId, ownerId: req.user.id }).first();
    if (!prop) return res.status(404).json({ message: 'Property not found or unauthorized' });

    const [roomId] = await knex('rooms').insert({
      propertyId,
      roomNumber,
      type,
      monthlyRent,
      capacity: capacity || null,
      amenities: amenities || null,
    });

    const createdRoom = await knex('rooms').where({ id: roomId }).first();
    res.status(201).json({ ...createdRoom, tenants: [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error adding room' });
  }
});

// POST /api/properties/:propertyId/rooms/:roomId/assign-tenant -> assign tenant to room
router.post('/:propertyId/rooms/:roomId/assign-tenant', authenticateToken, async (req, res) => {
  const { propertyId, roomId } = req.params;
  const { tenantEmail } = req.body;

  if (!tenantEmail) {
    return res.status(400).json({ message: 'Tenant email is required' });
  }

  try {
    // verify room belongs to owner
    const room = await knex('rooms')
      .join('properties', 'rooms.propertyId', 'properties.id')
      .where({ 'rooms.id': roomId, 'properties.ownerId': req.user.id })
      .first();

    if (!room) {
      return res.status(404).json({ message: 'Room not found or unauthorized' });
    }

    // find tenant by email
    const tenant = await knex('users').where({ email: tenantEmail, role: 'tenant' }).first();

    if (!tenant) {
      return res.status(404).json({ message: 'Tenant with this email not found' });
    }

    // check if tenant already assigned to room
    const existing = await knex('room_tenants').where({ roomId, tenantId: tenant.id }).first();
    if (existing) {
      return res.status(400).json({ message: 'Tenant already assigned to this room' });
    }

    // assign tenant to room
    await knex('room_tenants').insert({
      roomId,
      tenantId: tenant.id,
    });

    // return updated room with all tenants - INCLUDE phone field
    const tenants = await knex('room_tenants')
      .join('users', 'room_tenants.tenantId', 'users.id')
      .where({ roomId })
      .select(
        'users.id',
        'users.firstName',
        'users.lastName',
        'users.email',
        'users.phone'
      );

    const updatedRoom = await knex('rooms').where({ id: roomId }).first();
    res.json({ ...updatedRoom, tenants });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error assigning tenant' });
  }
});

// DELETE /api/properties/:propertyId/rooms/:roomId/tenants/:tenantId -> remove tenant from room
router.delete('/:propertyId/rooms/:roomId/tenants/:tenantId', authenticateToken, async (req, res) => {
  const { propertyId, roomId, tenantId } = req.params;

  try {
    // verify room belongs to owner
    const room = await knex('rooms')
      .join('properties', 'rooms.propertyId', 'properties.id')
      .where({ 'rooms.id': roomId, 'properties.ownerId': req.user.id })
      .first();

    if (!room) {
      return res.status(404).json({ message: 'Room not found or unauthorized' });
    }

    // delete the assignment
    await knex('room_tenants').where({ roomId, tenantId }).delete();

    // return updated room with remaining tenants - INCLUDE phone field
    const tenants = await knex('room_tenants')
      .join('users', 'room_tenants.tenantId', 'users.id')
      .where({ roomId })
      .select(
        'users.id',
        'users.firstName',
        'users.lastName',
        'users.email',
        'users.phone'
      );

    const updatedRoom = await knex('rooms').where({ id: roomId }).first();
    res.json({ ...updatedRoom, tenants });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error removing tenant' });
  }
});

module.exports = router;