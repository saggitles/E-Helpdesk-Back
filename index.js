const express = require('express');
const routes = require('./src/routes'); 
const cors = require('cors'); 
const app = express();
const fileUpload = require('express-fileupload');
const path = require('path');

// Load environment variables first
require('dotenv').config();

// Load environment from Prisma setup if available
try {
  require('./prisma/load-env');
  console.log('Environment loaded successfully');
} catch (err) {
  console.log('Prisma load-env not available, using default .env');
}

console.log('Environment:', {
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  DATABASE_URL: process.env.DATABASE_URL ? 'Set' : 'Not set'
});

// Initialize database connection
async function initializeDatabase() {
  try {
    console.log('Initializing database connection...');
    
    // Test database connection
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient({
      log: ['error', 'warn'],
    });
    
    await prisma.$connect();
    console.log('✅ Database connected successfully');
    
    // Test a simple query
    await prisma.$queryRaw`SELECT 1 as test`;
    console.log('✅ Database query test successful');
    
    await prisma.$disconnect();
    return true;
  } catch (error) {
    console.error('❌ Database initialization error:', error.message);
    console.log('⚠️ Application will continue startup - database operations may fail until connection is established');
    return false;
  }
}

// Initialize the application
async function initializeApp() {
  try {
    console.log('🚀 Starting E-Helpdesk Backend...');
    
    // Initialize database connection
    await initializeDatabase();
    
    // Set up temporary directories to avoid permission issues
    const tmpDir = path.join(__dirname, 'tmp');
    const fs = require('fs');
    if (!fs.existsSync(tmpDir)) {
      try {
        fs.mkdirSync(tmpDir, { recursive: true });
        console.log(`📁 Created temp directory: ${tmpDir}`);
      } catch (err) {
        console.warn(`⚠️ Could not create temp directory: ${err.message}`);
      }
    }
    
    // Set environment variables for temporary directories
    process.env.TMPDIR = tmpDir;
    process.env.TEMP = tmpDir;
    process.env.TMP = tmpDir;
    
    // Configure file upload
    app.use(fileUpload({
      createParentPath: true,
      limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
      abortOnLimit: true,
      tempFileDir: tmpDir
    }));

    // Configure CORS - most permissive approach for development
    app.use(cors({
      origin: true,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin']
    }));

    // Fix double slash issue - normalize URL paths
    app.use((req, res, next) => {
      if (req.url.includes('//')) {
        req.url = req.url.replace(/\/+/g, '/');
      }
      next();
    });

    // Add explicit CORS headers to all responses
    app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Access-Control-Allow-Headers');
      res.header('Access-Control-Max-Age', '86400'); // 24 hours
      
      // Handle preflight OPTIONS requests immediately
      if (req.method === 'OPTIONS') {
        return res.status(200).end();
      }
      
      next();
    });

    // Parse JSON bodies
    app.use(express.json({ limit: '50mb' }));
    app.use(express.urlencoded({ extended: true, limit: '50mb' }));

    // Health check endpoint
    app.get('/health', (req, res) => {
      res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        env: process.env.NODE_ENV,
        port: process.env.PORT
      });
    });

    // API routes
    app.use('/api', routes);

    // Handle 404 errors
    app.use('*', (req, res) => {
      res.status(404).json({ 
        error: 'Not Found', 
        message: `Route ${req.originalUrl} not found`,
        timestamp: new Date().toISOString()
      });
    });

    // Global error handler
    app.use((err, req, res, next) => {
      console.error('Global error handler:', err);
      res.status(500).json({ 
        error: 'Internal Server Error', 
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
        timestamp: new Date().toISOString()
      });
    });

    const PORT = process.env.PORT || 8080;
    
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 E-Helpdesk API is running on port ${PORT}`);
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

    return server;
  } catch (error) {
    console.error('❌ Failed to initialize application:', error);
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Start the application
if (require.main === module) {
  initializeApp().catch(error => {
    console.error('Failed to start application:', error);
    process.exit(1);
  });
}

module.exports = app;
