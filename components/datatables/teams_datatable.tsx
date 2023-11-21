// components/teams_datatble.tsx

import React from 'react';
import DataTable from 'react-data-table-component';
import { Team } from '../../types/Team';

interface DatatableProps {
  data: Team[];
}

const Datatable: React.FC<DatatableProps> = ({ data }) => {
  const columns = [
    {
      name: 'Team Name',
      selector: (row: Team) => row.team_name,
      sortable: true,
    },
    {
      name: 'Strength',
      selector: (row: Team) => row.strength,
      sortable: true,
    },
    // {
    //   name: 'Points',
    //   selector: (row: Team) => row.points,
    //   sortable: true,
    // },
    // {
    //   name: 'Position',
    //   selector: (row: Team) => row.position,
    //   sortable: true,
    // },
    // {
    //   name: 'Played',
    //   selector: (row: Team) => row.played,
    //   sortable: true,
    // },
    // {
    //   name: 'Wins',
    //   selector: (row: Team) => row.win,
    //   sortable: true,
    // },
    // {
    //   name: 'Losses',
    //   selector: (row: Team) => row.loss,
    //   sortable: true,
    // },
    // {
    //   name: 'Draws',
    //   selector: (row: Team) => row.draw,
    //   sortable: true,
    // },
    // {
    //   name: 'Form',
    //   selector: (row: Team) => row.form,
    //   sortable: true,
    // },
    {
      name: 'Overall Home',
      selector: (row: Team) => row.strength_overall_home,
      sortable: true,
    },
    {
      name: 'Overall Away',
      selector: (row: Team) => row.strength_overall_away,
      sortable: true,
    },
    {
      name: 'Attack Home',
      selector: (row: Team) => row.strength_attack_home,
      sortable: true,
    },
    {
      name: 'Attack Away',
      selector: (row: Team) => row.strength_attack_away,
      sortable: true,
    },
    {
      name: 'Defence home',
      selector: (row: Team) => row.strength_defence_home,
      sortable: true,
    },
    {
      name: 'Defence Away',
      selector: (row: Team) => row.strength_defence_away,
      sortable: true,
    },
    // ...add any other columns as needed
  ];
  

  return <DataTable columns={columns} data={data} />;
  // return <DataTable columns={columns} data={data} pagination />;
};

export default Datatable;
