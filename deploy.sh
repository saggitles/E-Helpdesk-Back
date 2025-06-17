#!/bin/bash
#==============================================================================
# E-Helpdesk Backend Deployment Script for Azure App Service
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

# Configure writable temp directory to avoid permission issues
log "Configuring temporary directory"
export TMPDIR="/home/site/wwwroot/tmp"
export TEMP="/home/site/wwwroot/tmp"
export TMP="/home/site/wwwroot/tmp"

# Create temp directory
mkdir -p $TMPDIR
log "Temporary directory configured at $TMPDIR"

#------------------------------------------------------------------------------
# Load Environment Variables
#------------------------------------------------------------------------------

# Load environment variables from appropriate .env file
log "Loading environment configuration"
node ./prisma/load-env.js

#------------------------------------------------------------------------------
# Database Setup
#------------------------------------------------------------------------------

# Apply database migrations using simplified approach
log "Applying database migrations"
npx prisma migrate deploy --schema=./prisma/schema.prisma

# Verify database connection and schema
log "Verifying database connection"
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