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

app.use(cors({
  origin: '*',
  optionsSuccessStatus: 204
}));

app.options('*', cors());


// app.use(cors({
//   origin: [
//     'http://localhost:3000/support/create/ticket',
//     'http://localhost:3000/support/tickets/pending',
//     /http:\/\/localhost:3000\/support\/update\/\d+/,
//     /http:\/\/localhost:3000\/support\/tickets\/\d+/,
//     'http://localhost:3000'
//   ]
// }));


app.use(express.json());

app.use('/api', routes);


// routes para tickets

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Api is running on port ${PORT}`);
});

// Holis
