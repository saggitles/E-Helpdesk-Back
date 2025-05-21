const express = require('express');
const routes = require('./src/routes'); 
const cors = require('cors'); 
const app = express();
const fileUpload = require('express-fileupload');
const path = require('path');

require('dotenv').config();

app.use(fileUpload({
  createParentPath: true,
}));

// Updated CORS configuration to handle frontend requests properly
app.use(cors({
  origin: [
    'https://e-helpdesk-front.vercel.app',
    'https://www.e-helpdesk-front.vercel.app',
    'http://localhost:3000'
  ],
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Access-Control-Allow-Headers',
    'Origin',
    'Accept',
    'X-Requested-With',
    'Content-Type',
    'Access-Control-Request-Method',
    'Access-Control-Request-Headers',
    'Authorization'
  ],
  exposedHeaders: ['Content-Disposition'],
  credentials: true,
  optionsSuccessStatus: 200,
  preflightContinue: false,
  maxAge: 86400 // 24 hours
}));

// Handle preflight OPTIONS requests for all routes
app.options('*', cors());

app.use(express.json());

// Fix double slash issue - normalize URL paths
app.use((req, res, next) => {
  // Normalize multiple slashes in the URL path
  if (req.url.includes('//')) {
    req.url = req.url.replace(/\/+/g, '/');
  }
  next();
});

// Add CORS headers to all responses as a fallback
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  next();
});

app.use('api', routes);

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Api is running on port ${PORT}`);
});
