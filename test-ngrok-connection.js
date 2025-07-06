#!/usr/bin/env node
// Test ngrok snapshot database connection

const { Client } = require('pg');

const testNgrokConnection = async () => {
  console.log('🔍 Testing ngrok snapshot database connection...');
  console.log('📍 Connecting to: 2.tcp.ngrok.io:15425');
  
  const client = new Client({
    host: '2.tcp.ngrok.io',
    port: 15425,
    database: 'E-helpdesk',
    user: 'postgres',
    password: 'admin',
    ssl: false,
    connectionTimeoutMillis: 10000
  });

  try {
    const startTime = Date.now();
    await client.connect();
    const connectTime = Date.now() - startTime;
    
    console.log(`✅ Connected successfully in ${connectTime}ms`);
    
    // Test a simple query
    const result = await client.query('SELECT NOW() as current_time, version() as pg_version');
    console.log(`✅ Query executed successfully`);
    console.log(`📅 Database time: ${result.rows[0].current_time}`);
    console.log(`🗄️ PostgreSQL version: ${result.rows[0].pg_version}`);
    
    await client.end();
    console.log('✅ Connection closed successfully');
    
  } catch (error) {
    console.error('❌ Connection failed:', {
      message: error.message,
      code: error.code,
      address: error.address,
      port: error.port
    });
    
    if (error.code === 'ECONNREFUSED') {
      console.error('🔧 Connection refused - possible causes:');
      console.error('   - ngrok tunnel is not running');
      console.error('   - Wrong port number');
      console.error('   - Local database is not running');
    } else if (error.code === 'ENOTFOUND') {
      console.error('🔧 DNS resolution failed - ngrok URL might be incorrect');
    }
  }
};

testNgrokConnection();