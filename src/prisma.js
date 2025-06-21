// prisma.js
const { PrismaClient } = require('@prisma/client');

// PrismaClient is attached to the `global` object in development to prevent
// exhausting your database connection limit.
//
// Learn more: 
// https://pris.ly/d/help/next-js-best-practices

const globalForPrisma = global;

const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: ['error', 'warn'],
    errorFormat: 'pretty',
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// Test database connection on initialization
async function testConnection() {
  try {
    await prisma.$connect();
    console.log('✅ Database connected successfully');
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    console.error('Error code:', error.code);
    
    if (error.code === 'P1001') {
      console.error('🔧 Troubleshooting tips:');
      console.error('- Check if Azure PostgreSQL server is running');
      console.error('- Verify firewall rules allow Azure App Service connections');
      console.error('- Confirm DATABASE_URL is correct');
    }
    return false;
  }
}

// Test connection when module is loaded
if (process.env.NODE_ENV === 'production') {
  testConnection();
}

module.exports = prisma;