import React from 'react';
import Layout from './layout';
import TeamsHeatmap from '@/components/fixture_difficulty_heatmap';
import FixturesHeatmap from '@/components/fixtures_heatmap';

const Fixtures: React.FC = () => {
  return (
    <Layout>
      <h1>Fixture Difficulty Table</h1>
      {/* Additional content for the Fixture Difficulty page */}
      <FixturesHeatmap />

    </Layout>
  );
};

export default Fixtures;
