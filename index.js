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

// Enhanced CORS configuration to handle preflight requests properly
app.use(cors({
  origin: ['https://e-helpdesk-front.vercel.app', 'http://localhost:3000'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  optionsSuccessStatus: 200 // Some legacy browsers (IE11) choke on 204
}));

// Handle OPTIONS requests explicitly
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

app.use('/api', routes);


// routes para tickets

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Api is running on port ${PORT}`);
});

// Holis
