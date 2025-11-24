const express = require('express');
const jwt = require('jsonwebtoken');
const { knex } = require('../../database');

const router = express.Router();
const JWT_SECRET = 'your-secret-key-change-this'; // use same secret as auth.js

// Helper: Ensure one bill per tenant per month from move_in to current month
async function generateBillsForCurrentMonth() {
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;

  // Get all tenants
  const roomTenants = await knex('room_tenants');
  for (const rt of roomTenants) {
    const moveInDate = new Date(rt.move_in);
    let year = moveInDate.getFullYear();
    let month = moveInDate.getMonth() + 1;

    // Get room and property info
    const room = await knex('rooms').where({ id: rt.roomId }).first();
    if (!room) continue;
    const propertyid = room.propertyId;
    const ownerRow = await knex('properties').where({ id: propertyid }).first();
    const ownerid = ownerRow ? ownerRow.ownerId : null;

    // Loop from move_in to current month (inclusive)
    while (year < currentYear || (year === currentYear && month <= currentMonth)) {
      // Only create record if move_in is before or equal to this month/year
      const billMonthDate = new Date(year, month - 1, 1);
      if (moveInDate > billMonthDate) {
        // Advance to next month
        if (month === 12) {
          month = 1;
          year += 1;
        } else {
          month += 1;
        }
        continue;
      }

      // Check if bill already exists for this tenant/month/year
      const exists = await knex('bills_rent')
        .where({
          tenantid: rt.tenantId,
          roomid: rt.roomId,
          month,
          year,
        })
        .first();

      if (!exists) {
        // Calculate due_date for this month/year
        const lastDayOfMonth = new Date(year, month, 0).getDate();
        let day = rt.paymentfrequency;
        if (!day || day < 1) day = 1;
        if (day > lastDayOfMonth) day = lastDayOfMonth;
        const due_date = new Date(year, month - 1, day);

        await knex('bills_rent').insert({
          ownerid,
          tenantid: rt.tenantId,
          roomid: rt.roomId,
          propertyid,
          paymentfrequency: rt.paymentfrequency,
          move_in: rt.move_in,
          month,
          year,
          due_date,
        });
      }

      // Advance to next month
      if (month === 12) {
        month = 1;
        year += 1;
      } else {
        month += 1;
      }
    }
  }
}

// simple JWT auth middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.sendStatus(401);
  const token = authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
}

// GET /api/properties -> properties for logged-in owner
router.get('/', authenticateToken, async (req, res) => {
  try {
    const properties = await knex('properties').where({ ownerId: req.user.id });
    res.json(properties);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching properties' });
  }
});

// POST /api/properties -> create property (owner)
router.post('/', authenticateToken, async (req, res) => {
  const { propertyName, address, description } = req.body;
  if (!propertyName || !address) {
    return res.status(400).json({ message: 'Property name and address are required' });
  }
  try {
    const [id] = await knex('properties').insert({
      ownerId: req.user.id,
      propertyName,
      address,
      description,
    });
    res.json({ id });
  } catch (err) {
    res.status(500).json({ message: 'Error creating property' });
  }
});

// PUT /api/properties/:propertyId -> update property (owner)
router.put('/:propertyId', authenticateToken, async (req, res) => {
  const { propertyId } = req.params;
  const { propertyName, address, description } = req.body;
  try {
    await knex('properties')
      .where({ id: propertyId, ownerId: req.user.id })
      .update({ propertyName, address, description });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Error updating property' });
  }
});

// DELETE /api/properties/:propertyId -> delete property (owner)
router.delete('/:propertyId', authenticateToken, async (req, res) => {
  const { propertyId } = req.params;
  try {
    await knex('properties').where({ id: propertyId, ownerId: req.user.id }).delete();
    res.json({ success: true });
  } catch (err) {
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
    // verify property belongs to owner
    const property = await knex('properties').where({ id: propertyId, ownerId: req.user.id }).first();
    if (!property) return res.status(404).json({ message: 'Property not found or unauthorized' });

    const rooms = await knex('rooms').where({ propertyId });
    const roomsWithTenants = await Promise.all(
      rooms.map(async (room) => {
        const tenants = await knex('room_tenants')
          .join('users', 'room_tenants.tenantId', 'users.id')
          .where({ roomId: room.id })
          .select(
            'users.id',
            'users.firstName',
            'users.lastName',
            'users.email',
            'users.phone',
            'room_tenants.move_in',
            'room_tenants.paymentfrequency'
          );
        return { ...room, tenants };
      })
    );
    res.json(roomsWithTenants);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching rooms' });
  }
});

