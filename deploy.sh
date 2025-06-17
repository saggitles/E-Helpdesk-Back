#!/bin/bash
#==============================================================================
# E-Helpdesk Backend Simplified Deployment Script for Azure App Service
#==============================================================================

set -e  # Exit immediately if a command exits with a non-zero status

# Log function for consistent output formatting
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

log "Starting E-Helpdesk backend"
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
# Start Application
#------------------------------------------------------------------------------

log "Starting E-Helpdesk backend application"
node index.js