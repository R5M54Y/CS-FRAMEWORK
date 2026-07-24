'use strict';

/**
 * Error handling middleware
 */
function errorHandler(err, req, res, next) {
  console.error('[ERROR]', err.message);
  
  // API requests get JSON
  if (req.path.startsWith('/api/')) {
    return res.status(err.status || 500).json({
      error: err.message || 'Internal Server Error',
      status: err.status || 500
    });
  }
  
  // Web requests get error page
  res.status(err.status || 500);
  res.render('error', {
    title: 'Error',
    message: err.message || 'Something went wrong',
    status: err.status || 500
  });
}

/**
 * Request logging middleware
 */
function requestLogger(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (req.method !== 'GET' || res.statusCode >= 400) {
      console.log(`[${req.method}] ${req.originalUrl} ${res.statusCode} ${duration}ms`);
    }
  });
  next();
}

/**
 * CORS middleware
 */
function corsHandler(req, res, next) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
}

module.exports = { errorHandler, requestLogger, corsHandler };