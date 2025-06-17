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
const { execSync } = require('child_process');

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

// Function to check if Prisma is installed globally
const isPrismaInstalledGlobally = () => {
  try {
    execSync('prisma --version', { stdio: 'pipe' });
    return true;
  } catch (error) {
    console.log('Prisma not found globally, will install it now');
    return false;
  }
};

// Install Prisma globally if not already installed
const installPrismaGlobally = () => {
  try {
    if (!isPrismaInstalledGlobally()) {
      console.log('Installing Prisma globally...');
      execSync('npm install -g prisma', { stdio: 'inherit' });
      console.log('Prisma installed globally successfully');
    } else {
      console.log('Prisma is already installed globally');
    }
  } catch (error) {
    console.warn('Warning: Could not install Prisma globally:', error.message);
    console.log('Will fallback to npx for Prisma commands');
  }
};

// Import and run database setup
const setupDatabase = async () => {
  try {
    console.log('Setting up database connection...');
    
    // Install Prisma globally 
    installPrismaGlobally();
    
    // Generate Prisma client if needed
    try {
      // Try to load the Prisma client first
      require('@prisma/client');
    } catch (err) {
      console.log('Generating Prisma client...');
      try {
        // Try using global Prisma first
        if (isPrismaInstalledGlobally()) {
          execSync('prisma generate', { stdio: 'inherit' });
        } else {
          // Fallback to npx
          execSync('npx prisma generate', { stdio: 'inherit' });
        }
      } catch (genError) {
        console.warn('Error generating client with global prisma, falling back to npx:', genError.message);
        execSync('npx prisma generate', { stdio: 'inherit' });
      }
    }
    
    // Run database migrations
    try {
      console.log('Running database migrations...');
      if (isPrismaInstalledGlobally()) {
        execSync('prisma migrate deploy --schema=./prisma/schema.prisma', { stdio: 'inherit' });
      } else {
        execSync('npx prisma migrate deploy --schema=./prisma/schema.prisma', { stdio: 'inherit' });
      }
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