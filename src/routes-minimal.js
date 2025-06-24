const express = require('express');
const router = express.Router();

// Basic test routes that don't require database
router.get('/test', (req, res) => {
  res.json({
    message: 'API routes are working!',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

router.get('/status', (req, res) => {
  res.json({
    status: 'API online',
    environment: process.env.NODE_ENV || 'development',
    database: process.env.DATABASE_URL ? 'configured' : 'not configured',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;