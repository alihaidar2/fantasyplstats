const mysql2 = require('mysql2/promise')
const next = require('next');
const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev }); // Initialize the Next.js application
const port = 3000;
const handle = app.getRequestHandler();
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const { Client } = require('pg');

app.prepare().then(async () => {
  const server = express();

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

  const client = new Client({
    connectionString: process.env.DATABASE_URL, // Ensure DATABASE_URL is set in your environment variables
    // ssl: false // Disable SSL
    ssl: {
      rejectUnauthorized: false
    },
  });

  client.connect();

  const script = await fs.readFile(path.join(__dirname, 'queries\\create_tables_pg.sql'), 'utf8');
  const statements = script.split(';');

  for (const statement of statements) {
    if (statement.trim()) {
      await client.query(statement);
    }
  }
  await client.end();
}

// POPULATE ALL TABLES ---- THIS NEEDS TO BE RUN
async function updateData() {
  const connection = new Client({
    connectionString: process.env.DATABASE_URL, // Ensure DATABASE_URL is set in your environment variables
    // ssl: false // Disable SSL
    ssl: {
      rejectUnauthorized: false
    },
  });

  connection.connect();

  try {
    await deleteAllData(connection);
    await updateSeasons(connection);
    await updateTeams(connection);
    await updateFixtures(connection);
    await updatePlayers(connection);
    await updateGameweeks(connection);
  } finally {
    // connection.end();
  }
}

// Delete existing data
async function deleteAllData(connection) {
  console.log("Deleting existing data...")
  await connection.query(`DELETE FROM SEASONS;`);
  await connection.query(`DELETE FROM FIXTURES;`);
  await connection.query(`DELETE FROM PLAYERS;`);
  await connection.query(`DELETE FROM TEAMS;`);
  await connection.query(`DELETE FROM GAMEWEEKS;`);
  console.log("Deleted data")
}


// Insert the Season
async function updateSeasons(connection) {
  const sql = `
    INSERT INTO Seasons (
        season_id, start_year, end_year
    ) VALUES (2324, 2023, 2024)
  `;
  await connection.query(sql);
  console.log("Added seasons")
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
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44, $45, $46, $47, $48, $49, $50, $51, $52, $53, $54, $55, $56, $57, $58, $59, $60, $61, $62, $63, $64, $65, $66, $67, $68, $69, $70, $71, $72, $73, $74, $75, $76, $77, $78, $79, $80, $81, $82, $83, $84, $85, $86, $87, $88, $89)
  `;

  const newsAddedFormatted = player.news_added ? new Date(player.news_added).toISOString().slice(0, 19).replace('T', ' ') : null;

  const values = [
    player.id,
    2324, // Assuming a constant season_id
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
    newsAddedFormatted,
    player.now_cost,
    player.photo,
    parseFloat(player.points_per_game),
    player.second_name,
    parseFloat(player.selected_by_percent),
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
    parseFloat(player.value_form),
    parseFloat(player.value_season),
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
    parseFloat(player.influence),
    parseFloat(player.creativity),
    parseFloat(player.threat),
    parseFloat(player.ict_index),
    player.starts,
    parseFloat(player.expected_goals),
    parseFloat(player.expected_assists),
    parseFloat(player.expected_goal_involvements),
    parseFloat(player.expected_goals_conceded),
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
    parseFloat(player.expected_goals_per_90),
    parseFloat(player.saves_per_90),
    parseFloat(player.expected_assists_per_90),
    parseFloat(player.expected_goal_involvements_per_90),
    parseFloat(player.expected_goals_conceded_per_90),
    parseFloat(player.goals_conceded_per_90),
    player.now_cost_rank,
    player.now_cost_rank_type,
    player.form_rank,
    player.form_rank_type,
    player.points_per_game_rank,
    player.points_per_game_rank_type,
    player.selected_rank,
    player.selected_rank_type,
    parseFloat(player.starts_per_90),
    parseFloat(player.clean_sheets_per_90)
  ];

  await connection.query(sql, values);
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

async function insertFixture(fixture, connection) {
  const sql = `
    INSERT INTO fixtures (
        fixture_id, season_id, event, finished,  
        kickoff_time, minutes, started, 
        team_a, team_a_score, team_h, team_h_score, 
        team_h_difficulty, team_a_difficulty, pulse_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
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

  await connection.query(sql, values);
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
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
  `;
  const values = [
    2324, // Assuming 2324 is a constant season_id
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

  await connection.query(sql, values);
}


async function updateGameweeks(connection) {
  const url = "https://fantasy.premierleague.com/api/bootstrap-static"; // Replace with your API URL

  const response = await fetch(url);
  const data = await response.json();
  const gameweeks = data.events; // Adjust according to the actual response structure

  for (const gameweek of gameweeks) {
    await insertGameweek(gameweek, connection);
  }
  console.log("All gameweeks have been inserted successfully.");
}

async function insertGameweek(gameweek, connection) {
  const sql = `
    INSERT INTO gameweeks (
        id, name, deadline_time, average_entry_score, 
        finished, data_checked, highest_scoring_entry, 
        deadline_time_epoch, deadline_time_game_offset, 
        highest_score, is_previous, is_current, 
        is_next, cup_leagues_created, h2h_ko_matches_created, 
        most_selected, most_transferred_in, top_element, 
        transfers_made, most_captained, most_vice_captained
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
  `;
  const values = [
    gameweek.id,
    gameweek.name,
    new Date(gameweek.deadline_time).toISOString().slice(0, 19).replace('T', ' '),
    gameweek.average_entry_score,
    gameweek.finished,
    gameweek.data_checked,
    gameweek.highest_scoring_entry,
    gameweek.deadline_time_epoch,
    gameweek.deadline_time_game_offset,
    gameweek.highest_score,
    gameweek.is_previous,
    gameweek.is_current,
    gameweek.is_next,
    gameweek.cup_leagues_created,
    gameweek.h2h_ko_matches_created,
    gameweek.most_selected,
    gameweek.most_transferred_in,
    gameweek.top_element,
    gameweek.transfers_made,
    gameweek.most_captained,
    gameweek.most_vice_captained
  ];

  await connection.query(sql, values);
}
