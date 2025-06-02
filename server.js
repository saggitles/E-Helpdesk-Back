// This file handles proper initialization of Prisma client before starting the application
const { execSync } = require('child_process');
const path = require('path');
require('dotenv').config();

// Function to check if DATABASE_URL is configured correctly
function checkDatabaseUrl() {
  if (!process.env.DATABASE_URL) {
    console.error('ERROR: DATABASE_URL environment variable is not set');
    console.error('Please configure your DATABASE_URL in your environment or .env file');
    process.exit(1);
  }
  console.log('✅ DATABASE_URL is configured');
}

// Function to generate Prisma client
async function generatePrismaClient() {
  console.log('🔄 Generating Prisma client...');

  try {
    // Create .prisma directory if it doesn't exist
    execSync('mkdir -p node_modules/.prisma');
    
    // Generate Prisma client synchronously before continuing
    execSync('npx prisma generate', { stdio: 'inherit' });
    console.log('✅ Prisma client generated successfully');
    return true;
  } catch (error) {
    console.error('❌ Failed to generate Prisma client:', error.message);
    return false;
  }
}

// Main startup function
async function startServer() {
  console.log('🚀 Starting server initialization...');
  
  // Check database URL
  checkDatabaseUrl();
  
  // Generate Prisma client
  const clientGenerated = await generatePrismaClient();
  
  if (!clientGenerated) {
    console.error('❌ Failed to initialize. Exiting.');
    process.exit(1);
  }
  
  // If we get here, Prisma client has been generated successfully, now start the actual application
  console.log('✅ Starting application...');
  require('./index');
}

// Start the server
startServer().catch(error => {
  console.error('❌ Fatal error during server startup:', error);
  process.exit(1);
});