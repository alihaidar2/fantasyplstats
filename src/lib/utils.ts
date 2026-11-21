import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getDifficultyColor(difficulty?: number) {
  switch (difficulty) {
    case 1:
      return "bg-green-800 text-white hover:bg-green-700 transition-colors";
    case 2:
      return "bg-green-300 text-gray-900 dark:bg-green-600 dark:text-white hover:bg-green-200 dark:hover:bg-green-500 transition-colors";
    case 3:
      return "bg-neutral-300 text-gray-900 dark:bg-gray-600 dark:text-white hover:bg-neutral-200 dark:hover:bg-gray-500 transition-colors";
    case 4:
      return "bg-red-300 text-gray-900 dark:bg-red-600 dark:text-white hover:bg-red-200 dark:hover:bg-red-500 transition-colors";
    case 5:
      return "bg-red-800 text-white hover:bg-red-700 transition-colors";
    default:
      return "bg-gray-300 text-gray-600 italic dark:bg-gray-700 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors";
  }
}
