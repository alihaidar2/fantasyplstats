const mysql2 = require('mysql2/promise')
const next = require('next');
const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev }); // Initialize the Next.js application
const port = 3000;
const handle = app.getRequestHandler();
const express = require('express');



app.prepare().then(async () => {
  const server = express();

  // Database Operations
  try {
    console.log('Updating database...');
    updateData();

    console.log('Database initialization completed.');
  } catch (error) {
    console.error('Error during database operations:', error);
    process.exit(1); // Exit if there is an error in DB operations
  }

  // Next.js request handling
  server.all('*', (req, res) => {
    return handle(req, res);
  });

  server.listen(port, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://localhost:${port}`);
  });
});


async function updateData() {
  const connection = await createConnection();

  try {
    await deleteAllData(connection);
    await updateTeams(connection);
    await updateFixtures(connection);
  } finally {
    connection.end();
  }
}

async function deleteAllData(connection) {
  // Delete existing data
  console.log("Deleting existing data...")
  await connection.execute(`DELETE FROM FIXTURES;`);
  await connection.execute(`DELETE FROM TEAMS;`);
  console.log("Deleted data")
}

async function updateFixtures(connection) {
  const url = "https://fantasy.premierleague.com/api/fixtures";

  const response = await fetch(url);
  const fixtures = await response.json();

  for (const fixture of fixtures) {
    if (fixture.event != null) {
      await insertFixture(fixture, connection);
    }
  }
  console.log("All fixtures have been inserted successfully.");
}

// Insert a team into the database - used by updateTeams()
async function insertFixture(fixture, connection) {
  const sql = `
    INSERT INTO fixtures (
        fixture_id, season_id, event, finished,  
        kickoff_time, minutes, started, 
        team_a, team_a_score, team_h, team_h_score, 
        team_h_difficulty, team_a_difficulty, pulse_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;
  const values = [
    fixture.id,
    2324,
    fixture.event,
    fixture.finished,
    new Date(fixture.kickoff_time).toISOString().slice(0, 19).replace('T', ' '),
    fixture.minutes,
    fixture.started,
    fixture.team_a,
    fixture.team_a_score,
    fixture.team_h,
    fixture.team_h_score,
    fixture.team_h_difficulty,
    fixture.team_a_difficulty,
    fixture.pulse_id,
  ];

  await connection.execute(sql, values);
}

// Fetch teams data from the API
async function updateTeams(connection) {
  const url = "https://fantasy.premierleague.com/api/bootstrap-static/";

  const response = await fetch(url);
  const data = await response.json();
  const teams = data.teams; // Access the teams section

  for (const team of teams) {
    await insertTeam(team, connection);
  }
  console.log("All teams have been inserted successfully.");
}

// Insert a team into the database - used by updateTeams()
async function insertTeam(team, connection) {
  const sql = `
      INSERT INTO TEAMS (season_id, code, draw, form, team_id, loss, team_name, played, points, position, short_name, strength, team_division, unavailable, win, strength_overall_home, strength_overall_away, strength_attack_home, strength_attack_away, strength_defence_home, strength_defence_away, pulse_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;
  const values = [
    2324,
    team.code,
    team.draw,
    team.form,
    team.id,
    team.loss,
    team.name,
    team.played,
    team.points,
    team.position,
    team.short_name,
    team.strength,
    team.team_division,
    team.unavailable,
    team.win,
    team.strength_overall_home,
    team.strength_overall_away,
    team.strength_attack_home,
    team.strength_attack_away,
    team.strength_defence_home,
    team.strength_defence_away,
    team.pulse_id,
  ];

  await connection.execute(sql, values);
}

// Create connection to DB
async function createConnection() {
  try {
    return await mysql2.createConnection({
      host: "localhost",
      user: "root",
      password: "password",
      database: "fantasy_pl",
      multipleStatements: true,
    });
  } catch (error) {
    console.error('Database connection failed:', error);
    throw error; // Re-throw the error for further handling if necessary
  }
}
