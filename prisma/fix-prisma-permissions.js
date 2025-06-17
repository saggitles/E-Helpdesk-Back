// Script to fix Prisma binary permissions in Azure environment
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('Fixing Prisma binary permissions');

try {
  // Path to Prisma binaries - check both possible locations
  const prismaCliPath = path.join(process.cwd(), 'node_modules', '.bin', 'prisma');
  const prismaBinPath = path.join(process.cwd(), 'node_modules', 'prisma', 'build', 'index.js');
  
  // Check and fix permissions for the CLI executable
  if (fs.existsSync(prismaCliPath)) {
    console.log(`Found Prisma CLI at: ${prismaCliPath}`);
    try {
      execSync(`chmod +x "${prismaCliPath}"`, { stdio: 'inherit' });
      console.log('Set execute permission on Prisma CLI');
    } catch (error) {
      console.warn(`Warning: Could not chmod Prisma CLI: ${error.message}`);
    }
  } else {
    console.warn(`Prisma CLI not found at expected path: ${prismaCliPath}`);
  }
  
  // Check and fix permissions for the build directory script
  if (fs.existsSync(prismaBinPath)) {
    console.log(`Found Prisma bin script at: ${prismaBinPath}`);
    try {
      execSync(`chmod +x "${prismaBinPath}"`, { stdio: 'inherit' });
      console.log('Set execute permission on Prisma bin script');
    } catch (error) {
      console.warn(`Warning: Could not chmod Prisma bin script: ${error.message}`);
    }
  } else {
    console.warn(`Prisma bin script not found at expected path: ${prismaBinPath}`);
  }
  
  // Also fix permissions on engine binaries in .prisma folder
  const engineDir = path.join(process.cwd(), 'node_modules', '.prisma');
  if (fs.existsSync(engineDir)) {
    console.log(`Found .prisma engine directory at: ${engineDir}`);
    try {
      // Find and fix all binaries recursively
      execSync(`find "${engineDir}" -type f -exec chmod +x {} \\;`, { stdio: 'inherit' });
      console.log('Set execute permissions on Prisma engine binaries');
    } catch (error) {
      console.warn(`Warning: Could not chmod Prisma engine binaries: ${error.message}`);
    }
  } else {
    console.warn(`Prisma engine directory not found at expected path: ${engineDir}`);
  }
  
  console.log('Prisma permission fix completed');
} catch (error) {
  console.error('Error fixing Prisma permissions:', error);
}