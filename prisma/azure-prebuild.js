// Script to generate Prisma client during build time before Azure deployment
// This ensures we have a generated client without needing to run prisma generate in Azure

const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
require('./load-env'); // Load environment variables

console.log('Azure Prebuild Script - Generating Prisma Client');
console.log('Node version:', process.version);

// Ensure the output directory exists
const prismaClientDir = path.join(process.cwd(), 'node_modules', '.prisma', 'client');
if (!fs.existsSync(prismaClientDir)) {
  console.log(`Creating Prisma client directory: ${prismaClientDir}`);
  fs.mkdirSync(prismaClientDir, { recursive: true });
}

// Run prisma generate during the build process
console.log('Running Prisma client generation...');
exec('npx prisma generate', (error, stdout, stderr) => {
  if (error) {
    console.error(`Error generating Prisma client: ${error.message}`);
    console.log('Attempting to continue despite error...');
    return;
  }
  
  if (stderr) {
    console.error(`Prisma generate stderr: ${stderr}`);
  }
  
  console.log(`Prisma client generation stdout: ${stdout}`);
  console.log('Prisma client generated successfully during build phase');
});

// Copy the schema.prisma file to ensure it's available 
const schemaPath = path.join(process.cwd(), 'prisma', 'schema.prisma');
const schemaDestPath = path.join(prismaClientDir, 'schema.prisma');
if (fs.existsSync(schemaPath)) {
  fs.copyFileSync(schemaPath, schemaDestPath);
  console.log(`Copied schema.prisma to ${schemaDestPath}`);
}

console.log('Azure prebuild setup completed');