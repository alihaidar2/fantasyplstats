const next = require('next');
const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev }); // Initialize the Next.js application
const express = require('express');
const path = require('path');
const OpenAI = require("openai");
const apiKey = process.env.OPENAI_API_KEY; // Access the API key
const { initializeDatabase, updateData } = require('./db/db-setup'); // Adjust the path as needed



app.prepare().then(async () => {
  const server = express();
  server.use(express.json())
  
  // const openai = new OpenAI({
  //   apiKey: apiKey,
  // });

  // Database Operations
  try {
    console.log('Updating database...');
    await initializeDatabase()
    updateData();
    console.log('Database initialization completed.');

  } catch (error) {
    console.error('Error during database operations:', error);
    process.exit(1); // Exit if there is an error in DB operations
  }

  const port = 3000;
  server.listen(port, (err) => { // Use the httpServer to listen
    if (err) throw err;
    console.log(`> Ready on http://localhost:${port}`);
  });

});