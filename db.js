const mysql = require('mysql');
const dbConfig = {
    host: 'localhost',
    user: 'root',
    password: 'password',
    database: 'fantasy_pl',
};

const connection = mysql.createConnection(dbConfig);

connection.connect(error => {
    if (error) throw error;
    console.log("Successfully connected to the database.");
});

module.exports = connection;
