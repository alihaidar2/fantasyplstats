// pages/teams.tsx

import React, { useEffect, useState } from 'react';
import Datatable from '../components/datatable';
import { Team } from '../models/Team';
import Layout from './layout';

const TeamsPage: React.FC = () => {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    fetch('/api/teams')
      .then(response => response.json())
      .then(data => {
        setTeams(data);
        setLoading(false);
      })
      .catch(error => {
        console.error('Error fetching data:', error);
        setLoading(false);
      });
  }, []);

  if (loading) return (
    <Layout>
      <div>Loading...</div>
      {/* Additional content for the Players page */}
    </Layout>
  );

  return (
    <Layout>
      <h1>Teams Table</h1>
      <Datatable data={teams} />
      {/* Additional content for the Players page */}
    </Layout>
  );
};

export default TeamsPage;