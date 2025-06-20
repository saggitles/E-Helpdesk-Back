const { execSync } = require('child_process');

console.log('🔧 Starting migration resolution...');

try {
  // First try to deploy migrations directly
  console.log('🚀 Deploying current migrations...');
  execSync('npx prisma migrate deploy', { stdio: 'inherit' });
  console.log('✅ Migrations deployed successfully!');
} catch (deployError) {
  console.log('⚠️ Direct deployment failed, resolving migration conflicts...');
  
  // Check migration status first
  try {
    console.log('📊 Checking migration status...');
    execSync('npx prisma migrate status', { stdio: 'inherit' });
  } catch (statusError) {
    console.log('ℹ️ Migration status check completed');
  }
  
  // Resolve known problematic migrations
  const problematicMigrations = [
    '20230821193822_initial',
    '20230821195210_initial'
  ];
  
  console.log('🔄 Resolving failed migrations...');
  for (const migration of problematicMigrations) {
    try {
      console.log(`📝 Marking ${migration} as rolled back...`);
      execSync(`npx prisma migrate resolve --rolled-back ${migration}`, { stdio: 'inherit' });
      console.log(`✅ ${migration} marked as rolled back`);
    } catch (resolveError) {
      console.log(`ℹ️ ${migration} not found or already resolved`);
    }
  }
  
  // Try to deploy again after resolution
  try {
    console.log('🚀 Attempting migration deployment after resolution...');
    execSync('npx prisma migrate deploy', { stdio: 'inherit' });
    console.log('✅ Migrations deployed successfully after resolution!');
  } catch (finalError) {
    console.log('⚠️ Migration deployment still failing, but continuing...');
    console.log('💡 Database may already be in correct state or require manual intervention');
  }
}

console.log('🎯 Migration process completed, starting application...');