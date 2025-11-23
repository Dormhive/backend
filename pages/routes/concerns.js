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

// Submit a new concern
router.post('/', async (req, res) => {
  try {
    const user = getUserFromToken(req);
    if (!user || user.role !== 'tenant') return res.status(401).json({ message: 'Unauthorized' });

    const { tenantid, ownerid, propertyid, roomid, category, message } = req.body;

    // Log values for debugging
    console.log('Received concern:', {
      tenantid,
      ownerid,
      propertyid,
      roomid,
      category,
      message
    });

    if (!tenantid || !ownerid || !propertyid || !roomid || !category || !message) {
      return res.status(400).json({ message: 'All fields are required.' });
    }

    await knex('concerns').insert({
      tenantid,
      ownerid,
      sender: 'Tenant',
      created_at: new Date(),
      roomid,
      propertyid,
      category,
      message,
      status: 'Open'
    });

    res.json({ message: 'Ticket submitted successfully.' });
  } catch (err) {
    console.error('POST /api/concerns error:', err);
    res.status(500).json({ message: `Failed to submit ticket: ${err.message}` });
  }
});

// Get concerns history with optional filters and sorting
router.get('/history', async (req, res) => {
  try {
    const user = getUserFromToken(req);
    if (!user || user.role !== 'tenant') return res.status(401).json({ message: 'Unauthorized' });

    let query = knex('concerns').where({ tenantid: user.id });

    if (req.query.month) {
      const [monthName, year] = req.query.month.split(' ');
      const month = new Date(`${monthName} 1, ${year}`).getMonth() + 1;
      query = query.andWhereRaw('MONTH(created_at) = ? AND YEAR(created_at) = ?', [month, year]);
    }
    if (req.query.word) {
      query = query.andWhere('message', 'like', `%${req.query.word}%`);
    }

    const sort = req.query.sort === 'asc' ? 'asc' : 'desc';
    query = query.orderBy('created_at', sort);

    const concerns = await query.select('*');
    res.json({ concerns });
  } catch (err) {
    console.error('GET /api/concerns/history error:', err);
    res.status(500).json({ message: 'Failed to fetch concerns history.' });
  }
});

module.exports = router;