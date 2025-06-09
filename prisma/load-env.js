// Script to load environment variables for Prisma
const { config } = require('dotenv');
const path = require('path');

// Load environment variables from .env file
config({ path: path.resolve(__dirname, '../.env') });

// Also try to load from .env.production if we're in production
if (process.env.NODE_ENV === 'production') {
  config({ path: path.resolve(__dirname, '../.env.production') });
}

// Also try to load from .env.staging if we're in staging
if (process.env.NODE_ENV === 'staging') {
  config({ path: path.resolve(__dirname, '../.env.staging') });
}

// Log that environment variables were loaded (but don't print the actual values for security)
console.log('Environment variables loaded. DATABASE_URL is', process.env.DATABASE_URL ? 'set' : 'not set');

// Export the environment for use in other scripts
module.exports = process.env;