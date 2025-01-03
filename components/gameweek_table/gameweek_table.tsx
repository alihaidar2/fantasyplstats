/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { useGameweekTable } from "./hooks/useGameweekTable"; // Import the hook
import { getCellStyle } from "@/lib/tableUtils";
import { TeamFixtures } from "@/types";

export const GameweekTable = ({
  data,
  gameweeks,
  selectedRange,
}: {
  data: TeamFixtures[];
  gameweeks: number[];
  selectedRange: number[];
}) => {
  const { tableInstance } = useGameweekTable(data, gameweeks, selectedRange); // Call the hook

  return (
    <div className="overflow-x-auto w-full">
      <table
        {...tableInstance.getTableProps()}
        className="min-w-full border-separate border-spacing "
      >
        <thead>
          {tableInstance.headerGroups.map((headerGroup) => (
            <tr {...headerGroup.getHeaderGroupProps()} key={headerGroup.id}>
              {headerGroup.headers.map((column: any) => (
                <th
                  {...column.getHeaderProps(column.getSortByToggleProps())}
                  key={column.id}
                  className={`font-medium text-gray-700 ${getCellStyle(
                    column.Header,
                    column.id
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
              <tr {...row.getRowProps()} key={row.id}>
                {row.cells.map((cell) => {
                  const style = getCellStyle(
                    cell.value.difficulty,
                    cell.column.id
                  );

                  return (
                    <td
                      {...cell.getCellProps()}
                      key={`${row.id}-${cell.column.id}`}
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
