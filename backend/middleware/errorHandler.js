// middleware/errorHandler.js
/**
 * Central error handling middleware.
 * It expects an Error object possibly with a `status` property.
 */
module.exports = (err, req, res, next) => {
  console.error('Error:', err);
  const status = err.status || 500;
  res.status(status).json({
    error: err.message || 'Internal Server Error',
    timestamp: new Date().toISOString()
  });
};
