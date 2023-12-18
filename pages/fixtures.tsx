import React, { useState } from 'react';
import Layout from './layout';
import OldFixturesHeatmap from '../components/old_fixtures_heatmap';
import FixturesHeatmap from '../components/fixtures_heatmap';

const Fixtures: React.FC = () => {

  // State to determine which heatmap is active
  const [activeHeatmap, setActiveHeatmap] = useState('standard');
  const [selectedHeatmap, setSelectedHeatmap] = useState('standard');


  // Function to set the active heatmap
  const setActive = (heatmap) => {
    setActiveHeatmap(heatmap);
  };

  return (
    <Layout>
      <div className='pb-5'>
        <div className="flex flex-col items-center justify-center pb-5 p-3">
          <h1 className="text-center font-sans text-2xl font-bold w-full">Fixture Difficulty Table</h1>
          {/* Buttons to select heatmaps */}
          <div className="flex space-x-2 mt-3">
            <button onClick={() => setSelectedHeatmap('standard')} className={`px-4 py-2 ${selectedHeatmap === 'standard' ? 'bg-blue-500 text-white' : 'bg-gray-200'} rounded hover:bg-blue-700`}>Standard Heatmap</button>
            <button className={`px-4 py-2 ${selectedHeatmap === 'attack' ? 'bg-blue-500 text-white' : 'bg-gray-200'} rounded hover:bg-blue-700`} onClick={() => setSelectedHeatmap('attack')}>Attack Heatmap</button>
            <button className={`px-4 py-2 ${selectedHeatmap === 'defense' ? 'bg-blue-500 text-white' : 'bg-gray-200'} rounded hover:bg-blue-700`} onClick={() => setSelectedHeatmap('defense')}>Defensive Heatmap</button>
            <button className={`px-4 py-2 ${selectedHeatmap === 'overall' ? 'bg-blue-500 text-white' : 'bg-gray-200'} rounded hover:bg-blue-700`} onClick={() => setSelectedHeatmap('overall')}>Overall Heatmap</button>
          </div>
        </div>
        <div className='mr-6 ml-3'>
          {/* Conditional rendering of the heatmap components */}
          {selectedHeatmap === 'standard'
            ? <OldFixturesHeatmap />
            : <FixturesHeatmap selectedHeatmap={selectedHeatmap} />
          }

        </div>
      </div>
    </Layout>
  );
};

export default Fixtures;
