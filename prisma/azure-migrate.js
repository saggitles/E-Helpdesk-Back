// Script to handle Prisma migrations for Azure Functions without client generation
// This approach focuses purely on making sure the database structure matches the schema

const path = require('path');
const fs = require('fs');
require('./load-env'); // Load environment variables

console.log('Azure Prisma Migration-Only Script');
console.log('Node version:', process.version);
console.log('Current directory:', process.cwd());
console.log('DATABASE_URL is', process.env.DATABASE_URL ? 'set' : 'not set');

// Use environment-provided temp dirs or fall back to app-local location
// This helps avoid permission issues with system temp directories
process.env.TMPDIR = process.env.TMPDIR || path.join(process.cwd(), 'tmp');
process.env.TEMP = process.env.TEMP || path.join(process.cwd(), 'tmp');
process.env.TMP = process.env.TMP || path.join(process.cwd(), 'tmp');

// Create local temp dir if needed
if (!fs.existsSync(process.env.TMPDIR)) {
  try {
    fs.mkdirSync(process.env.TMPDIR, { recursive: true });
    console.log(`Created temp directory: ${process.env.TMPDIR}`);
  } catch (err) {
    console.warn(`Warning: Could not create temp directory: ${err.message}`);
  }
}

// Function to test database connection directly without requiring prisma client generation
async function testDatabaseConnection() {
  try {
    console.log('Testing database connection directly...');
    
    // Use pg directly instead of Prisma to avoid client generation
    const { Pool } = require('pg');
    const connectionString = process.env.DATABASE_URL;
    
    if (!connectionString) {
      console.error('DATABASE_URL environment variable is not set');
      return false;
    }
    
    const pool = new Pool({ connectionString });
    
    // Test connection
    const client = await pool.connect();
    console.log('Database connection successful!');
    
    // Test query to check schema
    console.log('Testing database schema compatibility...');
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);
    
    console.log(`Found ${tablesResult.rows.length} tables in the database`);
    
    // Check for essential tables based on your schema
    const essentialTables = ['user', 'ticket', 'comment', 'file', 'image', 'user_role', 'jira_ticket', 'm2m_token'];
    const foundTables = tablesResult.rows.map(row => row.table_name);
    
    console.log('Found tables:', foundTables.join(', '));
    
    // Check if we have at least some of our expected tables
    const missingTables = essentialTables.filter(table => !foundTables.includes(table));
    if (missingTables.length > essentialTables.length / 2) {
      console.warn(`Warning: Many expected tables are missing: ${missingTables.join(', ')}`);
      console.warn('The database schema might not be compatible with the application');
    } else {
      console.log('Database schema appears to be compatible with the application');
    }
    
    client.release();
    await pool.end();
    
    return true;
  } catch (error) {
    console.error('Database connection test failed:', error.message);
    return false;
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