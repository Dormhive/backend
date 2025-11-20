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

// PUT /api/properties/:propertyId -> update property (owner)
router.put('/:propertyId', authenticateToken, async (req, res) => {
  const { propertyId } = req.params;
  const { propertyName, address, description } = req.body;
  try {
    const prop = await knex('properties').where({ id: propertyId, ownerId: req.user.id }).first();
    if (!prop) return res.status(404).json({ message: 'Property not found or unauthorized' });

    await knex('properties').where({ id: propertyId }).update({
      propertyName: propertyName || prop.propertyName,
      address: address || prop.address,
      description: description !== undefined ? description : prop.description,
    });

    const updated = await knex('properties').where({ id: propertyId }).first();
    res.json(updated);
  } catch (err) {
    console.error('Error updating property:', err);
    res.status(500).json({ message: 'Error updating property' });
  }
});

// DELETE /api/properties/:propertyId -> delete property (owner)
router.delete('/:propertyId', authenticateToken, async (req, res) => {
  const { propertyId } = req.params;
  try {
    const prop = await knex('properties').where({ id: propertyId, ownerId: req.user.id }).first();
    if (!prop) return res.status(404).json({ message: 'Property not found or unauthorized' });

    await knex('properties').where({ id: propertyId }).delete();
    // cascade constraints in DB should remove rooms / room_tenants
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting property:', err);
    res.status(500).json({ message: 'Error deleting property' });
  }
});

// GET /api/properties/tenants/me/room -> MUST BE BEFORE /:propertyId routes
router.get('/tenants/me/room', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'tenant') {
      return res.status(403).json({ message: 'Only tenants can access this endpoint' });
    }

    const assignment = await knex('room_tenants')
      .join('rooms', 'room_tenants.roomId', 'rooms.id')
      .join('properties', 'rooms.propertyId', 'properties.id')
      .join('users', 'properties.ownerId', 'users.id')
      .where({ 'room_tenants.tenantId': req.user.id })
      .select(
        'rooms.id as room_id',
        'rooms.roomNumber',
        'rooms.type',
        'rooms.monthlyRent',
        'rooms.capacity',
        'rooms.amenities',
        'rooms.paymentSchedule as roomPaymentSchedule',
        'properties.id as property_id',
        'properties.propertyName',
        'properties.address',
        'users.id as owner_id',
        'users.firstName as owner_firstName',
        'users.lastName as owner_lastName',
        'users.email as owner_email',
        'users.phone as owner_phone',
        'room_tenants.paymentSchedule as tenantPaymentSchedule'
      )
      .first();

    if (!assignment) {
      return res.status(404).json({ message: 'Not assigned to any room' });
    }

    const response = {
      room: {
        id: assignment.room_id,
        roomNumber: assignment.roomNumber,
        type: assignment.type,
        monthlyRent: assignment.monthlyRent,
        capacity: assignment.capacity,
        amenities: assignment.amenities,
        paymentSchedule: assignment.roomPaymentSchedule,
      },
      property: {
        id: assignment.property_id,
        propertyName: assignment.propertyName,
        address: assignment.address,
      },
      owner: {
        id: assignment.owner_id,
        firstName: assignment.owner_firstName,
        lastName: assignment.owner_lastName,
        email: assignment.owner_email,
        phone: assignment.owner_phone,
      },
      tenantPaymentSchedule: assignment.tenantPaymentSchedule || null,
    };

    res.json(response);
  } catch (err) {
    console.error('Error in /tenants/me/room:', err);
    res.status(500).json({ message: 'Error fetching room information' });
  }
});

