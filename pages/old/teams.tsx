// pages/teams.tsx
import React, { useEffect, useState } from 'react';
import Datatable from '../../components/datatables/teams_datatable';
import { Team } from '../../types/Team';
import Layout from '../layout';
import dynamic from 'next/dynamic';


const TeamsPage: React.FC = () => {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const yLabels = document.querySelectorAll('.react-heatmap-grid .yLabel');
    yLabels.forEach(label => {
      label.classList.add('centered-label');
    });

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

  if (loading) {
    return (
      <Layout>
        <div>Loading...</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <h1>Teams Table</h1>
      <Datatable data={teams} />
      {/* Now TeamsHeatmap will only be rendered on the client-side */}
      {/* Additional content for the Players page */}
    </Layout>
  );
};

export default TeamsPage;
