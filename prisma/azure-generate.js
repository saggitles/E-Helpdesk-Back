// Script to programmatically generate Prisma client for Azure Functions
// This approach avoids shell execution permission issues

const path = require('path');
const fs = require('fs');
require('./load-env'); // Load environment variables

console.log('Azure Prisma Generate Script');
console.log('Node version:', process.version);
console.log('Current directory:', process.cwd());

// Check if node_modules/.prisma exists and create it if not
const prismaDir = path.join(process.cwd(), 'node_modules', '.prisma');
if (!fs.existsSync(prismaDir)) {
  console.log(`Creating directory: ${prismaDir}`);
  fs.mkdirSync(prismaDir, { recursive: true });
}

// Check if schema.prisma exists
const schemaPath = path.join(process.cwd(), 'prisma', 'schema.prisma');
if (!fs.existsSync(schemaPath)) {
  console.error('Error: schema.prisma not found at', schemaPath);
  process.exit(1);
}

try {
  console.log('Attempting to programmatically initialize Prisma client...');
  
  // First try to just require it, which will work if it's already generated
  try {
    console.log('Checking if Prisma client is already available...');
    const { PrismaClient } = require('@prisma/client');
    console.log('Prisma client is already available!');
  } catch (e) {
    // If requiring fails, we need to generate it
    console.log('Prisma client not available, attempting to generate...');
    
    // Use the Node.js API to run the Prisma generate command
    const { generateClient } = require('@prisma/client/generator-build');
    
    generateClient({
      datamodel: fs.readFileSync(schemaPath, 'utf-8'),
      binaryTargets: ['native', 'debian-openssl-1.1.x'],
    })
      .then(() => {
        console.log('Prisma client successfully generated');
        process.exit(0);
      })
      .catch(error => {
        console.error('Failed to generate Prisma client:', error);
        process.exit(1);
      });
  }
} catch (error) {
  console.error('Error during Prisma initialization:', error);
  process.exit(1);
}