// GET /api/properties/:propertyId/rooms -> list rooms with tenants for property (owner only)
router.get('/:propertyId/rooms', authenticateToken, async (req, res) => {
  const { propertyId } = req.params;
  try {
    const prop = await knex('properties').where({ id: propertyId, ownerId: req.user.id }).first();
    if (!prop) return res.status(404).json({ message: 'Property not found' });

    const roomList = await knex('rooms').where({ propertyId }).orderBy('id', 'asc');

    // fetch tenants for each room - INCLUDE paymentSchedule stored per tenant assignment
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
            'users.phone',
            'room_tenants.paymentSchedule'
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
  const { roomNumber, type, monthlyRent, capacity, amenities, paymentSchedule } = req.body;

  if (!roomNumber || !type || monthlyRent === undefined) {
    return res.status(400).json({ message: 'roomNumber, type and monthlyRent are required' });
  }

  // sanitize schedule: only allow '1st' or '15th'
  const schedule = paymentSchedule === '15th' ? '15th' : '1st';

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
      paymentSchedule: schedule,
    });

    const createdRoom = await knex('rooms').where({ id: roomId }).first();
    res.status(201).json({ ...createdRoom, tenants: [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error adding room' });
  }
});

// PUT /api/properties/:propertyId/rooms/:roomId -> update room (owner only)
router.put('/:propertyId/rooms/:roomId', authenticateToken, async (req, res) => {
  const { propertyId, roomId } = req.params;
  const { roomNumber, type, monthlyRent, capacity, amenities, paymentSchedule } = req.body;

  try {
    // verify room belongs to property and owner
    const room = await knex('rooms')
      .join('properties', 'rooms.propertyId', 'properties.id')
      .where({ 'rooms.id': roomId, 'properties.ownerId': req.user.id })
      .select('rooms.*')
      .first();

    if (!room) return res.status(404).json({ message: 'Room not found or unauthorized' });

    const schedule = paymentSchedule === '15th' ? '15th' : '1st';

    await knex('rooms').where({ id: roomId }).update({
      roomNumber: roomNumber || room.roomNumber,
      type: type || room.type,
      monthlyRent: monthlyRent !== undefined ? monthlyRent : room.monthlyRent,
      capacity: capacity !== undefined ? capacity : room.capacity,
      amenities: amenities !== undefined ? amenities : room.amenities,
      paymentSchedule: schedule || room.paymentSchedule,
    });

    const updatedRoom = await knex('rooms').where({ id: roomId }).first();
    // include tenants
    const tenants = await knex('room_tenants')
      .join('users', 'room_tenants.tenantId', 'users.id')
      .where({ roomId })
      .select(
        'users.id',
        'users.firstName',
        'users.lastName',
        'users.email',
        'users.phone',
        'room_tenants.paymentSchedule'
      );

    res.json({ ...updatedRoom, tenants });
  } catch (err) {
    console.error('Error updating room:', err);
    res.status(500).json({ message: 'Error updating room' });
  }
});

// DELETE /api/properties/:propertyId/rooms/:roomId -> delete room (owner only)
router.delete('/:propertyId/rooms/:roomId', authenticateToken, async (req, res) => {
  const { propertyId, roomId } = req.params;

  try {
    // verify room belongs to owner
    const room = await knex('rooms')
      .join('properties', 'rooms.propertyId', 'properties.id')
      .where({ 'rooms.id': roomId, 'properties.ownerId': req.user.id })
      .first();

    if (!room) {
      return res.status(404).json({ message: 'Room not found or unauthorized' });
    }

    await knex('rooms').where({ id: roomId }).delete();
    // return remaining rooms for the property
    const roomList = await knex('rooms').where({ propertyId }).orderBy('id', 'asc');
    const roomsWithTenants = await Promise.all(
      roomList.map(async (r) => {
        const tenants = await knex('room_tenants')
          .join('users', 'room_tenants.tenantId', 'users.id')
          .where({ roomId: r.id })
          .select(
            'users.id',
            'users.firstName',
            'users.lastName',
            'users.email',
            'users.phone',
            'room_tenants.paymentSchedule'
          );
        return { ...r, tenants };
      })
    );
    res.json(roomsWithTenants);
  } catch (err) {
    console.error('Error deleting room:', err);
    res.status(500).json({ message: 'Error deleting room' });
  }
});

// POST /api/properties/:propertyId/rooms/:roomId/assign-tenant -> assign tenant to room
router.post('/:propertyId/rooms/:roomId/assign-tenant', authenticateToken, async (req, res) => {
  const { propertyId, roomId } = req.params;
  const { tenantEmail } = req.body; // no schedule expected from frontend

  if (!tenantEmail) {
    return res.status(400).json({ message: 'Tenant email is required' });
  }

  try {
    // verify room belongs to owner and get room paymentSchedule
    const room = await knex('rooms')
      .join('properties', 'rooms.propertyId', 'properties.id')
      .where({ 'rooms.id': roomId, 'properties.ownerId': req.user.id })
      .select('rooms.*')
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

    // determine schedule to save for this tenant from room (owner-set)
    const scheduleToSave = room.paymentSchedule || '1st';

    // assign tenant to room with paymentSchedule saved to room_tenants
    await knex('room_tenants').insert({
      roomId,
      tenantId: tenant.id,
      paymentSchedule: scheduleToSave,
    });

    // return updated room with all tenants
    const tenants = await knex('room_tenants')
      .join('users', 'room_tenants.tenantId', 'users.id')
      .where({ roomId })
      .select(
        'users.id',
        'users.firstName',
        'users.lastName',
        'users.email',
        'users.phone',
        'room_tenants.paymentSchedule'
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

    // return updated room with remaining tenants
    const tenants = await knex('room_tenants')
      .join('users', 'room_tenants.tenantId', 'users.id')
      .where({ roomId })
      .select(
        'users.id',
        'users.firstName',
        'users.lastName',
        'users.email',
        'users.phone',
        'room_tenants.paymentSchedule'
      );

    const updatedRoom = await knex('rooms').where({ id: roomId }).first();
    res.json({ ...updatedRoom, tenants });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error removing tenant' });
  }
});

module.exports = router;