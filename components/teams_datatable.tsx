// // DataTable.tsx
// import React from 'react';
// import DataTable, { TableColumn } from 'react-data-table-component';


// interface TeamData {
//     team_id: number;
//     season_id: number;
//     team_name: string;
//     code: number;
//     draw: number;
//     form: string;
//     loss: number;
//     played: number;
//     points: number;
//     position: number;
//     short_name: string;
//     strength: number;
//     team_division: string;
//     unavailable: boolean;
//     win: number;
//     strength_overall_home: number;
//     strength_overall_away: number;
//     strength_attack_home: number;
//     strength_attack_away: number;
//     strength_defence_home: number;
//     strength_defence_away: number;
//     pulse_id: number;
// }

// interface DataTableProps {
//     data: TeamData[];
// }

// const TeamsDataTable: React.FC<DataTableProps> = ({ data }) => {
//     const columns: TableColumn<TeamData>[] = [
//         {
//             name: 'Team ID',
//             selector: 'team_id',
//             sortable: true,
//         },
//         {
//             name: 'Season ID',
//             selector: 'season_id',
//             sortable: true,
//         },
//         {
//             name: 'Team Name',
//             selector: 'team_name',
//             sortable: true,
//         },
//         {
//             name: 'Code',
//             selector: 'code',
//             sortable: true,
//         },
//         {
//             name: 'Draw',
//             selector: 'draw',
//             sortable: true,
//         },
//         {
//             name: 'Form',
//             selector: 'form',
//             sortable: true,
//         },
//         {
//             name: 'Loss',
//             selector: 'loss',
//             sortable: true,
//         },
//         {
//             name: 'Played',
//             selector: 'played',
//             sortable: true,
//         },
//         {
//             name: 'Points',
//             selector: 'points',
//             sortable: true,
//         },
//         {
//             name: 'Position',
//             selector: 'position',
//             sortable: true,
//         },
//         {
//             name: 'Short Name',
//             selector: 'short_name',
//             sortable: true,
//         },
//         {
//             name: 'Strength',
//             selector: 'strength',
//             sortable: true,
//         },
//         {
//             name: 'Team Division',
//             selector: 'team_division',
//             sortable: true,
//         },
//         {
//             name: 'Unavailable',
//             selector: 'unavailable',
//             sortable: true,
//             cell: (row: { unavailable: boolean; }) => row.unavailable ? 'Yes' : 'No', // Display 'Yes' or 'No' for boolean
//         },
//         {
//             name: 'Win',
//             selector: 'win',
//             sortable: true,
//         },
//         {
//             name: 'Overall Strength (Home)',
//             selector: 'strength_overall_home',
//             sortable: true,
//         },
//         {
//             name: 'Overall Strength (Away)',
//             selector: 'strength_overall_away',
//             sortable: true,
//         },
//         {
//             name: 'Attack Strength (Home)',
//             selector: 'strength_attack_home',
//             sortable: true,
//         },
//         {
//             name: 'Attack Strength (Away)',
//             selector: 'strength_attack_away',
//             sortable: true,
//         },
//         {
//             name: 'Defence Strength (Home)',
//             selector: 'strength_defence_home',
//             sortable: true,
//         },
//         {
//             name: 'Defence Strength (Away)',
//             selector: 'strength_defence_away',
//             sortable: true,
//         },        {
//             name: 'Pulse ID',
//             selector: 'pulse_id',
//             sortable: true,
//         },
//     ];

//     return (
//         <DataTable<TeamData>
//             title="Teams Data"
//             columns={columns}
//             data={data}
//             pagination
//         />
//     );
// };

// export default TeamsDataTable;