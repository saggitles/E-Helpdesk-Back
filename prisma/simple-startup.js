// Simple startup script for testing
console.log('🚀 Simple Azure Startup: E-Helpdesk Backend');
console.log('📍 Environment: Azure App Service');

// Start the main application directly
const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Starting application directly...');

const app = spawn('node', ['index.js'], {
  stdio: 'inherit',
  cwd: path.join(__dirname, '..'),
  env: process.env
});

app.on('close', (code) => {
  console.log(`Application exited with code ${code}`);
  process.exit(code);
});

app.on('error', (error) => {
  console.error('Application error:', error);
  process.exit(1);
});

// Handle process signals
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully');
  app.kill('SIGTERM');
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully');  
  app.kill('SIGINT');
});