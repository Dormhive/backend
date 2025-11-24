const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { knex } = require('../../database');

const router = express.Router();
const JWT_SECRET = 'your-secret-key-change-this';

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

// Login route
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    // Find user by email
    const user = await knex('users').where({ email }).first();
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Check password
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Generate JWT
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Generate bills for all months from move_in to today
    await generateBillsForCurrentMonth();

    // Respond with user info and token
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;