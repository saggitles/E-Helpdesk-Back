// Simple startup script for Azure with Prisma client generation
console.log('🚀 Simple Azure Startup: E-Helpdesk Backend');
console.log('📍 Environment: Azure App Service');

const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Function to check if Prisma client exists
function checkPrismaClient() {
  const possiblePaths = [
    path.join(__dirname, '..', 'node_modules', '.prisma', 'client', 'index.js'),
    path.join(__dirname, '..', '.prisma', 'client', 'index.js'),
    path.join('/home/site/wwwroot', 'node_modules', '.prisma', 'client', 'index.js'),
    path.join('/home/site/wwwroot', '.prisma', 'client', 'index.js')
  ];
  
  for (const clientPath of possiblePaths) {
    if (fs.existsSync(clientPath)) {
      console.log(`✅ Prisma client found at: ${clientPath}`);
      return true;
    }
  }
  return false;
}

// Ensure Prisma client is generated before starting the app
console.log('🔍 Checking Prisma client...');

if (!checkPrismaClient()) {
  console.log('⚙️ Prisma client not found, generating now...');
  
  try {
    // For Azure, don't load from load-env.js - use environment variables directly
    console.log('🌐 Using Azure environment variables directly');
    
    // Set dummy DATABASE_URL if needed for generation (Azure should have real one)
    if (!process.env.DATABASE_URL) {
      console.log('⚠️ DATABASE_URL not found, using dummy for generation');
      process.env.DATABASE_URL = 'postgresql://dummy:dummy@localhost:5432/dummy';
    } else {
      console.log('✅ DATABASE_URL found in environment');
    }
    
    // Generate Prisma client
    console.log('🔄 Generating Prisma client...');
    execSync('npx prisma generate --schema=./prisma/schema.prisma', { 
      stdio: 'inherit',
      cwd: path.join(__dirname, '..'),
      env: process.env
    });
    
    // Verify generation
    if (checkPrismaClient()) {
      console.log('✅ Prisma client generated successfully!');
    } else {
      console.log('❌ Prisma client generation failed');
      console.log('🔄 Attempting to continue anyway...');
    }
    
  } catch (error) {
    console.error('❌ Failed to generate Prisma client:', error.message);
    console.log('🔄 Attempting to start application anyway...');
  }
} else {
  console.log('✅ Prisma client already exists');
}

console.log('🚀 Starting application...');

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

// Handle process signals
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully');
  app.kill('SIGTERM');
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully');  
  app.kill('SIGINT');
});