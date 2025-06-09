// Script to handle Prisma setup properly in Azure environment
// This addresses permission issues when generating the Prisma client

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('Running Azure post-install script for Prisma setup');

// Ensure the .prisma directory exists with correct permissions
const prismaDir = path.join(process.cwd(), 'node_modules', '.prisma');
if (!fs.existsSync(prismaDir)) {
  console.log('Creating .prisma directory');
  fs.mkdirSync(prismaDir, { recursive: true });
}

try {
  // Set permissions
  console.log('Setting proper permissions for Prisma directories');
  if (process.platform !== 'win32') { // Skip on Windows dev environments
    execSync('chmod -R 755 node_modules/.prisma', { stdio: 'inherit' });
  }
  
  // Generate Prisma client safely
  console.log('Generating Prisma client...');
  
  // We use the JavaScript API directly rather than CLI
  try {
    const { PrismaClient } = require('@prisma/client');
    console.log('Prisma client already exists');
  } catch (e) {
    console.log('Prisma client not found, generating...');
    // Use the Node.js API to avoid permission issues
    const { execSync } = require('child_process');
    
    try {
      execSync('node node_modules/prisma/build/index.js generate', { 
        stdio: 'inherit',
        env: {
          ...process.env,
          PRISMA_GENERATE_DATAPROXY: 'false',
        }
      });
      console.log('Prisma client generation completed');
    } catch (genError) {
      console.error('Error during Prisma generate:', genError);
      process.exit(1);
    }
  }
  
  console.log('Azure post-install for Prisma completed successfully');
} catch (error) {
  console.error('Error during Azure post-install:', error);
  process.exit(1);
}