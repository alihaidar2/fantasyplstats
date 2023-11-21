const express = require('express');
const mysql = require('mysql');
const app = express();
const port = 3001; // You can use any available port

// Database connection
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'password',
    database: 'fantasy_pl',
});

db.connect(error => {
    if (error) throw error;
    console.log("Successfully connected to the database.");
});

// API endpoint to get data from the Teams table
app.get('/api/teams', (req, res) => {
    db.query("SELECT * FROM Teams", (error, results) => {
        if (error) {
            res.status(500).send(error);
            return;
        }
        res.json(results);
    });
});

// Start the server
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
