/**
 * Azure Windows App Service Entry Point
 * 
 * This script serves as the entry point for Windows Azure App Service.
 * It handles Prisma setup and other initialization tasks before starting the main application.
 */

// Load environment variables
require('./prisma/load-env');
console.log('Environment loaded. NODE_ENV:', process.env.NODE_ENV);

// Set up temporary directories to avoid permission issues
const path = require('path');
const fs = require('fs');

// Configure temp directories
const tmpDir = path.join(__dirname, 'tmp');
if (!fs.existsSync(tmpDir)) {
  try {
    fs.mkdirSync(tmpDir, { recursive: true });
    console.log(`Created temp directory: ${tmpDir}`);
  } catch (err) {
    console.warn(`Warning: Could not create temp directory: ${err.message}`);
  }
}

// Set environment variables for temporary directories
process.env.TMPDIR = tmpDir;
process.env.TEMP = tmpDir;
process.env.TMP = tmpDir;

// Import and run database setup
const setupDatabase = async () => {
  try {
    console.log('Setting up database connection...');
    
    // Generate Prisma client if needed
    try {
      // Try to load the Prisma client first
      require('@prisma/client');
    } catch (err) {
      console.log('Generating Prisma client...');
      const { execSync } = require('child_process');
      execSync('npx prisma generate', { stdio: 'inherit' });
    }
    
    // Run database migrations
    try {
      console.log('Running database migrations...');
      const { execSync } = require('child_process');
      execSync('npx prisma migrate deploy --schema=./prisma/schema.prisma', { stdio: 'inherit' });
    } catch (migrationError) {
      console.warn('Warning during migrations:', migrationError.message);
      console.log('Continuing with application startup...');
    }
    
    // Verify database connection
    const dbVerify = require('./prisma/azure-migrate');
    const isConnected = await dbVerify();
    
    if (!isConnected) {
      console.warn('Database connection issues detected, but continuing startup...');
    } else {
      console.log('Database connection verified successfully.');
    }
    
    return true;
  } catch (error) {
    console.error('Database setup error:', error);
    return false;
  }
};

// Start the main application
const startApp = async () => {
  console.log('Starting E-Helpdesk backend...');
  
  // Wait for database setup to complete
  await setupDatabase();
  
  // Start the main application by requiring the index.js file
  console.log('Loading main application...');
  require('./index');
};

// Run the application
startApp().catch(error => {
  console.error('Application startup error:', error);
  process.exit(1);
});