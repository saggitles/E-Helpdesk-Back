// Script to ensure Prisma Client is properly generated on Azure
const path = require('path');
require('./load-env'); // Load environment variables

async function initializePrismaClient() {
  try {
    console.log('Loading Prisma Client...');
    
    // Try to load the Prisma client directly
    const { PrismaClient } = require('@prisma/client');
    
    // Test connection
    const prisma = new PrismaClient();
    await prisma.$connect();
    await prisma.$disconnect();
    
    console.log('Prisma Client successfully loaded and connected');
    return true;
  } catch (error) {
    console.error(`Error loading Prisma Client: ${error.message}`);
    
    // If client doesn't exist, try generating it
    try {
      console.log('Attempting to generate Prisma client...');
      const { execSync } = require('child_process');
      execSync('npx prisma generate', { stdio: 'inherit' });
      
      console.log('Prisma client generated successfully');
      return true;
    } catch (genError) {
      console.error('Failed to generate Prisma client:', genError.message);
      return false;
    }
  }
}

// Export a function that can be used in the main index.js
module.exports = initializePrismaClient;