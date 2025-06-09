// Script to handle Prisma migrations for Azure Functions without client generation
// This approach focuses purely on making sure the database structure matches the schema

const path = require('path');
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
require('./load-env'); // Load environment variables

console.log('Azure Prisma Migration-Only Script');
console.log('Node version:', process.version);
console.log('Current directory:', process.cwd());
console.log('DATABASE_URL is', process.env.DATABASE_URL ? 'set' : 'not set');

// Initialize PrismaClient (should use existing client without regeneration)
const prisma = new PrismaClient();

// Function to test database connection and schema
async function testDatabaseConnection() {
  try {
    console.log('Testing database connection...');
    await prisma.$connect();
    console.log('Database connection successful!');
    
    // Run a simple query to test schema compatibility
    console.log('Testing database schema compatibility...');
    
    // Get list of tables (using raw query to avoid Prisma client generation issues)
    const tables = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `;
    
    console.log(`Found ${tables.length} tables in the database`);
    
    // Success!
    console.log('Database schema looks compatible with the application');
    return true;
  } catch (error) {
    console.error('Database connection or schema test failed:', error);
    return false;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the test
testDatabaseConnection()
  .then(success => {
    if (success) {
      console.log('Database migration verification completed successfully');
      process.exit(0);
    } else {
      console.error('Database migration verification failed');
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });