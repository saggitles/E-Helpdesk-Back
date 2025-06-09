#!/bin/bash
# Custom deployment script for Azure that avoids prisma client generation
# This script focuses on database connection validation instead

echo "Starting deployment process..."
echo "Using NODE_ENV: $NODE_ENV"

# Load environment variables
echo "Loading environment variables..."
node ./prisma/load-env.js

# Skip the client generation step that causes permission errors
echo "Skipping Prisma client generation to avoid permission errors"

# Database migration verification
echo "Verifying database connection and schema compatibility..."
node ./prisma/azure-migrate.js

# If the verification was successful, start the app
if [ $? -eq 0 ]; then
  echo "Database verification successful, starting application..."
  npm start
else
  echo "Database verification failed. Please check your database connection and schema."
  exit 1
fi