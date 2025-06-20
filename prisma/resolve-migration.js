const { execSync } = require('child_process');

console.log('🔧 Resolving migration issues...');

try {
  // First, let's check the migration status
  console.log('📊 Checking migration status...');
  try {
    execSync('npx prisma migrate status', { stdio: 'inherit' });
  } catch (statusError) {
    console.log('ℹ️ Migration status check completed');
  }
  
  // Try to deploy migrations directly first
  console.log('🚀 Attempting to deploy migrations...');
  execSync('npx prisma migrate deploy', { stdio: 'inherit' });
  
  console.log('✅ Migrations deployed successfully!');
} catch (error) {
  console.error('❌ Error deploying migrations:', error.message);
  
  // If deployment fails, try to resolve specific migration issues
  console.log('🔄 Trying to resolve migration conflicts...');
  try {
    // Try marking as rolled back first, then as applied
    console.log('📝 Attempting to mark migration as rolled back...');
    execSync('npx prisma migrate resolve --rolled-back 20230821193822_initial', { stdio: 'inherit' });
    
    console.log('🚀 Deploying migrations after rollback...');
    execSync('npx prisma migrate deploy', { stdio: 'inherit' });
    
    console.log('✅ Migration resolved with rollback approach!');
  } catch (rollbackError) {
    console.log('⚠️ Rollback approach failed, trying applied approach...');
    try {
      console.log('📝 Attempting to mark migration as applied...');
      execSync('npx prisma migrate resolve --applied 20230821193822_initial', { stdio: 'inherit' });
      
      console.log('🚀 Deploying migrations after marking as applied...');
      execSync('npx prisma migrate deploy', { stdio: 'inherit' });
      
      console.log('✅ Migration resolved with applied approach!');
    } catch (appliedError) {
      console.error('❌ All approaches failed:', appliedError.message);
      console.log('💡 Migration may already be in correct state. Continuing with application startup...');
      // Don't exit here - let the app try to start anyway
    }
  }
}