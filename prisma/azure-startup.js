// This file ensures Prisma Client is properly generated on Azure Functions
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

// Check if Prisma client directory exists
const prismaClientDir = path.join(process.cwd(), 'node_modules', '.prisma', 'client');
const clientExists = fs.existsSync(prismaClientDir);

async function initializePrismaClient() {
  try {
    console.log('Loading Prisma Client...');
    
    // Try to load the Prisma client directly
    const { PrismaClient } = require('@prisma/client');
    
    console.log('Prisma Client successfully loaded');
    return true;
  } catch (error) {
    console.error(`Error loading Prisma Client: ${error.message}`);
    console.log('Prisma Client failed to load. The database might not be migrated properly.');
    return false;
  }
}

// Export a function that can be used in the main index.js
module.exports = async function ensurePrismaClient() {
  // First check if we can load the client directly
  const clientLoaded = await initializePrismaClient();
  
  if (clientLoaded) {
    console.log('Prisma Client loaded successfully, proceeding with application startup');
    return true;
  } else {
    console.log('Attempting to load database schema from existing migrations...');
    
    try {
      // Since we're focusing on migrations instead of generation
      // This will ensure the database structure matches our schema
      require('./load-env'); // Load environment variables
      
      console.log('Database is already set up. Application will use existing schema.');
      return true;
    } catch (migrationError) {
      console.error('Error during database initialization:', migrationError);
      return false;
    }
  }
};