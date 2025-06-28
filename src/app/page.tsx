import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center gap-8 p-8 flex-1">
      <Card className="w-full max-w-2xl border-2 border-green-200 bg-white shadow-lg dark:bg-gray-900 dark:border-green-800">
        <CardContent className="flex flex-col items-center justify-center gap-8 p-12 text-center">
          <div className="space-y-4">
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white">
              Master Your Fantasy League
            </h1>

            <p className="text-lg text-gray-700 dark:text-gray-300 max-w-xl">
              Unlock advanced Premier League analytics to gain a competitive
              edge over your rivals
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 w-full max-w-md">
            <Link
              href="/fixtures"
              className="flex-1 rounded-lg bg-green-600 px-6 py-3 text-white font-medium shadow-md hover:bg-green-700 transition-colors dark:bg-green-700 dark:hover:bg-green-600 text-center"
            >
              View Fixtures
            </Link>
            <Link
              href="/players"
              className="flex-1 rounded-lg border-2 border-green-300 px-6 py-3 text-green-800 font-medium hover:bg-green-100 transition-colors dark:border-green-700 dark:text-green-300 dark:hover:bg-green-900/50 text-center"
            >
              Player Stats
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
