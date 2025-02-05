/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import Player from "@/types/player";
import { useManagerTeamTable } from "./hooks/useManagerTeamTable";
import { getCellStyle } from "@/lib/tableUtils";

interface ManagerTeamTableProps {
  players: Player[];
}

const ManagerTeamTable: React.FC<ManagerTeamTableProps> = ({ players }) => {
  const { tableInstance } = useManagerTeamTable(players);

  return (
    <div className="overflow-x-auto w-full">
      <table
        {...tableInstance.getTableProps()}
        className="min-w-full border-separate border-spacing text-center"
      >
        <thead>
          {tableInstance.headerGroups.map((headerGroup) => (
            <tr {...headerGroup.getHeaderGroupProps()} key={headerGroup.id}>
              {headerGroup.headers.map((column: any) => (
                <th
                  {...column.getHeaderProps(column.getSortByToggleProps())}
                  key={column.id}
                  className={`font-medium text-gray-700 ${getCellStyle(
                    column.Header as string,
                    column.id,
                    true
                  )}`}
                >
                  {column.render("Header")}
                  <span className="ml-1 text-xs text-gray-500">
                    {column.isSorted ? (column.isSortedDesc ? "▼" : "▲") : ""}
                  </span>
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody {...tableInstance.getTableBodyProps()}>
          {tableInstance.rows.map((row) => {
            tableInstance.prepareRow(row);

            return (
              <tr
                {...row.getRowProps()}
                key={row.id}
                className="hover:bg-gray-100"
              >
                {row.cells.map((cell) => {
                  const style = getCellStyle(
                    cell.value.difficulty,
                    cell.column.id,
                    false
                  );
                  return (
                    <td
                      {...cell.getCellProps()}
                      key={cell.column.id}
                      className={`${style}`}
                    >
                      {cell.render("Cell")}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default ManagerTeamTable;
