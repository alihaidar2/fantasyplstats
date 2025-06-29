export function getPositionColor(elementTypeId: number): string {
  switch (elementTypeId) {
    case 1:
      return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300";
    case 2:
      return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300";
    case 3:
      return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300";
    case 4:
      return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300";
    default:
      return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300";
  }
}

export function getFormColor(form: string): string {
  const formValue = parseFloat(form);
  if (formValue >= 7) return "text-green-600 dark:text-green-400";
  if (formValue >= 5) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
}