// POST /api/properties/:propertyId/rooms -> add room to property (owner only)
router.post('/:propertyId/rooms', authenticateToken, async (req, res) => {
  const { propertyId } = req.params;
  const { roomNumber, type, monthlyRent, capacity, amenities } = req.body;
  if (!roomNumber || !type || !monthlyRent) {
    return res.status(400).json({ message: 'Room number, type, and monthly rent are required' });
  }
  try {
    // verify property belongs to owner
    const property = await knex('properties').where({ id: propertyId, ownerId: req.user.id }).first();
    if (!property) return res.status(404).json({ message: 'Property not found or unauthorized' });

    const [id] = await knex('rooms').insert({
      propertyId,
      roomNumber,
      type,
      monthlyRent,
      capacity,
      amenities,
    });
    res.json({ id });
  } catch (err) {
    res.status(500).json({ message: 'Error adding room' });
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
      .select('rooms.*')
      .first();

    if (!room) {
      return res.status(404).json({ message: 'Room not found or unauthorized' });
    }

    await knex('rooms').where({ id: roomId }).delete();

    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting room:', err);
    res.status(500).json({ message: 'Error deleting room' });
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
      .select('rooms.*')
      .first();

    if (!room) {
      return res.status(404).json({ message: 'Room not found or unauthorized' });
    }

    await knex('room_tenants').where({ roomId, tenantId }).delete();

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error removing tenant' });
  }
});

// POST /api/properties/:propertyId/rooms/:roomId/assign-tenant -> assign tenant to room
router.post('/:propertyId/rooms/:roomId/assign-tenant', authenticateToken, async (req, res) => {
  const { propertyId, roomId } = req.params;
  const { tenantEmail, move_in, paymentfrequency } = req.body;

  if (!tenantEmail || !move_in || !paymentfrequency) {
    return res.status(400).json({ message: 'Tenant email, move-in date, and payment frequency are required' });
  }

  try {
    // verify room belongs to owner
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

    // check if tenant is already assigned to any room
    const alreadyAssigned = await knex('room_tenants').where({ tenantId: tenant.id }).first();
    if (alreadyAssigned) {
      return res.status(400).json({ message: 'Tenant is already assigned to a room.' });
    }

    // assign tenant to room
    await knex('room_tenants').insert({
      roomId,
      tenantId: tenant.id,
      paymentSchedule: room.paymentSchedule || '1st',
      move_in,
      paymentfrequency,
    });

    // Generate bills for all months from move_in to today
    await generateBillsForCurrentMonth();

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
        'room_tenants.paymentSchedule',
        'room_tenants.move_in',
        'room_tenants.paymentfrequency'
      );

    const updatedRoom = await knex('rooms').where({ id: roomId }).first();
    res.json({ ...updatedRoom, tenants });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error assigning tenant' });
  }
});

router.put('/:propertyId/rooms/:roomId/tenants/:tenantId', authenticateToken, async (req, res) => {
  const { propertyId, roomId, tenantId } = req.params;
  const { move_in, paymentfrequency } = req.body;

  try {
    // verify room belongs to owner
    const room = await knex('rooms')
      .join('properties', 'rooms.propertyId', 'properties.id')
      .where({ 'rooms.id': roomId, 'properties.ownerId': req.user.id })
      .select('rooms.*')
      .first();

    if (!room) {
      return res.status(404).json({ message: 'Room not found or unauthorized' });
    }

    // update move_in and paymentfrequency in room_tenants
    await knex('room_tenants')
      .where({ roomId, tenantId })
      .update({
        move_in,
        paymentfrequency,
      });

    res.json({ success: true });
  } catch (err) {
    console.error('Error updating tenant move_in/paymentfrequency:', err);
    res.status(500).json({ message: 'Error updating tenant details' });
  }
});

module.exports = router;