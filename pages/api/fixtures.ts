import { getFixturesByGameweek, getTeamNames } from '@/server';
import type { NextApiRequest, NextApiResponse } from 'next';

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

// function processHeatmapData(fixtures: any[], teams: any[]): any {
//   // console.log("heyyyy")
//   // Implement your data processing logic here
//   // ...
// }
