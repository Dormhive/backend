const express = require('express');
const cors = require('cors');
const path = require('path');
const { setupDatabase, knex } = require('./database');
const cron = require('node-cron');

// Route modules
const authRoutes = require('./pages/auth/auth');
const dashboardRoutes = require('./pages/dashboard/dashboard');
const propertiesRoutes = require('./pages/properties/properties');
const billsRouter = require('./pages/routes/bills');

const app = express();
app.use(cors());
app.use(express.json());

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/properties', propertiesRoutes);
app.use('/api/bills', billsRouter);

// Static files
app.use(express.static(path.join(__dirname, '../frontend/build')));
app.use((req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/build/index.html'));
});

// Setup DB and start server
setupDatabase().then(() => {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});

// Daily bill generation cron job
cron.schedule('0 2 * * *', async () => {
  console.log('[CRON] Bill generation started');
  try {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth() + 1;
    const lastDayOfMonth = new Date(year, month, 0).getDate();

    const roomTenants = await knex('room_tenants');
    console.log('[CRON] roomTenants count:', roomTenants.length);

    for (const rt of roomTenants) {
      const exists = await knex('bills_rent')
        .where({
          tenantid: rt.tenantId,
          roomid: rt.roomId,
          month,
        })
        .first();
      if (exists) {
        console.log(`[CRON] Bill already exists for tenant ${rt.tenantId}, room ${rt.roomId}, month ${month}`);
        continue;
      }

      const room = await knex('rooms').where({ id: rt.roomId }).first();
      if (!room) {
        console.log(`[CRON] Room not found for roomId ${rt.roomId}`);
        continue;
      }
      const propertyid = room.propertyId;
      const ownerRow = await knex('properties').where({ id: propertyid }).first();
      const ownerid = ownerRow ? ownerRow.ownerId : null;

      let day = rt.paymentfrequency;
      if (!day || day < 1) day = 1;
      if (day > lastDayOfMonth) day = lastDayOfMonth;
      const due_date = new Date(year, month - 1, day);

      console.log('Inserting bill:', {
        ownerid,
        tenantid: rt.tenantId,
        roomid: rt.roomId,
        propertyid,
        paymentfrequency: rt.paymentfrequency,
        move_in: rt.move_in,
        month,
        due_date,
      });

      try {
        await knex('bills_rent').insert({
          ownerid,
          tenantid: rt.tenantId,
          roomid: rt.roomId,
          propertyid,
          paymentfrequency: rt.paymentfrequency,
          move_in: rt.move_in,
          month,
          due_date,
        });
      } catch (insertErr) {
        console.error('Insert error:', insertErr);
      }
    }
    console.log(`[CRON] Bills generated for month ${month}/${year}`);
  } catch (err) {
    console.error('[CRON] Error generating bills:', err);
  }
});