const mysql = require('mysql');
const dbConfig = {
    host: 'localhost',
    user: 'root',
    password: 'password',
    database: 'fantasy_pl',
};

// const mysql = require('mysql');
const fs = require('fs');
const csvParser = require('csv-parser');
const axios = require('axios'); // Import Axios
const token = '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'; // Replace with your actual token

const urls = require('C:\\Users\\ahaidar\\Documents\\dev\\personal\\fpl_web_app\\urls2223.js');

const TEAMS_CSV_URL = 'https://raw.githubusercontent.com/vaastav/Fantasy-Premier-League/master/data/2023-24/teams.csv';
const FIXTURES_CSV_URL = 'https://raw.githubusercontent.com/vaastav/Fantasy-Premier-League/master/data/2023-24/fixtures.csv';




const connection = mysql.createConnection(dbConfig);

connection.connect(error => {
    if (error) throw error;
    console.log("Successfully connected to the database.");
});



// DB - Connection Setup
// const connection = mysql.createConnection({
//   host: 'localhost',
//   user: 'root',
//   password: 'password',
//   database: 'fantasy_pl',
//   multipleStatements: true
// });

// DB - Create database tables
function createTables() {
  const sqlFilePath = "C:\\Users\\ahaidar\\Documents\\dev\\personal\\fpl_web_app\\sql_queries\\create_tables.sql";
  const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');

  connection.connect(err => {
    if (err) throw err;
    console.log('Connected to the database.');

    connection.query(sqlContent, (err, results) => {
      if (err) throw err;
      console.log('Tables created successfully.');
      // Do not close the connection here if you want to use it later for data import
    });
  });
}

/*** IMPORT SEASON DATA FIRST ***/
function importSeasons() {
  // Add seasons as the years go by
  const seasons = [
    { season_id: 1617, start_year: 2016, end_year: 2017 },
    { season_id: 1718, start_year: 2017, end_year: 2018 },
    { season_id: 1819, start_year: 2018, end_year: 2019 },
    { season_id: 1920, start_year: 2019, end_year: 2020 },
    { season_id: 2021, start_year: 2020, end_year: 2021 },
    { season_id: 2122, start_year: 2021, end_year: 2022 },
    { season_id: 2223, start_year: 2022, end_year: 2023 },
    { season_id: 2324, start_year: 2023, end_year: 2024 },
  ]; 

  seasons.forEach(season => {
    const query = 'INSERT INTO Seasons SET ?';
    connection.query(query, season, (err, result) => {
        if (err) {
            console.error('Error inserting season data:', err);
            return;
        }
        console.log('Season record inserted: ', result.insertId);
    });
  })
}


/**** IMPORT TEAMS DATA *****/ 
async function importTeamsData() {
  try {
    // Get season id from 
    const seasonId = getSeasonIdFromUrl(TEAMS_CSV_URL);
        if (!seasonId) {
            console.error('Could not extract season ID');
            return;
        }
    const response = await axios({
      method: 'get',
      url: TEAMS_CSV_URL,
      responseType: 'stream'
    });

    response.data
      .pipe(csvParser())
      .on('data', (teamData) => {
        insertTeamData(teamData, seasonId);
      })
      .on('end', () => {
        console.log('Team data import completed.');
      });
  } catch (error) {
    console.error('Error fetching team data:', error);
  }
}

function insertTeamData(teamData, seasonId) {
  
  // Map the CSV data to the database columns
  const mappedData = {
      team_id: teamData.id,  // Maps 'id' from CSV to 'team_id' in the database
      season_id: seasonId,  // You might want to set this based on your application logic
      team_name: teamData.name,
      code: teamData.code,
      draw: teamData.draw,
      form: teamData.form,
      loss: teamData.loss,
      played: teamData.played,
      points: teamData.points,
      position: teamData.position,
      short_name: teamData.short_name,
      strength: teamData.strength,
      team_division: teamData.team_division, 
      unavailable: teamData.unavailable === 'True',
      win: teamData.win,
      strength_overall_home: teamData.strength_overall_home,
      strength_overall_away: teamData.strength_overall_away,
      strength_attack_home: teamData.strength_attack_home,
      strength_attack_away: teamData.strength_attack_away,
      strength_defence_home: teamData.strength_defence_home,
      strength_defence_away: teamData.strength_defence_away,
      pulse_id: teamData.pulse_id
  };

  const query = 'INSERT INTO Teams SET ?';
  connection.query(query, mappedData, (err, result) => {
      if (err) {
          console.error('Error inserting team data:', err);
          return;
      }
      console.log('Team record inserted:', result.insertId);
  });
}

function getSeasonIdFromUrl(url) {
  const seasonPattern = /\/data\/(\d{4})-(\d{2})\//;
  const match = url.match(seasonPattern);
  if (match) {
    const firstPart = match[1].substring(2); // Gets the last two digits of the first part
    const secondPart = match[2]; // Gets the second part as is
    return parseInt(firstPart + secondPart, 10); // Combines and converts to integer
  }
  return null;
}


