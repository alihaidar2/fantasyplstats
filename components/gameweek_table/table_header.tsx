import { HeaderGroup } from "react-table";

interface TableHeaderProps<T extends object> {
  headerGroups: HeaderGroup<T>[];
}

export const TableHeader = <T extends object>({
  headerGroups,
}: TableHeaderProps<T>) => (
  <thead>
    {headerGroups.map((headerGroup) => (
      <tr {...headerGroup.getHeaderGroupProps()} key={headerGroup.id}>
        {headerGroup.headers.map((column) => (
          <th
            {...column.getHeaderProps()}
            key={column.id}
            className="px-4 py-2"
          >
            <div className="flex items-center">
              {column.render("Header")}
              <span className="ml-1 text-xs text-gray-500">
                {column.isSorted ? (column.isSortedDesc ? "▼" : "▲") : ""}
              </span>
            </div>
          </th>
        ))}
      </tr>
    ))}
  </thead>
);
