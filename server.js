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

// Setup DB and start server
setupDatabase().then(() => {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});