/**** IMPORT FIXTURES DATA ****/
async function importFixtures() {
  try {
    // Get season id from 
    const seasonId = getSeasonIdFromUrl(FIXTURES_CSV_URL);
        if (!seasonId) {
            console.error('Could not extract season ID');
            return;
        }
    const response = await axios({
      method: 'get',
      url: FIXTURES_CSV_URL,
      responseType: 'stream'
    });

    response.data
      .pipe(csvParser())
      .on('data', (fixtureData) => {
        insertFixtureData(fixtureData, seasonId);
      })
      .on('end', () => {
        console.log('Fixture data import completed.');
      });
  } catch (error) {
    console.error('Error fetching fixture data:', error);
  }
}

function insertFixtureData(fixtureData,seasonId) {
  const mappedData = {
    fixture_id: fixtureData.id,
    season_id: seasonId, // Adjust based on your logic or data
    event: fixtureData.event ? parseInt(fixtureData.event, 10) : null, // Check if event is empty
    finished: fixtureData.finished === 'True',
    kickoff_time: new Date(fixtureData.kickoff_time),
    team_a: parseInt(fixtureData.team_a),
    team_a_score: fixtureData.team_a_score ? parseInt(fixtureData.team_a_score, 10) : null,
    team_h: parseInt(fixtureData.team_h),
    team_h_score: fixtureData.team_h_score ? parseInt(fixtureData.team_h_score, 10) : null,
    team_h_difficulty: fixtureData.team_h_difficulty,
    team_a_difficulty: fixtureData.team_a_difficulty,
    pulse_id: fixtureData.pulse_id
  };

  const query = 'INSERT INTO Fixtures SET ?';
  connection.query(query, mappedData, (err, result) => {
    if (err) {
      console.error('Error inserting fixture data:', err);
      return;
    }
    console.log('Fixture record inserted:', result.insertId);
  });
}



// FUNCTIONS to iterate through github repo and set the data
async function processCSV(url) {
  try {
    // Axios call with responseType set to 'stream'
    const response = await axios({
      method: 'get',
      url: url,
      responseType: 'stream'
    });

    const data = [];

    response.data // response.data is a stream now
      .pipe(csvParser()) // Pipe it to csv-parser
      .on('data', (row) => data.push(row))
      .on('end', () => {
        console.log(`CSV file ${url} successfully processed`);
        // You can now use 'data' which contains the CSV rows
        insertDataIntoDatabase(data, url);
      })
      .on('error', (err) => {
        console.error('Error while parsing CSV:', err);
      });
  } catch (error) {
    console.error(`Error fetching CSV file from ${url}:`, error);
  }
}

function insertDataIntoDatabase(data, filePath) {
  // Determine the table to insert into based on file path or name
  const tableName = determineTable(filePath);

  data.forEach(row => {
    const query = `INSERT INTO ${tableName} SET ?`;
    connection.query(query, row, (err, result) => {
      if (err) {
        console.error('Error inserting data:', err);
        return;
      }
      console.log('Record inserted:', result.insertId);
    });
  });
}

function determineTable(filePath) {
  // This is a basic example. You should expand it based on your actual tables and file names.
  if (filePath.includes('cleaned_players')) {
    return 'PlayerSeasonStats';
  } else if (filePath.includes('players_raw')) {
    return 'Players';
  } else if (filePath.includes('gws')) {
    return 'GameWeekPlayerStats';
  } else if (filePath.includes('fixtures')) {
    return 'Fixtures';
  } else if (filePath.includes('understat')) {
    return 'UnderstatPlayerStats';
  }
  // Add more conditions as needed for other tables

  console.error(`Could not determine table for file: ${filePath}`);
  return null; // or a default table name, if you have one
}

function traverseDirectory(directory) {
  fs.readdirSync(directory).forEach(file => {
    const fullPath = path.join(directory, file);
    if (fs.lstatSync(fullPath).isDirectory()) {
      traverseDirectory(fullPath);
    } else if (fullPath.endsWith('.csv')) {
      processCSV(fullPath);
    }
  });
}

async function fetchRepoContents(path) {
  const repoBaseURL = 'https://api.github.com/repos/vaastav/Fantasy-Premier-League/contents/';
  const url = `${repoBaseURL}${path}`;

  try {
    const response = await axios.get(url, {
      headers: { 'Authorization': `token ${token}` }
    });
    return response.data; // Returns the contents of the directory
  } catch (error) {
    console.error(`Error fetching repository contents: ${error}`);
    return [];
  }
}

// Go through repository and get the data
// TODO : Modify this to only update the new data after you get an initial sample
async function findAllCSVFiles(path = 'data/') {
  const contents = await fetchRepoContents(path);
  let csvUrls = [];

  for (const item of contents) {
    if (item.type === 'file' && item.name.endsWith('.csv')) {
      csvUrls.push(item.download_url); // Use download_url for raw file content
    } else if (item.type === 'dir') {
      const subDirCsvUrls = await findAllCSVFiles(item.path);
      csvUrls = csvUrls.concat(subDirCsvUrls);
    }
  }
  console.log("Found CSV Urls : " + csvUrls)
  return csvUrls;
}

async function startProcess() {
  // const csvUrls = await findAllCSVFiles(); // iterates through all of the folders and files and gets the CSV links
  const csvUrls = urls; // iterates through all of the folders and files and gets the CSV links
  for (const url of csvUrls) {
    await processCSV(url);
  }
}

 

// Export the functions
module.exports = {
  importFixtures,
  importSeasons,
  createTables,
  importTeamsData,
  traverseDirectory,
  startProcess
};



module.exports = connection;

