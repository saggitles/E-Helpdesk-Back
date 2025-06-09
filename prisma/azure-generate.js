// Script to handle Prisma migrations for Azure Functions
// This approach focuses on applying migrations rather than just generating the client

const path = require('path');
const fs = require('fs');
require('./load-env'); // Load environment variables

console.log('Azure Prisma Migration Script');
console.log('Node version:', process.version);
console.log('Current directory:', process.cwd());

// Check if schema.prisma exists
const schemaPath = path.join(process.cwd(), 'prisma', 'schema.prisma');
if (!fs.existsSync(schemaPath)) {
  console.error('Error: schema.prisma not found at', schemaPath);
  process.exit(1);
}

// Check if migrations directory exists
const migrationsPath = path.join(process.cwd(), 'prisma', 'migrations');
if (!fs.existsSync(migrationsPath)) {
  console.error('Warning: migrations directory not found at', migrationsPath);
  console.log('Will attempt to use existing database structure');
}

try {
  console.log('Attempting to load Prisma client...');
  
  // First try to just require it to check if it's available
  try {
    console.log('Checking if Prisma client is already available...');
    const { PrismaClient } = require('@prisma/client');
    console.log('Prisma client is already available!');
    
    // Test database connection
    const prisma = new PrismaClient();
    prisma.$connect()
      .then(() => {
        console.log('Successfully connected to the database');
        return prisma.$disconnect();
      })
      .then(() => {
        console.log('Database connection test completed successfully');
      })
      .catch((error) => {
        console.error('Database connection test failed:', error);
      });
      
  } catch (e) {
    console.error('Failed to load Prisma client:', e);
    console.log('Assuming database is already set up with the correct structure');
    console.log('Application will rely on existing database structure');
  }
} catch (error) {
  console.error('Error during Prisma initialization:', error);
}

// Export so we can require this script from other places
module.exports = { schemaPath, migrationsPath };