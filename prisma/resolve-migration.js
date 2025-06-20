const { execSync } = require('child_process');

console.log('🔧 Resolving migration issues...');

try {
  // Mark the failed migration as resolved
  console.log('📝 Marking failed migration as resolved...');
  execSync('npx prisma migrate resolve --applied 20230821193822_initial', { stdio: 'inherit' });
  
  // Deploy remaining migrations
  console.log('🚀 Deploying migrations...');
  execSync('npx prisma migrate deploy', { stdio: 'inherit' });
  
  console.log('✅ Migration issues resolved successfully!');
} catch (error) {
  console.error('❌ Error resolving migrations:', error.message);
  
  // Fallback: try to reset and deploy
  console.log('🔄 Trying fallback approach...');
  try {
    console.log('📝 Attempting to mark migration as rolled back...');
    execSync('npx prisma migrate resolve --rolled-back 20230821193822_initial', { stdio: 'inherit' });
    
    console.log('🚀 Deploying migrations...');
    execSync('npx prisma migrate deploy', { stdio: 'inherit' });
    
    console.log('✅ Migration resolved with fallback approach!');
  } catch (fallbackError) {
    console.error('❌ Fallback failed:', fallbackError.message);
    console.log('💡 Manual intervention may be required.');
    process.exit(1);
  }
}