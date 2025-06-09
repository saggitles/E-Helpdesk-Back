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

# Load environment variables
echo "Loading environment variables..."
node ./prisma/load-env.js

# Skip Prisma client generation completely - Azure may have permissions issues
echo "Skipping Prisma client generation to avoid permission errors"

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