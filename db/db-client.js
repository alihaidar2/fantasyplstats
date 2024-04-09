// const { Client } = require('pg');
// require('dotenv').config(); // Ensure this is at the top to load environment variables first

// // Create and configure the client
// const client = new Client({
//   connectionString: process.env.DATABASE_URL,
//   ssl: false, // Adjust SSL based on your environment requirements
//   // ssl: { rejectUnauthorized: false }
// });

// // Connect to the database
// client.connect(err => {
//   if (err) {
//     console.error('Connection error', err.stack);
//   } else {
//     console.log('Connected to the database');
//   }
// });

// module.exports = client;

const { Pool } = require('pg');
require('dotenv').config();

// Create and configure the pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  // connectionString: process.env.DATABASE_URL,
    ssl: false, // Adjust SSL based on your environment requirements
  //   ssl: { rejectUnauthorized: false }
});


module.exports = pool;
