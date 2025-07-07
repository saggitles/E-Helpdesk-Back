#!/usr/bin/env node
// Direct test of snapshot database via ngrok (bypassing config)

const { Client } = require('pg');

const testSnapshotDataDirect = async () => {
  console.log('🔍 Testing snapshot database DIRECTLY via ngrok...');
  console.log('📍 Connecting to: 2.tcp.ngrok.io:15425');
  
  // Create client with direct connection details (no config dependencies)
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
    
    // Test basic connection
    console.log('\n1️⃣ Testing basic connection...');
    const basicTest = await client.query('SELECT NOW() as current_time, current_database() as db_name');
    console.log(`📅 Database time: ${basicTest.rows[0].current_time}`);
    console.log(`🗄️ Database name: ${basicTest.rows[0].db_name}`);
    
    // Check available tables
    console.log('\n2️⃣ Checking available tables...');
    const tablesQuery = `
      SELECT table_name, table_type
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `;
    const tablesResult = await client.query(tablesQuery);
    console.log(`📋 Found ${tablesResult.rows.length} tables:`);
    tablesResult.rows.forEach(row => {
      console.log(`   - ${row.table_name} (${row.table_type})`);
    });
    
    if (tablesResult.rows.length === 0) {
      console.log('⚠️ No tables found in public schema');
      
      // Check other schemas
      console.log('\n🔍 Checking all schemas...');
      const schemasQuery = `
        SELECT schema_name 
        FROM information_schema.schemata 
        WHERE schema_name NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
        ORDER BY schema_name;
      `;
      const schemasResult = await client.query(schemasQuery);
      console.log(`📁 Found ${schemasResult.rows.length} user schemas:`);
      schemasResult.rows.forEach(row => {
        console.log(`   - ${row.schema_name}`);
      });
    }
    
    // Test specific data queries for common table names
    console.log('\n3️⃣ Testing data retrieval...');
    
    const possibleTableNames = [
      'Ticket', 'ticket', 'tickets',
      'User', 'user', 'users',
      'Comment', 'comment', 'comments',
      'File', 'file', 'files'
    ];
    
    for (const tableName of possibleTableNames) {
      try {
        const countQuery = `SELECT COUNT(*) as count FROM "${tableName}"`;
        const countResult = await client.query(countQuery);
        console.log(`📊 Table "${tableName}": ${countResult.rows[0].count} records`);
        
        if (countResult.rows[0].count > 0) {
          // Get sample data
          const sampleQuery = `SELECT * FROM "${tableName}" LIMIT 3`;
          const sampleResult = await client.query(sampleQuery);
          console.log(`📝 Sample data from "${tableName}":`);
          sampleResult.rows.forEach((row, index) => {
            console.log(`   ${index + 1}. ${JSON.stringify(row)}`);
          });
        }
        
      } catch (error) {
        // Table doesn't exist or other error - skip silently
      }
    }
    
    await client.end();
    console.log('\n✅ Test completed successfully');
    
  } catch (error) {
    console.error('\n❌ Test failed:', {
      message: error.message,
      code: error.code,
      detail: error.detail
    });
    
    if (error.code === 'ECONNREFUSED') {
      console.error('\n🔧 Connection refused - possible causes:');
      console.error('   - Wrong port number (should be 15425)');
      console.error('   - Local PostgreSQL database is not running');
      console.error('   - Database is not accepting connections on localhost:5432');
    } else if (error.code === 'ENOTFOUND') {
      console.error('\n🔧 DNS resolution failed - ngrok URL might be incorrect');
    } else if (error.code === '3D000') {
      console.error('\n🔧 Database "E-helpdesk" does not exist');
    } else if (error.code === '28P01') {
      console.error('\n🔧 Authentication failed - check username/password');
    }
  }
};

testSnapshotDataDirect();