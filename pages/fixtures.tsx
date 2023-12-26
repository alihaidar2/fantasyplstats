import React, { useState } from 'react';
import Layout from './layout';
import OldFixturesHeatmap from '../components/old_fixtures_heatmap';
import FixturesHeatmap from '../components/fixtures_heatmap';

const Fixtures: React.FC = () => {

  // State to determine which heatmap is active
  const [selectedHeatmap, setSelectedHeatmap] = useState('simple');



  return (
    <Layout>
      <div className='pb-5'>
        <div className="flex flex-col items-center justify-center pb-5 p-3">
          <h1 className="text-center font-sans text-2xl font-bold w-full">Fixture Difficulty Table</h1>
          {/* Buttons to select heatmaps */}
          <div className="flex flex-wrap gap-2 mt-3 justify-center">
            <button onClick={() => setSelectedHeatmap('simple')} className={`px-4 py-2 ${selectedHeatmap === 'simple' ? 'bg-blue-500 text-white' : 'bg-gray-200'} rounded hover:bg-blue-700`}>Simple Heatmap</button>
            <button className={`px-4 py-2 ${selectedHeatmap === 'attack' ? 'bg-blue-500 text-white' : 'bg-gray-200'} rounded hover:bg-blue-700`} onClick={() => setSelectedHeatmap('attack')}>Attack Heatmap</button>
            <button className={`px-4 py-2 ${selectedHeatmap === 'defense' ? 'bg-blue-500 text-white' : 'bg-gray-200'} rounded hover:bg-blue-700`} onClick={() => setSelectedHeatmap('defense')}>Defensive Heatmap</button>
            <button className={`px-4 py-2 ${selectedHeatmap === 'overall' ? 'bg-blue-500 text-white' : 'bg-gray-200'} rounded hover:bg-blue-700`} onClick={() => setSelectedHeatmap('overall')}>Overall Heatmap</button>
          </div>
        </div>
        <div className='mr-6 ml-3'>
        {selectedHeatmap === 'simple'
            ? <p className='italic pt-1 pb-3 px-3'>The Simple Heatmap is as its name suggests. Each team has a strength and it uses that to determine the difficulty of the next few fixtures</p>
            : <p className='italic pt-1 pb-3 px-3'>The Advanced Heatmaps delve a little bit deeper into the data. Using the teams' overall, attack and defense stats, as well as their home and away records, the difficulties of each team's next few fixtures are generated. </p>
          }
          {/* Conditional rendering of the heatmap components */}
          {selectedHeatmap === 'simple'
            ? <OldFixturesHeatmap />
            : <FixturesHeatmap selectedHeatmap={selectedHeatmap} />
          }
          {/* <p className='italic pt-1 pb-3 px-3'>The Advanced Heatmaps delve a little bit deeper into the data. Using the teams' overall, attack and defense stats, as well as their home and away records, the difficulties of each team's next few fixtures are generated. </p>
          <FixturesHeatmap selectedHeatmap={selectedHeatmap} /> */}
        </div>
      </div>
    </Layout>
  );
};

export default Fixtures;

