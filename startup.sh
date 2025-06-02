#!/bin/bash

echo "Running startup script for Azure App Service..."

# Navigate to application directory
cd /home/site/wwwroot

# Ensure environment variables are set
if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL environment variable not set. Please configure it in the Azure portal."
  exit 1
fi

# Generate Prisma client
echo "Generating Prisma client..."
npx prisma generate

# Start the application
echo "Starting application..."
node index.js