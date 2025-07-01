#!/usr/bin/env node
// Script to test FleetIQ database connection and show detailed error info

const { createFleetIQClient } = require('./src/config/database');
const axios = require('axios');

async function testFleetIQConnection() {
  console.log('🔍 Testing FleetIQ Database Connection...');
  console.log('=====================================');
  
  // First, get our outbound IP
  try {
    console.log('📡 Getting outbound IP address...');
    const ipResponse = await axios.get('https://api.ipify.org?format=json', { timeout: 5000 });
    console.log(`✅ Current outbound IP: ${ipResponse.data.ip}`);
  } catch (error) {
    console.log(`⚠️ Could not determine outbound IP: ${error.message}`);
  }
  
  console.log('\n🗄️ Testing database connection...');
  
  const client = createFleetIQClient();
  
  try {
    console.log('Attempting to connect...');
    const startTime = Date.now();
    
    await client.connect();
    
    const connectionTime = Date.now() - startTime;
    console.log(`✅ Connected successfully in ${connectionTime}ms`);
    
    // Test a simple query
    console.log('Testing simple query...');
    const queryStart = Date.now();
    const result = await client.query('SELECT NOW() as current_time');
    const queryTime = Date.now() - queryStart;
    
    console.log(`✅ Query executed in ${queryTime}ms`);
    console.log(`📅 Database time: ${result.rows[0].current_time}`);
    
    await client.end();
    console.log('✅ Connection closed successfully');
    
  } catch (error) {
    console.error('\n❌ Connection failed!');
    console.error('Error details:');
    console.error(`  - Code: ${error.code}`);
    console.error(`  - Message: ${error.message}`);
    console.error(`  - Host: ${error.hostname || 'Unknown'}`);
    console.error(`  - Port: ${error.port || 'Unknown'}`);
    
    if (error.code === 'ENOTFOUND') {
      console.error('\n🔧 DNS Resolution issue - hostname cannot be resolved');
    } else if (error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
      console.error('\n🔧 Connection timeout - likely firewall blocking connection');
      console.error('   This usually means the source IP needs to be whitelisted');
    } else if (error.code === 'ECONNREFUSED') {
      console.error('\n🔧 Connection refused - service not running or port blocked');
    }
    
    process.exit(1);
  }
}

console.log('🔍 FleetIQ Database Connection Test');
console.log('==================================');

testFleetIQConnection();