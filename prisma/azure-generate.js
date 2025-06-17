// Script to generate Prisma client in Azure environment
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
require('./load-env'); // Load environment variables

console.log('Azure Prisma Client Generation Script');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('Current directory:', process.cwd());

try {
  // Check if schema file exists
  const schemaPath = path.join(process.cwd(), 'prisma', 'schema.prisma');
  console.log('Checking for schema at:', schemaPath);
  if (fs.existsSync(schemaPath)) {
    console.log('Schema file found');
  } else {
    throw new Error('Prisma schema file not found');
  }
  
  // Generate Prisma client using npx for simplicity
  console.log('Generating Prisma client...');
  execSync('npx prisma generate', { 
    stdio: 'inherit',
    env: {
      ...process.env,
      PRISMA_SCHEMA_ENGINE_BINARY: undefined,
      PRISMA_QUERY_ENGINE_LIBRARY: undefined,
      PRISMA_QUERY_ENGINE_BINARY: undefined
    }
  });
  
  // Verify client was created
  const clientPath = path.join(process.cwd(), 'node_modules', '.prisma', 'client');
  console.log('Checking for generated client at:', clientPath);
  if (fs.existsSync(clientPath)) {
    console.log('Prisma client directory exists, listing contents:');
    fs.readdirSync(clientPath).forEach(file => {
      console.log(`- ${file}`);
    });
  } else {
    console.warn('Warning: Prisma client directory not found after generation');
  }
  
  console.log('Prisma client generation completed');
  process.exit(0);
} catch (error) {
  console.error('Error generating Prisma client:', error.message);
  console.error(error.stack);
  process.exit(1);
}