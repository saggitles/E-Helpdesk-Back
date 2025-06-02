// This file ensures Prisma Client is properly generated on Azure Functions
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

// Check if Prisma client directory exists
const prismaClientDir = path.join(process.cwd(), 'node_modules', '.prisma', 'client');
const clientExists = fs.existsSync(prismaClientDir);

if (!clientExists) {
  console.log('Prisma Client not found, generating...');
  
  // Execute Prisma generate
  exec('npx prisma generate', (error, stdout, stderr) => {
    if (error) {
      console.error(`Error generating Prisma Client: ${error.message}`);
      return;
    }
    if (stderr) {
      console.error(`Prisma generate stderr: ${stderr}`);
    }
    console.log('Prisma Client successfully generated');
    console.log(stdout);
  });
} else {
  console.log('Prisma Client directory exists');
}

// Export a function that can be used in the main index.js
module.exports = async function ensurePrismaClient() {
  if (!clientExists) {
    // Wait a moment for generation to complete if it was needed
    return new Promise(resolve => setTimeout(resolve, 5000));
  }
  return Promise.resolve();
};