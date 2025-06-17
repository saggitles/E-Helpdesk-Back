// Script to generate Prisma client in Azure environment
const { execSync } = require('child_process');
require('./load-env'); // Load environment variables

console.log('Azure Prisma Client Generation Script');
console.log('NODE_ENV:', process.env.NODE_ENV);

try {
  // Generate Prisma client using npx for simplicity
  console.log('Generating Prisma client...');
  execSync('npx prisma generate', { 
    stdio: 'inherit',
    env: {
      ...process.env,
      PRISMA_SCHEMA_ENGINE_BINARY: undefined,
      PRISMA_QUERY_ENGINE_LIBRARY: undefined,
      PRISMA_QUERY_ENGINE_BINARY: undefined
    }
  });
  
  console.log('Prisma client generated successfully');
  process.exit(0);
} catch (error) {
  console.error('Error generating Prisma client:', error.message);
  process.exit(1);
}