// server.js
const app = require('./app');
const fs = require('fs');
const path = require('path');
const { pool } = require('./utils/db');

const PORT = process.env.PORT || 5000;

// Auto-run schema migration on startup
async function runAutoMigration() {
  try {
    const schemaPath = path.join(__dirname, 'schema.sql');
    if (fs.existsSync(schemaPath)) {
      const schema = fs.readFileSync(schemaPath, 'utf-8');
      await pool.query(schema);
      console.log('✓ Database schema migration completed');
    }
  } catch (err) {
    console.error('⚠ Migration warning:', err.message);
    // Don't crash — server can still start, some queries may fail
  }
}

runAutoMigration().then(() => {
  const server = app.listen(PORT, () => {
    console.log(`✓ Server running on http://localhost:${PORT}`);
    console.log(`✓ API available at http://localhost:${PORT}/api`);
    console.log(`✓ Health check: http://localhost:${PORT}/api/health`);
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('SIGTERM received, closing server...');
    server.close(() => {
      console.log('Server closed');
      pool.end(() => {
        process.exit(0);
      });
    });
  });
});
