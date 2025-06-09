#!/bin/bash

# Azure deployment script for staging environment
# This script helps deploy the application to Azure App Service

echo "===== Starting Azure Staging Deployment ====="

# Set Azure environment variables
export AZURE_APP_NAME="ci-ehelpdesk-be-staging"
export AZURE_RESOURCE_GROUP="ci-ehelpdesk"
export AZURE_REGION="East US"

echo "Deploying to Azure App Service: $AZURE_APP_NAME"
echo "Resource Group: $AZURE_RESOURCE_GROUP"
echo "Region: $AZURE_REGION"

# Install Azure CLI if not already installed
if ! command -v az &> /dev/null; then
    echo "Azure CLI not found. Please install Azure CLI first."
    echo "Visit https://docs.microsoft.com/en-us/cli/azure/install-azure-cli"
    exit 1
fi

# Login to Azure (this will open a browser for authentication)
echo "Please log in to your Azure account..."
az login

# Set NODE_ENV to staging for this deployment
export NODE_ENV=staging

# Run necessary pre-deployment tasks
echo "Running pre-deployment tasks..."
npm run prebuild

# Create the App Service if it doesn't exist
echo "Checking if App Service exists..."
APP_EXISTS=$(az webapp list --resource-group "$AZURE_RESOURCE_GROUP" --query "[?name=='$AZURE_APP_NAME'].name" -o tsv)

if [ -z "$APP_EXISTS" ]; then
    echo "Creating new App Service: $AZURE_APP_NAME"
    az webapp create --name "$AZURE_APP_NAME" \
        --resource-group "$AZURE_RESOURCE_GROUP" \
        --plan "ASP-ciehelpdesk-b83e" \
        --runtime "NODE|18-lts"
else
    echo "App Service $AZURE_APP_NAME already exists"
fi

# Configure the App Service settings
echo "Configuring App Service settings..."
az webapp config set --name "$AZURE_APP_NAME" \
    --resource-group "$AZURE_RESOURCE_GROUP" \
    --node-version 18-lts \
    --startup-file "node index.js"

# Set environment variables from .env.staging
echo "Setting environment variables..."
if [ -f ".env.staging" ]; then
    while IFS='=' read -r key value; do
        # Skip empty lines and comments
        if [ -z "$key" ] || [[ "$key" =~ ^# ]]; then
            continue
        fi
        
        # Remove quotes from value if present
        value=$(echo $value | sed -e "s/^'//" -e "s/'$//")
        
        echo "Setting $key"
        az webapp config appsettings set --name "$AZURE_APP_NAME" \
            --resource-group "$AZURE_RESOURCE_GROUP" \
            --settings "$key=$value"
    done < .env.staging
else
    echo ".env.staging file not found!"
    exit 1
fi

# Deploy the application using ZIP deployment
echo "Deploying application to Azure..."
# Create a deployment package
echo "Creating deployment package..."
npm run build
zip -r deployment.zip . -x "node_modules/*" "*.git*" "*.env*"

# Deploy the ZIP package
echo "Uploading deployment package..."
az webapp deployment source config-zip --name "$AZURE_APP_NAME" \
    --resource-group "$AZURE_RESOURCE_GROUP" \
    --src "deployment.zip"

# Clean up
echo "Cleaning up deployment artifacts..."
rm deployment.zip

echo "===== Deployment Complete ====="
echo "Your application should now be available at: https://$AZURE_APP_NAME.azurewebsites.net"