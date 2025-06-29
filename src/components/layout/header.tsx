import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/common/theme-toggle";

export default function Header() {
  return (
    <header className="border-b border-gray-200 bg-white shadow-sm dark:bg-gray-900 dark:border-gray-700">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          {/* Logo/Brand */}
          <Link
            href="/"
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <Badge
              variant="secondary"
              className="text-lg font-bold px-3 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300 dark:hover:bg-emerald-900/50"
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
              className="text-sm font-medium text-gray-700 hover:text-emerald-600 transition-colors dark:text-gray-300 dark:hover:text-emerald-400"
            >
              Home
            </Link>
            <Link
              href="/fixtures"
              className="text-sm font-medium text-gray-700 hover:text-emerald-600 transition-colors dark:text-gray-300 dark:hover:text-emerald-400"
            >
              Fixtures
            </Link>
            <Link
              href="/players"
              className="text-sm font-medium text-gray-700 hover:text-emerald-600 transition-colors dark:text-gray-300 dark:hover:text-emerald-400"
            >
              Players
            </Link>
            {/* <Link
              href="/teams"
              className="text-sm font-medium text-gray-400 hover:text-emerald-500 transition-colors dark:text-gray-500 dark:hover:text-emerald-400"
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
