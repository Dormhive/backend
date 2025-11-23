const express = require('express');
const cors = require('cors');
const path = require('path');
const { setupDatabase } = require('./database');

// Route modules
const authRoutes = require('./pages/auth/auth');
const dashboardRoutes = require('./pages/dashboard/dashboard');
const propertiesRoutes = require('./pages/properties/properties');
const billsRouter = require('./pages/routes/bills');
const concernsRouter = require('./pages/routes/concerns');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files (receipts)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Health
app.get('/', (req, res) => res.send('Welcome to the DormHive API!'));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/properties', propertiesRoutes);
app.use('/api/bills', billsRouter);
app.use('/api/concerns', concernsRouter);
async function startServer() {
  try {
    await setupDatabase(); // will add verification column if missing
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

startServer();