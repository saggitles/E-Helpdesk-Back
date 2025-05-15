const { Client } = require('pg');

global.pgClient = global.pgClient || new Client({
  host: 'db-fleetiq-encrypt-01.cmjwsurtk4tn.us-east-1.rds.amazonaws.com',
  port: 5432,
  database: 'multi',
  user: 'readonly_user',
  password: 'StrongPassword123!'
});

if (!global.pgClient._connected) {
  global.pgClient.connect()
    .then(() => console.log("✅ Connected to PostgreSQL"))
    .catch(err => console.error("❌ Database connection error:", err));
}
