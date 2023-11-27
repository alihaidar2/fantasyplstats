// pages/api/teams.ts

import type { NextApiRequest, NextApiResponse } from 'next';
import mysql from 'mysql';
import { Team } from '../../types/Team';


// MySQL connection configuration
const connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'password',
  database: 'fantasy_pl'
});

export default function handler(req: NextApiRequest, res: NextApiResponse<Team[] | { message: string }>) {
  connection.query('SELECT * FROM Teams', (error: any, results: Team[]) => {
    if (error) {
      return res.status(500).json({ message: 'Error fetching data' });
    }
    res.status(200).json(results);
    
  });
}
