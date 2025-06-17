// Script to generate Prisma client during build time before Azure deployment
const { execSync } = require('child_process');
require('./load-env'); // Load environment variables

console.log('Azure Prebuild Script - Generating Prisma Client');
console.log('Node version:', process.version);

try {
  // Run prisma generate during the build process
  console.log('Running Prisma client generation...');
  execSync('npx prisma generate', { stdio: 'inherit' });
  console.log('Prisma client generated successfully during build phase');
} catch (error) {
  console.error(`Error generating Prisma client: ${error.message}`);
  console.log('Continuing deployment despite error...');
}

console.log('Azure prebuild setup completed');