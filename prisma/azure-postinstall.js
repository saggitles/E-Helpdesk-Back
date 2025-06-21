#!/usr/bin/env node
// Azure-specific postinstall script for Prisma client generation
// This runs after npm install in Azure App Service

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Azure postinstall: Checking Prisma client...');

// Check if we're running in Azure App Service
const isAzure = process.env.WEBSITE_SITE_NAME || process.env.APPSETTING_WEBSITE_SITE_NAME;

if (isAzure) {
  console.log('📍 Running in Azure App Service environment');
} else {
  console.log('📍 Running in local/development environment');
}

// Check if Prisma client already exists
const prismaClientPath = path.join(__dirname, '..', 'node_modules', '.prisma', 'client', 'index.js');
const prismaClientExists = fs.existsSync(prismaClientPath);

console.log(`🔍 Prisma client exists: ${prismaClientExists}`);

if (!prismaClientExists) {
  console.log('⚙️ Prisma client not found, attempting to generate...');
  
  try {
    // Load environment variables
    require('./load-env.js');
    
    // Set a dummy DATABASE_URL if not present (for client generation only)
    if (!process.env.DATABASE_URL) {
      process.env.DATABASE_URL = 'postgresql://dummy:dummy@localhost:5432/dummy';
      console.log('🔧 Using dummy DATABASE_URL for client generation');
    }
    
    // Generate Prisma client
    console.log('🔄 Generating Prisma client...');
    execSync('npx prisma generate', { 
      stdio: 'inherit',
      cwd: path.join(__dirname, '..'),
      env: process.env
    });
    
    // Verify generation
    if (fs.existsSync(prismaClientPath)) {
      console.log('✅ Prisma client generated successfully!');
    } else {
      console.log('⚠️ Prisma client generation completed but file not found');
    }
    
  } catch (error) {
    console.error('❌ Failed to generate Prisma client:', error.message);
    
    if (isAzure) {
      console.log('⚠️ Continuing with deployment - app will attempt to use pre-built client');
    } else {
      console.log('💡 Try running "npm run prisma:generate" manually');
    }
  }
} else {
  console.log('✅ Prisma client already exists, skipping generation');
}

console.log('🏁 Azure postinstall completed');