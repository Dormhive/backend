const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { setupDatabase, knex } = require('./database');

// Route modules
const authRoutes = require('./pages/auth/auth');
const dashboardRoutes = require('./pages/dashboard/dashboard');
const propertiesRoutes = require('./pages/properties/properties');
const billsRouter = require('./pages/routes/bills');
const billsOwnerRouter = require('./pages/routes/billsOwner');
const concernsRouter = require('./pages/routes/concerns');
const concernsOwnerRouter = require('./pages/routes/concernsOwner');
const tenantProfileRouter = require('./pages/routes/tenantProfile');

const app = express();
app.use(cors());
app.use(express.json());

// API routes (mounted before static handling)
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/properties', propertiesRoutes);
app.use('/api/bills', billsRouter);
app.use('/api/bills/owner', billsOwnerRouter);
app.use('/api/profiles', tenantProfileRouter);
app.use('/api/concerns', concernsRouter);
app.use('/api/concerns/owner', concernsOwnerRouter);

// Expose uploads directory at /uploads so frontend can reliably load images
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve frontend build only when available. Do not swallow API or /uploads routes.
const buildDir = path.join(__dirname, '../frontend/build');
const indexHtml = path.join(buildDir, 'index.html');

if (fs.existsSync(buildDir) && fs.existsSync(indexHtml)) {
  console.log('Serving frontend from build:', buildDir);
  app.use(express.static(buildDir));

  // Serve index.html for any non-API / non-uploads path using a regex route that avoids '*'
  app.get(/^\/(?!api\/|uploads\/).*/, (req, res) => {
    return res.sendFile(indexHtml);
  });
} else {
  console.warn('Frontend build not found at', buildDir);

  // Return 404 for other non-API / non-uploads requests
  app.get(/^\/(?!api\/|uploads\/).*/, (req, res) => {
    res.status(404).send('Frontend build not available. Start frontend dev server or run `npm run build` in frontend.');
  });
}

// Setup DB and start server
setupDatabase().then(() => {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});