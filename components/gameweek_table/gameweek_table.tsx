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
          {tableInstance.headerGroups.map((headerGroup) => {
            const headerGroupProps = headerGroup.getHeaderGroupProps();
            return (
              <tr
                {...headerGroupProps}
                key={headerGroupProps.key || headerGroup.id}
              >
                {headerGroup.headers.map((column: any) => {
                  const headerProps = column.getHeaderProps(
                    column.getSortByToggleProps()
                  );
                  return (
                    <th
                      {...headerProps}
                      key={headerProps.key || column.id}
                      className={`font-medium text-gray-700 ${getCellStyle(
                        column.Header,
                        column.id,
                        true
                      )}`}
                    >
                      {column.render("Header")}
                      <span className="ml-1 text-xs text-gray-500">
                        {column.isSorted
                          ? column.isSortedDesc
                            ? "▼"
                            : "▲"
                          : ""}
                      </span>
                    </th>
                  );
                })}
              </tr>
            );
          })}
        </thead>

        <tbody {...tableInstance.getTableBodyProps()}>
          {tableInstance.rows.map((row) => {
            tableInstance.prepareRow(row);
            const rowProps = row.getRowProps();

            return (
              <tr {...rowProps} key={rowProps.key || row.id}>
                {row.cells.map((cell) => {
                  const cellProps = cell.getCellProps();
                  const style = getCellStyle(
                    cell.value.difficulty,
                    cell.column.id,
                    false
                  );

                  return (
                    <td
                      {...cellProps}
                      key={cellProps.key || `${row.id}-${cell.column.id}`}
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
