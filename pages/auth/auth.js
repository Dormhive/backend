const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const { knex } = require('../../database');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this'; // Use env variable for consistency

// 7. Signup
router.post('/signup', async (req, res) => {
  const {
    email,
    password,
    firstName,
    lastName,
    phone,
    role, // 'tenant' or 'owner'
  } = req.body;

  if (!email || !password || !firstName || !lastName || !phone || !role) {
    return res.status(400).json({ message: 'Please fill all required fields.' });
  }

  try {
    // Check if user already exists
    const existingUser = await knex('users').where({ email }).first();
    if (existingUser) {
      return res.status(409).json({ message: 'User already exists with this email.' });
    }

    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create new user (remove isVerified if not in schema)
    await knex('users').insert({
      email,
      password: hashedPassword,
      firstName,
      lastName,
      phone,
      role
    });

    res.status(201).json({ message: 'User registered successfully!' });

  } catch (error) {
    console.error(error);
    // Handle duplicate email error from DB (just in case)
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'User already exists with this email.' });
    }
    res.status(500).json({ message: 'Server error during registration.' });
  }
});

// 8. Login
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