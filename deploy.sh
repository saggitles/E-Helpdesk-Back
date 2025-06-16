#!/bin/bash
# Custom deployment script for Azure that avoids permission issues
# This script avoids operations that require root permissions

echo "Starting deployment process..."
echo "Using NODE_ENV: $NODE_ENV"

# Set TMPDIR to use a writable location that doesn't require permissions changes
# This avoids the chown/chmod issues on /temp
export TMPDIR="/home/site/wwwroot/tmp"
export TEMP="/home/site/wwwroot/tmp"
export TMP="/home/site/wwwroot/tmp"

# Create a temp directory in a location we can write to without changing permissions
echo "Setting up temporary directory in a writable location..."
mkdir -p $TMPDIR

# Fix permissions for Prisma files based on Stack Overflow solution
echo "Fixing permissions for Prisma files..."
if [ -d "node_modules/.prisma" ]; then
  echo "Setting correct permissions for node_modules/.prisma"
  chmod -R 755 node_modules/.prisma
fi

# Create .prisma directory if it doesn't exist
mkdir -p node_modules/.prisma

# Set correct permissions (this is the key fix from Stack Overflow)
echo "Setting permissions for node_modules/.prisma"
chmod -R 755 node_modules/.prisma

# Load environment variables
echo "Loading environment variables..."
node ./prisma/load-env.js

# Apply migrations to existing database (without creating a new one)
echo "Applying pending migrations to existing database..."
node -e "
const { execSync } = require('child_process');
try {
  console.log('Running Prisma migrate deploy...');
  // Using the Node.js API to avoid permission issues with prisma CLI
  execSync('node ./node_modules/prisma/build/index.js migrate deploy --schema=./prisma/schema.prisma', { 
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: process.env.NODE_ENV || 'production'
    }
  });
  console.log('Migration completed successfully');
} catch (error) {
  console.error('Error during migration:', error.message);
  console.log('Attempting to continue despite migration error...');
}
"

# Database migration verification using direct PG connection
echo "Verifying database connection and schema compatibility..."
node ./prisma/azure-migrate.js

# If the verification was successful, start the app
if [ $? -eq 0 ]; then
  echo "Database verification successful, starting application..."
  node index.js
else
  echo "Database verification failed. Please check your database connection and schema."
  exit 1
fi