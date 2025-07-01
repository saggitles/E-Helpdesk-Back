#!/usr/bin/env node
// Pre-build script to generate Prisma client locally for Azure deployment

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔨 Pre-building Prisma client for Azure...');

try {
  // Set a dummy DATABASE_URL for local generation
  const originalUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = 'postgresql://dummy:dummy@localhost:5432/dummy';
  
  // Generate Prisma client locally
  console.log('🔄 Generating Prisma client locally...');
  execSync('npx prisma generate', { 
    stdio: 'inherit',
    env: process.env
  });
  
  // Restore original DATABASE_URL
  if (originalUrl) {
    process.env.DATABASE_URL = originalUrl;
  }
  
  // Check if client was generated
  const clientPath = path.join(__dirname, '..', 'node_modules', '.prisma', 'client');
  if (fs.existsSync(clientPath)) {
    console.log('✅ Prisma client generated successfully!');
    
    // Create a marker file to indicate pre-generated client
    fs.writeFileSync(
      path.join(clientPath, '.pre-generated'),
      'This Prisma client was pre-generated for Azure deployment'
    );
    
    console.log('📦 Marked client as pre-generated');
  } else {
    throw new Error('Client directory not found after generation');
  }
  
} catch (error) {
  console.error('❌ Pre-build failed:', error.message);
  process.exit(1);
}