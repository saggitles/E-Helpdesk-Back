#!/bin/bash
# Custom deployment script for Azure that avoids permission issues
# This script avoids operations that require root permissions

echo "Starting deployment process..."
echo "Using NODE_ENV: $NODE_ENV"

# Set PRISMA_QUERY_ENGINE_BINARY to use a local path
export PRISMA_QUERY_ENGINE_BINARY="./node_modules/prisma/query-engine"
export PRISMA_MIGRATION_ENGINE_BINARY="./node_modules/prisma/migration-engine"
export PRISMA_INTROSPECTION_ENGINE_BINARY="./node_modules/prisma/introspection-engine"
export PRISMA_FMT_BINARY="./node_modules/prisma/prisma-fmt"

# Set TMPDIR to use a writable location that doesn't require permissions changes
# This avoids the chown/chmod issues on /temp
export TMPDIR="/home/site/wwwroot/tmp"
export TEMP="/home/site/wwwroot/tmp"
export TMP="/home/site/wwwroot/tmp"

# Create a temp directory in a location we can write to without changing permissions
echo "Setting up temporary directory in a writable location..."
mkdir -p $TMPDIR

# Load environment variables
echo "Loading environment variables..."
node ./prisma/load-env.js

echo "Generating Prisma client..."
# Use node to run the prisma generate command instead of calling prisma directly
# This avoids the permission issues with the prisma CLI
NODE_OPTIONS="--max_old_space_size=4096" node -e "
const { execSync } = require('child_process');
try {
  console.log('Checking for existing Prisma client...');
  require('@prisma/client');
  console.log('Prisma client already exists');
} catch (e) {
  console.log('Prisma client not found, generating...');
  try {
    // Use npx which has better permissions handling
    execSync('npx prisma generate', { stdio: 'inherit' });
    console.log('Prisma client generation completed');
  } catch (genError) {
    console.error('Failed to generate Prisma client:', genError);
    // Try an alternative method to generate the client
    console.log('Trying alternative generation method...');
    const { generate } = require('@prisma/internals');
    generate().catch(err => console.error('Alternative method failed:', err));
  }
}"

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