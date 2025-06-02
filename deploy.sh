#!/bin/bash

# Print the Node.js and npm versions
echo "Node.js version: $(node -v)"
echo "npm version: $(npm -v)"

# Navigate to the application directory
cd "${DEPLOYMENT_TARGET}" || exit 1

# Install dependencies
echo "Installing dependencies..."
npm install --production

# Generate Prisma client
echo "Generating Prisma client..."
npx prisma generate

echo "Deployment completed successfully!"