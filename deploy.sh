#!/bin/bash
#==============================================================================
# E-Helpdesk Backend Deployment Script for Azure App Service
# 
# This script handles the deployment process for the E-Helpdesk backend in 
# Azure App Service environments, ensuring proper database migration and
# application startup with appropriate permissions.
#
# Maintained by: E-Helpdesk Development Team
# Last updated: June 16, 2025
#==============================================================================

set -e  # Exit immediately if a command exits with a non-zero status

# Log function for consistent output formatting
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

log "Starting E-Helpdesk backend deployment"
log "Environment: ${NODE_ENV:-production}"

#------------------------------------------------------------------------------
# Environment Configuration
#------------------------------------------------------------------------------

# Configure writable temp directory locations to avoid permission issues
# Azure App Service restricts access to system temp directories
log "Configuring temporary directories"
export TMPDIR="/home/site/wwwroot/tmp"
export TEMP="/home/site/wwwroot/tmp"
export TMP="/home/site/wwwroot/tmp"

# Create temp directory with appropriate permissions
mkdir -p $TMPDIR
log "Temporary directory configured at $TMPDIR"

#------------------------------------------------------------------------------
# Prisma Configuration and Permissions
#------------------------------------------------------------------------------

# Set up Prisma directories with correct permissions
# This is critical for Prisma to work in Azure App Service's restricted environment
log "Setting up Prisma directories and permissions"

# Create .prisma directory if needed
mkdir -p node_modules/.prisma

# Set proper permissions - this is essential for Prisma to work
chmod -R 755 node_modules/.prisma
log "Prisma directory permissions configured"

#------------------------------------------------------------------------------
# Environment and Database Setup
#------------------------------------------------------------------------------

# Load environment variables from appropriate .env file
log "Loading environment configuration"
node ./prisma/load-env.js

# Apply database migrations safely to existing database
log "Applying pending database migrations"
node -e "
const { execSync } = require('child_process');
try {
  console.log('Executing Prisma migrate deploy...');
  execSync('node ./node_modules/prisma/build/index.js migrate deploy --schema=./prisma/schema.prisma', { 
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: process.env.NODE_ENV || 'production'
    }
  });
  console.log('Database migration completed successfully');
} catch (error) {
  console.error('Migration error:', error.message);
  console.log('Continuing deployment despite migration issues');
}
"

#------------------------------------------------------------------------------
# Database Verification
#------------------------------------------------------------------------------

# Verify database connection and schema compatibility
log "Verifying database connection and schema compatibility"
node ./prisma/azure-migrate.js
MIGRATION_STATUS=$?

#------------------------------------------------------------------------------
# Application Startup
#------------------------------------------------------------------------------

# Start application if database verification succeeded
if [ $MIGRATION_STATUS -eq 0 ]; then
  log "Database verification successful"
  log "Starting E-Helpdesk backend application"
  node index.js
else
  log "ERROR: Database verification failed"
  log "Please check your database connection string and schema compatibility"
  exit 1
fi