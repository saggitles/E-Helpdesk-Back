#!/usr/bin/env node
// Test snapshot database data retrieval locally

const { createSnapshotClient } = require('./src/config/database');

const testSnapshotData = async () => {
  console.log('🔍 Testing snapshot database data retrieval...');
  console.log('📍 Connecting to: 2.tcp.ngrok.io:15425');
  
  const client = createSnapshotClient();

  try {
    const startTime = Date.now();
    await client.connect();
    const connectTime = Date.now() - startTime;
    
    console.log(`✅ Connected successfully in ${connectTime}ms`);
    
    // Test basic connection
    console.log('\n1️⃣ Testing basic connection...');
    const basicTest = await client.query('SELECT NOW() as current_time');
    console.log(`📅 Database time: ${basicTest.rows[0].current_time}`);
    
    // Check available tables
    console.log('\n2️⃣ Checking available tables...');
    const tablesQuery = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `;
    const tablesResult = await client.query(tablesQuery);
    console.log(`📋 Found ${tablesResult.rows.length} tables:`);
    tablesResult.rows.forEach(row => {
      console.log(`   - ${row.table_name}`);
    });
    
    // Test specific data queries
    console.log('\n3️⃣ Testing data retrieval...');
    
    // Test tickets table if it exists
    if (tablesResult.rows.some(row => row.table_name.toLowerCase().includes('ticket'))) {
      try {
        const ticketsQuery = 'SELECT COUNT(*) as ticket_count FROM "Ticket" LIMIT 1';
        const ticketsResult = await client.query(ticketsQuery);
        console.log(`🎫 Tickets count: ${ticketsResult.rows[0].ticket_count}`);
        
        // Get sample ticket data
        const sampleTicketsQuery = 'SELECT id, title, status, priority FROM "Ticket" LIMIT 5';
        const sampleTickets = await client.query(sampleTicketsQuery);
        console.log(`📝 Sample tickets (${sampleTickets.rows.length}):`);
        sampleTickets.rows.forEach(ticket => {
          console.log(`   - ID: ${ticket.id}, Title: ${ticket.title}, Status: ${ticket.status}`);
        });
      } catch (error) {
        console.log(`⚠️ Tickets table query failed: ${error.message}`);
      }
    }
    
    // Test users table if it exists
    if (tablesResult.rows.some(row => row.table_name.toLowerCase().includes('user'))) {
      try {
        const usersQuery = 'SELECT COUNT(*) as user_count FROM "User" LIMIT 1';
        const usersResult = await client.query(usersQuery);
        console.log(`👥 Users count: ${usersResult.rows[0].user_count}`);
        
        // Get sample user data
        const sampleUsersQuery = 'SELECT id, username, email FROM "User" LIMIT 5';
        const sampleUsers = await client.query(sampleUsersQuery);
        console.log(`👤 Sample users (${sampleUsers.rows.length}):`);
        sampleUsers.rows.forEach(user => {
          console.log(`   - ID: ${user.id}, Username: ${user.username}, Email: ${user.email}`);
        });
      } catch (error) {
        console.log(`⚠️ Users table query failed: ${error.message}`);
      }
    }
    
    // Test comments table if it exists
    if (tablesResult.rows.some(row => row.table_name.toLowerCase().includes('comment'))) {
      try {
        const commentsQuery = 'SELECT COUNT(*) as comment_count FROM "Comment" LIMIT 1';
        const commentsResult = await client.query(commentsQuery);
        console.log(`💬 Comments count: ${commentsResult.rows[0].comment_count}`);
      } catch (error) {
        console.log(`⚠️ Comments table query failed: ${error.message}`);
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
      console.error('\n🔧 Troubleshooting:');
      console.error('   - Make sure ngrok tunnel is running: ngrok tcp 5432');
      console.error('   - Verify the ngrok URL and port are correct');
      console.error('   - Check if local PostgreSQL is running');
    }
  }
};

testSnapshotData();