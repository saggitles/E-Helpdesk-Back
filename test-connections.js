// Test script to verify database connections
const { testConnections } = require('./src/config/database');

console.log('🔍 Testing database connections...');

testConnections()
  .then(() => {
    console.log('✅ Database connection test completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Database connection test failed:', error);
    process.exit(1);
  });