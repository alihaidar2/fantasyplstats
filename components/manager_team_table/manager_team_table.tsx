"use client";

import { useMemo } from "react";
import { useTable, Column } from "react-table";

type Player = {
  player_id: number;
  web_name: string;
  now_cost: number;
};

type ManagerTeamTableProps = {
  players: Player[];
};

const ManagerTeamTable: React.FC<ManagerTeamTableProps> = ({ players }) => {
  // ✅ Memoize columns
  const columns: Column<Player>[] = useMemo(
    () => [
      { Header: "Name", accessor: "web_name" },
      {
        Header: "Price (M)",
        accessor: "now_cost",
        Cell: ({ value }: { value: number }) => (value / 10).toFixed(1),
      },
    ],
    []
  );

  const tableData = useMemo(() => players, [players]);

  // ✅ Use React Table
  const { getTableProps, getTableBodyProps, headerGroups, rows, prepareRow } =
    useTable<Player>({
      columns,
      data: tableData,
    });

  return (
    <table
      {...getTableProps()}
      style={{ width: "100%", borderCollapse: "collapse", marginTop: "10px" }}
    >
      <thead>
        {headerGroups.map((headerGroup) => (
          <tr
            {...headerGroup.getHeaderGroupProps()}
            key={headerGroup.id}
            style={{ backgroundColor: "#ddd" }}
          >
            {headerGroup.headers.map((column) => (
              <th
                {...column.getHeaderProps()}
                key={column.id}
                style={{ padding: "8px", border: "1px solid black" }}
              >
                {column.render("Header")}
              </th>
            ))}
          </tr>
        ))}
      </thead>
      <tbody {...getTableBodyProps()}>
        {rows.map((row) => {
          prepareRow(row);
          return (
            <tr
              {...row.getRowProps()}
              key={row.id}
              style={{ textAlign: "center" }}
            >
              {row.cells.map((cell) => (
                <td
                  {...cell.getCellProps()}
                  key={`${row.id}-${cell.column.id}`}
                  style={{ padding: "8px", border: "1px solid black" }}
                >
                  {cell.render("Cell")}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};

export default ManagerTeamTable;
