const express = require('express');
const next = require('next');

const port = parseInt(process.env.PORT, 10) || 3000;
const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

// const path = require('path');
// const OpenAI = require("openai");
// const apiKey = process.env.OPENAI_API_KEY; // Access the API key
const { initializeDatabase, updateData } = require('./db/db-setup'); // Adjust the path as needed



app.prepare().then(async () => {
  const server = express();
  // server.use(express.json())
  server.use((err, req, res, next) => {
    console.error(err);
    res.status(500).send('Internal Server Errorr');
});


  // Database Operations
  try {
    console.log('Updating database...');
    // await initializeDatabase()
    // updateData();
    console.log('Database initialization completed.');

  } catch (error) {
    console.error('Error during database operations:', error);
    process.exit(1); // Exit if there is an error in DB operations
  }

  // you need this - this catch-all route passes all other requests to Next.js
  server.all('*', (req, res) => {
    return handle(req, res);
  });

  server.listen(port, (err) => { // Use the httpServer to listen
    if (err) throw err;
    console.log(`> Ready on http://localhost:${port}`);
  });

});