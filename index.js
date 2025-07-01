const express = require('express');
const cors = require('cors');
const app = express();

// Construct DATABASE_URL from Azure PostgreSQL environment variables
if (!process.env.DATABASE_URL && process.env.AZURE_POSTGRESQL_HOST) {
  const host = process.env.AZURE_POSTGRESQL_HOST;
  const port = process.env.AZURE_POSTGRESQL_PORT || '5432';
  const database = process.env.AZURE_POSTGRESQL_DATABASE;
  const user = process.env.AZURE_POSTGRESQL_USER;
  const password = process.env.AZURE_POSTGRESQL_PASSWORD;
  const ssl = process.env.AZURE_POSTGRESQL_SSL === 'true' ? '?sslmode=require' : '';
  
  if (host && database && user && password) {
    process.env.DATABASE_URL = `postgresql://${user}:${password}@${host}:${port}/${database}${ssl}`;
    console.log('✅ DATABASE_URL constructed from Azure PostgreSQL variables');
  }
}

// Get port from environment or use 8080
const PORT = process.env.PORT || 8080;

console.log('🚀 Starting E-Helpdesk Backend...');
console.log('Environment variables:', {
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  WEBSITES_PORT: process.env.WEBSITES_PORT,
  DATABASE_URL: process.env.DATABASE_URL ? 'SET' : 'NOT SET',
  AZURE_POSTGRESQL_HOST: process.env.AZURE_POSTGRESQL_HOST ? 'SET' : 'NOT SET',
  AZURE_POSTGRESQL_DATABASE: process.env.AZURE_POSTGRESQL_DATABASE ? 'SET' : 'NOT SET',
  AZURE_POSTGRESQL_USER: process.env.AZURE_POSTGRESQL_USER ? 'SET' : 'NOT SET',
  AZURE_POSTGRESQL_SSL: process.env.AZURE_POSTGRESQL_SSL
});

// Basic middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health check route (always available)
app.get('/', (req, res) => {
  console.log('Root route accessed');
  res.json({ 
    message: 'E-Helpdesk Backend is running!',
    timestamp: new Date().toISOString(),
    port: PORT,
    env: process.env.NODE_ENV || 'development',
    status: 'healthy'
  });
});

app.get('/health', (req, res) => {
  console.log('Health check accessed');
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    message: 'App is running successfully',
    version: '1.0.0'
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

// Add IP detection endpoint
app.get('/debug/ip-info', async (req, res) => {
  try {
    const axios = require('axios');
    
    // Get external IP from multiple sources
    const ipSources = [
      'https://api.ipify.org?format=json',
      'https://ipapi.co/json/',
      'https://httpbin.org/ip'
    ];
    
    const ipResults = {};
    
    for (const source of ipSources) {
      try {
        const response = await axios.get(source, { timeout: 5000 });
        ipResults[source] = response.data;
      } catch (error) {
        ipResults[source] = { error: error.message };
      }
    }
    
    // Also get Azure-specific headers
    const azureHeaders = {
      'x-forwarded-for': req.headers['x-forwarded-for'],
      'x-real-ip': req.headers['x-real-ip'],
      'x-azure-clientip': req.headers['x-azure-clientip'],
      'x-forwarded-proto': req.headers['x-forwarded-proto'],
      'x-arr-ssl': req.headers['x-arr-ssl']
    };
    
    res.json({
      message: 'Azure App Service IP Information',
      timestamp: new Date().toISOString(),
      requestHeaders: azureHeaders,
      externalIpChecks: ipResults,
      environment: {
        NODE_ENV: process.env.NODE_ENV,
        WEBSITE_SITE_NAME: process.env.WEBSITE_SITE_NAME,
        WEBSITE_RESOURCE_GROUP: process.env.WEBSITE_RESOURCE_GROUP,
        WEBSITE_HOSTNAME: process.env.WEBSITE_HOSTNAME
      }
    });
    
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get IP information',
      details: error.message
    });
  }
});

// Load routes 
app.use('/api', require('./src/routes'));

// Error handling middleware
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
  console.log(`✅ E-Helpdesk Backend running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📡 Health check: http://localhost:${PORT}/health`);
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
  // Don't exit on unhandled rejections in production
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  console.error('Stack:', error.stack);
  // Exit on uncaught exceptions
  process.exit(1);
});

console.log('📋 E-Helpdesk Backend initialization complete');

module.exports = app;