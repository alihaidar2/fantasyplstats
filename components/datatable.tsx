// components/Datatable.tsx

import React from 'react';
import DataTable from 'react-data-table-component';
import { Team } from '../models/Team';

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
    // Add more columns as needed
  ];

  return <DataTable columns={columns} data={data} pagination />;
};

export default Datatable;
