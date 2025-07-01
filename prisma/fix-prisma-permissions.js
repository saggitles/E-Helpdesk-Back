#!/usr/bin/env node
// Script to fix Prisma binary permissions in Azure Linux containers

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔧 Fixing Prisma permissions for Azure deployment...');

try {
  // Fix permissions for Prisma binaries
  const pathsToFix = [
    '/node_modules/.bin/prisma',
    './node_modules/.bin/prisma',
    '/node_modules/prisma/build/index.js',
    './node_modules/prisma/build/index.js',
    '/node_modules/@prisma/engines/*',
    './node_modules/@prisma/engines/*'
  ];

  for (const targetPath of pathsToFix) {
    try {
      if (fs.existsSync(targetPath.replace('*', ''))) {
        execSync(`chmod +x ${targetPath} 2>/dev/null || true`, { stdio: 'inherit' });
        console.log(`✅ Fixed permissions for: ${targetPath}`);
      }
    } catch (error) {
      // Silent fail - this is expected for some paths
    }
  }

  // Fix entire .bin directory
  try {
    execSync('chmod +x /node_modules/.bin/* 2>/dev/null || true', { stdio: 'inherit' });
    execSync('chmod +x ./node_modules/.bin/* 2>/dev/null || true', { stdio: 'inherit' });
    console.log('✅ Fixed .bin directory permissions');
  } catch (error) {
    console.log('⚠️ Could not fix .bin directory permissions');
  }

  console.log('🏁 Prisma permissions fix completed');

} catch (error) {
  console.error('❌ Error fixing Prisma permissions:', error.message);
  // Don't exit with error to allow build to continue
}