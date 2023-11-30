const mysql2 = require('mysql2/promise')
const next = require('next');
const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev }); // Initialize the Next.js application
const port = 3000;
const handle = app.getRequestHandler();
const express = require('express');
const fs = require('fs').promises;
const path = require('path');




app.prepare().then(async () => {
  const server = express();

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

  // Next.js request handling
  server.all('*', (req, res) => {
    return handle(req, res);
  });

  server.listen(port, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://localhost:${port}`);
  });
});


// RECREATE ALL DATABASE TABLES
async function initializeDatabase() {
  const connection = await mysql2.createConnection({
    host: "localhost",
    user: "root",
    password: "password",
    database: "fantasy_pl"
  });

  const script = await fs.readFile(path.join(__dirname, 'queries\\create_tables.sql'), 'utf8');
  const statements = script.split(';');

  for (const statement of statements) {
    if (statement.trim()) {
      await connection.execute(statement);
    }
  }
  // await connection.execute(script);
  await connection.end();
}

// POPULATE ALL TABLES
async function updateData() {
  const connection = await createConnection();
  try {
    await deleteAllData(connection);
    await updateTeams(connection);
    await updateFixtures(connection);
    await updatePlayers(connection);
  } finally {
    connection.end();
  }
}

async function deleteAllData(connection) {
  // Delete existing data
  console.log("Deleting existing data...")
  await connection.execute(`DELETE FROM FIXTURES;`);
  await connection.execute(`DELETE FROM PLAYERS;`);
  await connection.execute(`DELETE FROM TEAMS;`);
  console.log("Deleted data")
}

async function updatePlayers(connection) {
  const url = "https://fantasy.premierleague.com/api/bootstrap-static";

  const response = await fetch(url);
  const data = await response.json();
  const players = data.elements

  for (const player of players) {
    await insertPlayer(player, connection);
  }
  console.log("All players have been inserted successfully.");
}

// Insert a team into the database - used by updateTeams()
async function insertPlayer(player, connection) {
  const sql = `
    INSERT INTO Players (
        player_id, season_id, chance_of_playing_next_round, chance_of_playing_this_round, code,
        cost_change_event, cost_change_event_fall, cost_change_start, cost_change_start_fall,
        dreamteam_count, element_type, ep_next, ep_this, event_points,
        first_name, form, in_dreamteam, news, news_added, now_cost, photo,
        points_per_game, second_name, selected_by_percent, special, squad_number,
        status, team_id, team_code, total_points, transfers_in, transfers_in_event,
        transfers_out, transfers_out_event, value_form, value_season, web_name,
        minutes, goals_scored, assists, clean_sheets, goals_conceded, own_goals,
        penalties_saved, penalties_missed, yellow_cards, red_cards, saves,
        bonus, bps, influence, creativity, threat, ict_index, starts,
        expected_goals, expected_assists, expected_goal_involvements, expected_goals_conceded,
        influence_rank, influence_rank_type, creativity_rank, creativity_rank_type,
        threat_rank, threat_rank_type, ict_index_rank, ict_index_rank_type,
        corners_and_indirect_freekicks_order, corners_and_indirect_freekicks_text,
        direct_freekicks_order, direct_freekicks_text, penalties_order, penalties_text,
        expected_goals_per_90, saves_per_90, expected_assists_per_90,
        expected_goal_involvements_per_90, expected_goals_conceded_per_90,
        goals_conceded_per_90, now_cost_rank, now_cost_rank_type, form_rank,
        form_rank_type, points_per_game_rank, points_per_game_rank_type, selected_rank,
        selected_rank_type, starts_per_90, clean_sheets_per_90
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;
  const values = [
    player.id,
    2324,
    player.chance_of_playing_next_round,
    player.chance_of_playing_this_round,
    player.code,
    player.cost_change_event,
    player.cost_change_event_fall,
    player.cost_change_start,
    player.cost_change_start_fall,
    player.dreamteam_count,
    player.element_type,
    parseFloat(player.ep_next),
    parseFloat(player.ep_this),
    player.event_points,
    player.first_name,
    parseFloat(player.form),
    player.in_dreamteam,
    player.news,
    player.news_added ? new Date(player.news_added).toISOString().slice(0, 19).replace('T', ' ') : null,
    player.now_cost,
    player.photo,
    player.points_per_game,
    player.second_name,
    player.selected_by_percent,
    player.special,
    player.squad_number,
    player.status,
    player.team,
    player.team_code,
    player.total_points,
    player.transfers_in,
    player.transfers_in_event,
    player.transfers_out,
    player.transfers_out_event,
    player.value_form,
    player.value_season,
    player.web_name,
    player.minutes,
    player.goals_scored,
    player.assists,
    player.clean_sheets,
    player.goals_conceded,
    player.own_goals,
    player.penalties_saved,
    player.penalties_missed,
    player.yellow_cards,
    player.red_cards,
    player.saves,
    player.bonus,
    player.bps,
    player.influence,
    player.creativity,
    player.threat,
    player.ict_index,
    player.starts,
    player.expected_goals,
    player.expected_assists,
    player.expected_goal_involvements,
    player.expected_goals_conceded,
    player.influence_rank,
    player.influence_rank_type,
    player.creativity_rank,
    player.creativity_rank_type,
    player.threat_rank,
    player.threat_rank_type,
    player.ict_index_rank,
    player.ict_index_rank_type,
    player.corners_and_indirect_freekicks_order,
    player.corners_and_indirect_freekicks_text,
    player.direct_freekicks_order,
    player.direct_freekicks_text,
    player.penalties_order,
    player.penalties_text,
    player.expected_goals_per_90,
    player.saves_per_90,
    player.expected_assists_per_90,
    player.expected_goal_involvements_per_90,
    player.expected_goals_conceded_per_90,
    player.goals_conceded_per_90,
    player.now_cost_rank,
    player.now_cost_rank_type,
    player.form_rank,
    player.form_rank_type,
    player.points_per_game_rank,
    player.points_per_game_rank_type,
    player.selected_rank,
    player.selected_rank_type,
    player.starts_per_90,
    player.clean_sheets_per_90
  ];


  await connection.execute(sql, values);
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
      multipleStatements: true
    });
  } catch (error) {
    console.error('Database connection failed:', error);
    throw error; // Re-throw the error for further handling if necessary
  }
}
