const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const { knex } = require('../../database');

const router = express.Router();
const JWT_SECRET = 'your-secret-key-change-this';

// Signup route
router.post('/signup', async (req, res) => {
  const { firstName, lastName, email, phone, password, role } = req.body;
  if (!firstName || !lastName || !email || !phone || !password || !role) {
    return res.status(400).json({ message: 'All fields are required.' });
  }
  try {
    // Check for existing user
    const existing = await knex('users').where({ email }).first();
    if (existing) {
      return res.status(400).json({ message: 'Email already exists.' });
    }
    // Hash password
    const hashed = await bcrypt.hash(password, 10);
    // Insert user
    await knex('users').insert({
      firstName,
      lastName,
      email,
      phone,
      password: hashed,
      role,
    });
    res.json({ message: 'Signup successful! You can now log in.' });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ message: 'Server error during signup.' });
  }
});

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

    if (!email || !password) {
        return res.status(400).json({ message: 'Please enter email and password.' });
    }

    try {
        // Find user
        const user = await knex('users').where({ email }).first();
        if (!user) {
            return res.status(400).json({ message: 'Invalid login credentials.' });
        }

        // Check password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid login credentials.' });
        }
        
        // Check if verified (defaulted to true for prototype)
        if (!user.isVerified) {
            return res.status(401).json({ message: 'Please verify your account (check OTP).' });
        }

        // Create uploads/tenant{id} folder if user is a tenant
        if (user.role === 'tenant') {
            const folderPath = path.join(__dirname, '..', '..', 'uploads', `tenant${user.id}`);
            if (!fs.existsSync(folderPath)) {
                fs.mkdirSync(folderPath, { recursive: true });
                console.log(`Created folder: ${folderPath}`);
            }
        }

        // Create JWT Token
        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role },
            JWT_SECRET,
            { expiresIn: '1h' }
        );

        res.status(200).json({
            message: 'Login successful!',
            token,
            user: {
                id: user.id,
                email: user.email,
                firstName: user.firstName,
                role: user.role
            }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error during login.' });
    }
});

module.exports = router;