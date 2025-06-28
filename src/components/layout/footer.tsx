export default function Footer() {
  return (
    <footer className="border-t border-green-200 bg-green-50 mt-auto dark:bg-gray-900 dark:border-green-800">
      <div className="container mx-auto px-4 py-4">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-1">
          <p className="text-xs text-gray-600 dark:text-gray-400">
            © 2024 FPL Stats. Not affiliated with the Premier League or FPL.
          </p>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            Data powered by the FPL API
          </p>
        </div>
      </div>
    </footer>
  );
}
