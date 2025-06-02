const express = require('express');
const routes = require('./src/routes'); 
const cors = require('cors'); 
const app = express();
const fileUpload = require('express-fileupload');
const path = require('path');
const ensurePrismaClient = require('./prisma/azure-startup');

require('dotenv').config();

// Initialize the application asynchronously to ensure Prisma is ready
async function initializeApp() {
  // Ensure Prisma Client is properly generated (important for Azure Functions)
  await ensurePrismaClient();

  app.use(fileUpload({
    createParentPath: true,
  }));

  // Simple CORS enabling - most permissive approach
  app.use(cors());

  // Fix double slash issue - normalize URL paths
  app.use((req, res, next) => {
    // Normalize multiple slashes in the URL path
    if (req.url.includes('//')) {
      req.url = req.url.replace(/\/+/g, '/');
    }
    next();
  });

  // Add explicit CORS headers to all responses to ensure they're always present
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Access-Control-Allow-Headers');
    res.header('Access-Control-Max-Age', '86400'); // 24 hours
    
    // Handle preflight OPTIONS requests immediately
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }
    
    next();
  });

  app.use(express.json());
  app.use('/api', routes);

  const PORT = process.env.PORT || 8080;
  app.listen(PORT, () => {
    console.log(`Api is running on port ${PORT}`);
  });
}

// Start the application
initializeApp().catch(error => {
  console.error('Failed to initialize the application:', error);
  process.exit(1);
});
