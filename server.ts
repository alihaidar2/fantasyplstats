import mysql from 'mysql';
import { Fixture } from './types/Fixture';
import { Team } from './types/Team';

// Database connection
const connection = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: 'password',
  database: 'fantasy_pl'
});

// Function to get fixtures by gameweek
export const getFixturesByGameweek = (): Promise<Fixture[]> => {
  return new Promise((resolve, reject) => {
    connection.query('SELECT * FROM fixtures ORDER BY event, kickoff_time', (error, results) => {
      if (error) reject(error);
      else resolve(results);
    });
  });
};

// Function to get team names
export const getTeamNames = (): Promise<Team[]> => {
  return new Promise((resolve, reject) => {
    connection.query('SELECT team_id, team_name, short_name FROM teams', (error, results) => {
      if (error) reject(error);
      else resolve(results);
    });
  });
};
