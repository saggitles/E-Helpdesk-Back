// This script helps set up the environment for Prisma in GitHub Actions
const fs = require('fs');
const path = require('path');

// Ensure required environment variables are available
const requiredEnvVars = ['DATABASE_URL'];

// Function to check environment variables
function checkEnvVars() {
  const missing = requiredEnvVars.filter(envVar => !process.env[envVar]);
  if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(', ')}`);
    console.error('Make sure these are set in GitHub Secrets and passed to the workflow');
    process.exit(1);
  } else {
    console.log('All required environment variables are present.');
  }
}

// Function to create .env file if it doesn't exist
function createEnvFile() {
  const envPath = path.resolve(__dirname, '../.env');
  const envProductionPath = path.resolve(__dirname, '../.env.production');
  
  try {
    // Create .env file
    let envContent = '';
    requiredEnvVars.forEach(envVar => {
      envContent += `${envVar}="${process.env[envVar]}"\n`;
    });
    
    // Write both .env and .env.production files
    fs.writeFileSync(envPath, envContent);
    fs.writeFileSync(envProductionPath, envContent);
    
    console.log('.env and .env.production files created successfully');
  } catch (error) {
    console.error('Error creating .env files:', error);
    process.exit(1);
  }
}

// Check environment variables
checkEnvVars();

// Create .env files
createEnvFile();

console.log('Environment setup completed successfully');