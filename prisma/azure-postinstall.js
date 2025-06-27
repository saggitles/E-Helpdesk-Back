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

// Always generate Prisma client in Azure to ensure it's fresh
console.log('⚙️ Generating Prisma client...');

try {
  // Load environment variables
  require('./load-env.js');
  
  // Set a dummy DATABASE_URL if not present (for client generation only)
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = 'postgresql://dummy:dummy@localhost:5432/dummy';
    console.log('🔧 Using dummy DATABASE_URL for client generation');
  }
  
  // Generate Prisma client with verbose output
  console.log('🔄 Generating Prisma client...');
  execSync('npx prisma generate --schema=./prisma/schema.prisma', { 
    stdio: 'inherit',
    cwd: path.join(__dirname, '..'),
    env: process.env
  });
  
  // Check multiple possible locations for the generated client
  const possiblePaths = [
    path.join(__dirname, '..', 'node_modules', '.prisma', 'client', 'index.js'),
    path.join(__dirname, '..', '.prisma', 'client', 'index.js'),
    path.join('/home/site/wwwroot', 'node_modules', '.prisma', 'client', 'index.js'),
    path.join('/home/site/wwwroot', '.prisma', 'client', 'index.js')
  ];
  
  let clientFound = false;
  for (const clientPath of possiblePaths) {
    if (fs.existsSync(clientPath)) {
      console.log(`✅ Prisma client found at: ${clientPath}`);
      clientFound = true;
      break;
    }
  }
  
  if (!clientFound) {
    console.log('⚠️ Prisma client not found in expected locations');
    console.log('📂 Checking directory structure...');
    
    // List the node_modules directory to see what's there
    const nodeModulesPath = path.join(__dirname, '..', 'node_modules');
    if (fs.existsSync(nodeModulesPath)) {
      const prismaDir = path.join(nodeModulesPath, '.prisma');
      if (fs.existsSync(prismaDir)) {
        console.log('📁 .prisma directory exists in node_modules');
        const clientDir = path.join(prismaDir, 'client');
        if (fs.existsSync(clientDir)) {
          console.log('📁 client directory exists');
          const files = fs.readdirSync(clientDir);
          console.log('📄 Files in client directory:', files);
        } else {
          console.log('❌ client directory not found in .prisma');
        }
      } else {
        console.log('❌ .prisma directory not found in node_modules');
      }
    }
  }
  
} catch (error) {
  console.error('❌ Failed to generate Prisma client:', error.message);
  console.error('Full error:', error);
  
  if (isAzure) {
    console.log('⚠️ Prisma generation failed in Azure - this will cause startup issues');
  }
  
  // Don't exit with error code to allow deployment to continue
}

console.log('🏁 Azure postinstall completed');