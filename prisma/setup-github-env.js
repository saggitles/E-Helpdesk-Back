// Script to set up environment for GitHub Actions
const fs = require('fs');
const path = require('path');

console.log('Setting up environment for GitHub Actions...');

// Function to safely write environment variables to a file
function setupEnvironment() {
  try {
    // Check if running in GitHub Actions
    if (process.env.GITHUB_ACTIONS) {
      console.log('Running in GitHub Actions environment');
      
      // Create .env file from GitHub secrets if it doesn't exist
      const envPath = path.join(__dirname, '..', '.env');
      
      // Only create an .env file if it doesn't already exist
      if (!fs.existsSync(envPath)) {
        console.log('Creating .env file from GitHub secrets');
        
        // Create a basic .env file with the DATABASE_URL
        const envContent = `DATABASE_URL=${process.env.DATABASE_URL || ''}
PORT=${process.env.PORT || '8080'}
DOMAIN=${process.env.DOMAIN || ''}
CLIENT_ID=${process.env.CLIENT_ID || ''}
CLIENT_SECRET=${process.env.CLIENT_SECRET || ''}
`;
        
        fs.writeFileSync(envPath, envContent);
        console.log('.env file created successfully');
      } else {
        console.log('.env file already exists, skipping creation');
      }
    } else {
      console.log('Not running in GitHub Actions, using local environment');
    }
    
    console.log('Environment setup completed');
    return true;
  } catch (error) {
    console.error('Error setting up environment:', error);
    return false;
  }
}

// Run the setup function
const result = setupEnvironment();
if (!result) {
  console.error('Failed to set up environment');
  process.exit(1);
}

console.log('GitHub environment setup completed successfully');