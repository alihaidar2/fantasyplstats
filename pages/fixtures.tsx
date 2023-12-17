import React from 'react';
import Layout from './layout';
import FixturesHeatmap from '../components/fixtures_heatmap';

const Fixtures: React.FC = () => {
  return (
    <Layout>
      <div className='pb-5'>
        <div className="flex flex-col items-center justify-center pb-5 p-3"> {/* Adjust padding as needed */}
          <h1 className="text-center font-sans text-2xl font-bold w-full">Fixture Difficulty Table</h1>
        </div>
        <div className='mr-6 ml-3'>
          <FixturesHeatmap />
        </div>
      </div>

    </Layout>
  );
};

export default Fixtures;
