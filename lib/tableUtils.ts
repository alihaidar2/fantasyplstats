// Determine cell style for fixture table
export const getCellStyle = (value?: unknown, columnId?: string) => {
  const baseClass =
    "px-4 py-2 text-sm rounded-full text-center hover:bg-opacity-50";

  if (columnId === "average_score" || columnId === "short_name") {
    return `bg-gray-300 text-gray-600 w-4 ${baseClass}`;
  }

  if (value === 5) return `bg-red-800 text-white w-auto ${baseClass}`; // dark red
  if (value === 4) return `bg-red-500 text-gray-600 w-auto ${baseClass}`; // red
  if (value === 3) return `bg-yellow-300 text-gray-600 w-auto ${baseClass}`; // yellow
  if (value === 2) return `bg-green-300 text-gray-600 w-auto ${baseClass}`; // green

  return `bg-gray-300 text-gray-600 ${baseClass}`; // default - grey
};

export const sortByDifficulty = (
  rowA: { values: { [x: string]: { difficulty: number } } },
  rowB: { values: { [x: string]: { difficulty: number } } },
  columnId: string | number
) => {
  const difficultyA = rowA.values[columnId]?.difficulty || 0;
  const difficultyB = rowB.values[columnId]?.difficulty || 0;
  return difficultyA - difficultyB;
};
