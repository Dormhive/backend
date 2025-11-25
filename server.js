const express = require('express');
const cors = require('cors');
const path = require('path');
const { setupDatabase, knex } = require('./database');


// Route modules
const authRoutes = require('./pages/auth/auth');
const dashboardRoutes = require('./pages/dashboard/dashboard');
const propertiesRoutes = require('./pages/properties/properties');
const billsRouter = require('./pages/routes/bills');
const billsOwnerRouter = require('./pages/routes/billsOwner');
const concernsRouter = require('./pages/routes/concerns');
const concernsOwnerRouter = require('./pages/routes/concernsOwner');


const app = express();
app.use(cors());
app.use(express.json());

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/properties', propertiesRoutes);
app.use('/api/bills', billsRouter);
app.use('/api/bills/owner', billsOwnerRouter);
app.use('/api/concerns', concernsRouter);
app.use('/api/concerns/owner', concernsOwnerRouter);


// Static files
app.use('/Backend/uploads', express.static(path.join(__dirname, 'uploads')));
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
