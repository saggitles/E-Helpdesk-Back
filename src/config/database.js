const { Client } = require('pg');
require('dotenv').config();

// FleetIQ Database Configuration
const fleetiqConfig = {
  host: process.env.FLEETIQ_DB_HOST || 'db-fleetiq-encrypt-01.cmjwsurtk4tn.us-east-1.rds.amazonaws.com',
  port: process.env.FLEETIQ_DB_PORT || 5432,
  database: process.env.FLEETIQ_DB_NAME || 'multi',
  user: process.env.FLEETIQ_DB_USER || 'readonly_user',
  password: process.env.FLEETIQ_DB_PASSWORD || 'StrongPassword123!',
  ssl: process.env.FLEETIQ_DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  max: 10
};

// E-Helpdesk Database Configuration (Azure PostgreSQL - managed by Prisma)
const ehelpdeeskConfig = {
  host: process.env.EHELPDDESK_DB_HOST || 'e-helpdesk-back-server.postgres.database.azure.com',
  port: process.env.EHELPDDESK_DB_PORT || 5432,
  database: process.env.EHELPDDESK_DB_NAME || 'ehelpdeskstaging',
  user: process.env.EHELPDDESK_DB_USER || 'ywgwyvuexp',
  password: process.env.EHELPDDESK_DB_PASSWORD || 'Saggitles123',
  ssl: process.env.EHELPDDESK_DB_SSL === 'true' ? { rejectUnauthorized: false } : { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  max: 10
};

// Snapshot Database Configuration (ngrok tunnel to local/remote database)
const snapshotConfig = {
  host: process.env.SNAPSHOT_DB_HOST || '2.tcp.ngrok.io',
  port: process.env.SNAPSHOT_DB_PORT || 11281,
  database: process.env.SNAPSHOT_DB_NAME || 'E-helpdesk',
  user: process.env.SNAPSHOT_DB_USER || 'postgres',
  password: process.env.SNAPSHOT_DB_PASSWORD || 'admin',
  ssl: process.env.SNAPSHOT_DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
  max: 5
};

// If DATABASE_URL is provided (for Azure), use it for E-Helpdesk
if (process.env.DATABASE_URL) {
  try {
    const url = new URL(process.env.DATABASE_URL);
    ehelpdeeskConfig.host = url.hostname;
    ehelpdeeskConfig.port = parseInt(url.port) || 5432;
    ehelpdeeskConfig.database = url.pathname.slice(1); // Remove leading slash
    ehelpdeeskConfig.user = url.username;
    ehelpdeeskConfig.password = url.password;
    ehelpdeeskConfig.ssl = url.searchParams.get('sslmode') === 'require' ? { rejectUnauthorized: false } : { rejectUnauthorized: false };
    console.log('✅ Using DATABASE_URL for E-Helpdesk database connection');
  } catch (error) {
    console.warn('⚠️ Failed to parse DATABASE_URL, using fallback config:', error.message);
  }
}

// Factory functions to create database clients with retry logic
const createFleetIQClient = () => {
  const client = new Client(fleetiqConfig);
  
  client.on('error', (err) => {
    console.error('FleetIQ database error:', err);
  });
  
  return client;
};

const createEHelpDeskClient = () => {
  const client = new Client(ehelpdeeskConfig);
  
  client.on('error', (err) => {
    console.error('E-Helpdesk database error:', err);
  });
  
  return client;
};

const createSnapshotClient = () => {
  const client = new Client(snapshotConfig);
  
  client.on('error', (err) => {
    console.error('Snapshot database error:', err);
  });
  
  return client;
};

// Enhanced connection test with better error reporting
const testConnection = async (clientFactory, name) => {
  try {
    const client = clientFactory();
    console.log(`🔍 Testing ${name} connection...`);
    
    const startTime = Date.now();
    await client.connect();
    const connectTime = Date.now() - startTime;
    
    await client.query('SELECT 1');
    const queryTime = Date.now() - startTime;
    
    await client.end();
    
    console.log(`✅ ${name} database connection successful (${connectTime}ms connect, ${queryTime}ms total)`);
    return true;
  } catch (error) {
    console.error(`❌ ${name} database connection failed:`, {
      message: error.message,
      code: error.code,
      errno: error.errno,
      syscall: error.syscall,
      address: error.address,
      port: error.port
    });
    return false;
  }
};

// Test database connections
const testConnections = async () => {
  console.log('🔍 Testing database connections...');
  
  const results = await Promise.allSettled([
    testConnection(createFleetIQClient, 'FleetIQ'),
    testConnection(createEHelpDeskClient, 'E-Helpdesk'),
    testConnection(createSnapshotClient, 'Snapshot')
  ]);
  
  const successful = results.filter(result => result.status === 'fulfilled' && result.value).length;
  const total = results.length;
  
  console.log(`📊 Database connection summary: ${successful}/${total} successful`);
  
  if (successful === 0) {
    console.warn('⚠️ No database connections available. Check your network and configuration.');
  } else if (successful < total) {
    console.warn('⚠️ Some database connections failed. Application may have limited functionality.');
  }
  
  return { successful, total, results };
};

module.exports = {
  createFleetIQClient,
  createEHelpDeskClient,
  createSnapshotClient,
  testConnections,
  fleetiqConfig,
  ehelpdeeskConfig,
  snapshotConfig
};