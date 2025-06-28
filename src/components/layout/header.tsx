import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/common/theme-toggle";

export default function Header() {
  return (
    <header className="border-b border-green-200 bg-white shadow-sm dark:bg-gray-900 dark:border-green-800">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          {/* Logo/Brand */}
          <Link
            href="/"
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <Badge
              variant="secondary"
              className="text-lg font-bold px-3 py-1 bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900 dark:text-green-100 dark:hover:bg-green-800"
            >
              FPL Stats
            </Badge>
            <span className="text-sm text-gray-600 hidden sm:inline dark:text-gray-400">
              Fantasy Premier League Analytics
            </span>
          </Link>

          {/* Navigation */}
          <nav className="flex items-center gap-6">
            <Link
              href="/"
              className="text-sm font-medium text-gray-700 hover:text-green-700 transition-colors dark:text-gray-300 dark:hover:text-green-400"
            >
              Home
            </Link>
            <Link
              href="/fixtures"
              className="text-sm font-medium text-gray-700 hover:text-green-700 transition-colors dark:text-gray-300 dark:hover:text-green-400"
            >
              Fixtures
            </Link>
            {/* <Link
              href="/players"
              className="text-sm font-medium text-gray-400 hover:text-green-600 transition-colors dark:text-gray-500 dark:hover:text-green-500"
            >
              Players
            </Link>
            <Link
              href="/teams"
              className="text-sm font-medium text-gray-400 hover:text-green-600 transition-colors dark:text-gray-500 dark:hover:text-green-500"
            >
              Teams
            </Link> */}
            <ThemeToggle />
          </nav>
        </div>
      </div>
    </header>
  );
}
