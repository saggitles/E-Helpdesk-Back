#!/usr/bin/env node
// Azure startup script - handles Prisma client generation and app startup
const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Azure Startup: E-Helpdesk Backend');

// Check if running in Azure
const isAzure = process.env.WEBSITE_SITE_NAME || process.env.APPSETTING_WEBSITE_SITE_NAME;
console.log(`📍 Environment: ${isAzure ? 'Azure App Service' : 'Local'}`);

async function ensurePrismaClient() {
  console.log('🔍 Checking Prisma client availability...');
  
  const prismaClientPaths = [
    path.join(__dirname, '..', 'node_modules', '.prisma', 'client', 'index.js'),
    path.join(__dirname, '..', 'node_modules', '@prisma', 'client', 'index.js')
  ];
  
  let clientExists = false;
  for (const clientPath of prismaClientPaths) {
    if (fs.existsSync(clientPath)) {
      console.log(`✅ Prisma client found at: ${clientPath}`);
      clientExists = true;
      break;
    }
  }
  
  if (!clientExists) {
    console.log('⚠️ Prisma client not found, generating...');
    
    try {
      // Load environment for generation
      require('./load-env.js');
      
      // Set dummy DATABASE_URL if needed for generation
      if (!process.env.DATABASE_URL) {
        process.env.DATABASE_URL = 'postgresql://dummy:dummy@localhost:5432/dummy';
        console.log('🔧 Using dummy DATABASE_URL for client generation');
      }
      
      console.log('🔄 Generating Prisma client...');
      execSync('npx prisma generate', { 
        stdio: 'inherit',
        cwd: path.join(__dirname, '..'),
        env: process.env,
        timeout: 120000 // 2 minutes timeout
      });
      
      // Verify generation
      if (fs.existsSync(prismaClientPaths[0])) {
        console.log('✅ Prisma client generated successfully!');
      } else {
        throw new Error('Prisma client generation completed but files not found');
      }
      
    } catch (error) {
      console.error('❌ Failed to generate Prisma client:', error.message);
      
      if (isAzure) {
        console.log('⚠️ Continuing startup - app will attempt fallback mechanisms');
      } else {
        throw error;
      }
    }
  }
}

async function startApplication() {
  console.log('🚀 Starting application...');
  
  try {
    // Start the main application
    const app = spawn('node', ['index.js'], {
      stdio: 'inherit',
      cwd: path.join(__dirname, '..'),
      env: process.env
    });
    
    app.on('close', (code) => {
      console.log(`Application exited with code ${code}`);
      process.exit(code);
    });
    
    app.on('error', (error) => {
      console.error('Application error:', error);
      process.exit(1);
    });
    
  } catch (error) {
    console.error('Failed to start application:', error);
    process.exit(1);
  }
}

// Main execution
async function main() {
  try {
    await ensurePrismaClient();
    await startApplication();
  } catch (error) {
    console.error('Startup failed:', error);
    process.exit(1);
  }
}

// Handle process signals
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully');
  process.exit(0);
});

main();