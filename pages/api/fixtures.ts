// import { getFixturesByGameweek, getTeamNames } from '@/server.js';
// import { getFixturesByGameweek, getTeamNames } from '@/server-old';
import type { NextApiRequest, NextApiResponse } from 'next';
// import { getFixturesByGameweek, getTeamNames } from '../../server-old';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const fixtures = await getFixturesByGameweek();
    // console.log("fixtures: " + fixtures)
    const teams = await getTeamNames();
    console.log("teams: " + teams)

    // Process the data for the heatmap
    res.status(200).json({ fixtures: fixtures, teams: teams });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
}


function getFixturesByGameweek() {
  throw new Error('Function not implemented.');
}

function getTeamNames() {
  throw new Error('Function not implemented.');
}
// function processHeatmapData(fixtures: any[], teams: any[]): any {
//   // console.log("heyyyy")
//   // Implement your data processing logic here
//   // ...
// }
