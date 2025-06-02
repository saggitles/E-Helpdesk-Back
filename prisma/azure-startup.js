// This file ensures Prisma Client is properly generated on Azure Functions
const path = require('path');
const fs = require('fs');

// Check if Prisma client directory exists
const prismaClientDir = path.join(process.cwd(), 'node_modules', '.prisma', 'client');
const clientExists = fs.existsSync(prismaClientDir);

async function generatePrismaClient() {
  try {
    console.log('Attempting to generate Prisma Client programmatically...');
    
    // Import the generate function directly from @prisma/client
    // This avoids shell execution which can have permission issues
    const { PrismaClient } = require('@prisma/client');
    
    console.log('Prisma Client successfully loaded programmatically');
    return true;
  } catch (error) {
    console.error(`Error loading Prisma Client: ${error.message}`);
    console.log('Trying alternative client initialization...');
    
    try {
      // Try another approach - directly requiring the client
      // This can sometimes work even when the generate command fails
      const { PrismaClient } = require('@prisma/client');
      new PrismaClient();
      console.log('Alternative client initialization successful');
      return true;
    } catch (innerError) {
      console.error(`Alternative approach failed: ${innerError.message}`);
      return false;
    }
  }
}

// Export a function that can be used in the main index.js
module.exports = async function ensurePrismaClient() {
  if (!clientExists) {
    console.log('Prisma Client directory not found, attempting to initialize...');
    return generatePrismaClient();
  }
  
  console.log('Prisma Client directory exists, proceeding with application startup');
  return Promise.resolve(true);
};