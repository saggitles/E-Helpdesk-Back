// Script to verify database connection in Azure environment
const path = require('path');
const fs = require('fs');
require('./load-env'); // Load environment variables

console.log('Azure Database Connection Verification');
console.log('Node version:', process.version);
console.log('DATABASE_URL is', process.env.DATABASE_URL ? 'set' : 'not set');

// Use environment-provided temp dirs or fall back to app-local location
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

// Function to test database connection directly
async function testDatabaseConnection() {
  try {
    console.log('Testing database connection...');
    
    const { Pool } = require('pg');
    const connectionString = process.env.DATABASE_URL;
    
    if (!connectionString) {
      console.error('DATABASE_URL environment variable is not set');
      return false;
    }
    
    const pool = new Pool({ connectionString });
    const client = await pool.connect();
    console.log('Database connection successful!');
    
    // Simple test query to verify connection
    const result = await client.query('SELECT NOW()');
    console.log(`Database timestamp: ${result.rows[0].now}`);
    
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
      console.log('Database verification completed successfully');
      process.exit(0);
    } else {
      console.error('Database verification failed');
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });