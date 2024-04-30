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
console.log("pool: ", pool )


module.exports = pool;
