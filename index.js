
const express = require('express');
const app = express();

// Get port from environment or use 8080
const PORT = process.env.PORT || 8080;

console.log('🚀 Starting minimal test app...');
console.log('Environment variables:', {
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  WEBSITES_PORT: process.env.WEBSITES_PORT
});

// Basic middleware
app.use(express.json());

// Test routes
app.get('/', (req, res) => {
  console.log('Root route accessed');
  res.json({ 
    message: 'Minimal test app is working!',
    timestamp: new Date().toISOString(),
    port: PORT,
    env: process.env.NODE_ENV || 'development'
  });
});

app.get('/health', (req, res) => {
  console.log('Health check accessed');
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    message: 'App is running successfully'
  });
});

app.get('/env', (req, res) => {
  console.log('Environment check accessed');
  res.json({
    nodeVersion: process.version,
    platform: process.platform,
    cwd: process.cwd(),
    env: {
      NODE_ENV: process.env.NODE_ENV,
      PORT: process.env.PORT,
      WEBSITES_PORT: process.env.WEBSITES_PORT,
      DATABASE_URL: process.env.DATABASE_URL ? 'SET' : 'NOT SET'
    }
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  res.status(500).json({ 
    error: 'Internal Server Error',
    message: err.message,
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use('*', (req, res) => {
  console.log('404 - Route not found:', req.originalUrl);
  res.status(404).json({ 
    error: 'Not Found',
    path: req.originalUrl,
    timestamp: new Date().toISOString()
  });
});

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Minimal test app running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📡 Test URL: http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

// Handle errors
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit on unhandled rejections for debugging
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  console.error('Stack:', error.stack);
  // Exit on uncaught exceptions
  process.exit(1);
});

console.log('📋 Minimal test app initialization complete');

module.exports = app;