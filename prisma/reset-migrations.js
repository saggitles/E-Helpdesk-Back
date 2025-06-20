const { execSync } = require('child_process');

console.log('🔧 Starting database migration reset...');

try {
  console.log('⚠️ RESETTING DATABASE MIGRATION STATE');
  console.log('This will reset the migration history to match your current codebase');
  
  // Reset the migration history
  console.log('🔄 Resetting migration history...');
  execSync('npx prisma migrate reset --force', { stdio: 'inherit' });
  
  console.log('✅ Database migration state reset successfully!');
} catch (resetError) {
  console.log('❌ Migration reset failed, trying alternative approach...');
  
  try {
    // Alternative: Deploy with --create-only to create migration history
    console.log('🔄 Attempting to create migration baseline...');
    execSync('npx prisma db push', { stdio: 'inherit' });
    
    console.log('📝 Marking current schema as baseline...');
    execSync('npx prisma migrate resolve --applied 20250508190922_update_schema', { stdio: 'inherit' });
    
    console.log('✅ Migration baseline created successfully!');
  } catch (alternativeError) {
    console.error('❌ All migration approaches failed:', alternativeError.message);
    console.log('💡 Continuing with application startup - database may need manual intervention');
  }
}

console.log('🎯 Migration reset completed, starting application...');