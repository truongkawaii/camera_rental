// app.js
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { pool } = require('./utils/db'); // ensure DB initialized
const { authenticate } = require('./middleware/auth');
const errorHandler = require('./middleware/errorHandler');

// Routers
const authRouter = require('./routes/auth');
const equipmentRouter = require('./routes/equipment');
const rentalsRouter = require('./routes/rentals');
const dashboardRouter = require('./routes/dashboard');
const reportsRouter = require('./routes/reports');
const calendarRouter = require('./routes/calendar');
const activityRouter = require('./routes/activity');
const customersRouter = require('./routes/customers');
const usersRouter = require('./routes/users');
const branchesRouter = require('./routes/branches');
const payrollRouter = require('./routes/payroll');
const rolesRouter = require('./routes/roles');
const performanceRouter = require('./routes/performance');
const imagesRouter = require('./routes/images');
const adsCostsRouter = require('./routes/adsCosts');
const miscCostsRouter = require('./routes/miscCosts');
const blacklistRouter = require('./routes/blacklist');
const commissionConfigsRouter = require('./routes/commissionConfigs');
const collaboratorsRouter = require('./routes/collaborators');
const saleTransfersRouter = require('./routes/saleTransfers');
const equipmentTransfersRouter = require('./routes/equipmentTransfers');


const app = express();

// ===========================================================================
// CORS — Cho phép local dev + IP-based deployments
// ===========================================================================
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000',
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Không có origin → server-to-server, curl, v.v.
    if (!origin) return callback(null, true);

    // Origin đã cấu hình sẵn
    if (allowedOrigins.includes(origin)) return callback(null, true);

    // Cho phép IP-based origin (cùng server, khác port)
    // Ví dụ: http://163.61.73.126:3000 gọi http://163.61.73.126:5000
    try {
      const hostname = new URL(origin).hostname;
      // IPv4 (vd: 192.168.1.1)
      const isIPv4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname);
      // IPv6 (vd: [::1], [2001:db8::1]) — Ubuntu 24.04 có thể dùng IPv6
      const isIPv6 = /^\[?[0-9a-fA-F:.]+\]?$/.test(hostname) && hostname.includes(':');
      if (
        isIPv4 ||
        isIPv6 ||
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '::1' ||
        hostname === '[::1]'
      ) {
        return callback(null, true);
      }
    } catch {
      // URL không hợp lệ → từ chối
    }

    // Từ chối CORS đúng cách: callback(null, false)
    // KHÔNG dùng callback(new Error(...)) vì sẽ gây 500 Internal Server Error
    console.warn(`[CORS] Rejected origin: ${origin}`);
    callback(null, false);
  },
  credentials: true,
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Mount routers
app.use('/api/auth', authRouter);
app.use('/api/equipment', equipmentRouter);
app.use('/api/rentals', rentalsRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/calendar', calendarRouter);
app.use('/api/activity', activityRouter);
app.use('/api/customers', customersRouter);
app.use('/api/users', usersRouter);
app.use('/api/branches', branchesRouter);
app.use('/api/payroll', payrollRouter);
app.use('/api/roles', rolesRouter);
app.use('/api/performance', performanceRouter);
app.use('/api/images', imagesRouter);
app.use('/api/ads-costs', adsCostsRouter);
app.use('/api/misc-costs', miscCostsRouter);
app.use('/api/blacklist', blacklistRouter);
app.use('/api/commission-configs', commissionConfigsRouter);
app.use('/api/collaborators', collaboratorsRouter);
app.use('/api/sale-transfers', saleTransfersRouter);
app.use('/api/equipment-transfers', equipmentTransfersRouter);


// Root API endpoint
app.get('/api', (req, res) => {
  res.json({ message: 'Camera Rental API', status: 'running', version: '1.0.0' });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'API is running' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Central error handling
app.use(errorHandler);

module.exports = app;
