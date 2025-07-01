// prisma.js with fallback to mock client for Azure deployment
let prisma;

try {
  const { PrismaClient } = require('@prisma/client');
  
  prisma = new PrismaClient({
    log: ['error', 'warn'],
    errorFormat: 'pretty',
  });
  
  console.log('✅ Using real Prisma client');
  
} catch (error) {
  console.log('⚠️ Real Prisma client failed, using mock client');
  console.log('Error:', error.message);
  
  // Fallback to mock client
  prisma = require('./mock-prisma');
}

// Test database connection on initialization
async function testConnection() {
  try {
    await prisma.$connect();
    console.log('✅ Database connected successfully');
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    
    // If real client fails, switch to mock
    if (error.code === 'P1001' || error.message.includes('prisma/client')) {
      console.log('🔄 Switching to mock client due to connection issues');
      prisma = require('./mock-prisma');
      return true;
    }
    
    return false;
  }
}

// Test connection when module is loaded
if (process.env.NODE_ENV === 'production') {
  testConnection();
}

module.exports = prisma;