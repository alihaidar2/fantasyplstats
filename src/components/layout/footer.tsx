import { getSnapshot } from "@/lib/data";
import { formatUpdatedAt } from "@/lib/fpl";
import { FOOTER_DISCLAIMER } from "@/lib/site";

export default function Footer() {
  const { generatedAt } = getSnapshot();
  return (
    <footer className="border-t border-gray-200 bg-gray-50 mt-auto dark:bg-gray-900 dark:border-gray-700 border-t-2 border-green-200 dark:border-green-900">
      <div className="container mx-auto px-4 py-4">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-1">
          <p className="text-xs text-gray-600 dark:text-gray-400">
            © 2024 FPL Stats
          </p>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            Data from the FPL API · Data updated{" "}
            <time dateTime={generatedAt}>{formatUpdatedAt(generatedAt)}</time>
          </p>
        </div>
        <p className="mt-2 text-center text-xs text-gray-600 dark:text-gray-400">
          {FOOTER_DISCLAIMER}
        </p>
        <div className="mt-1 text-center">
          <a
            href="https://www.haidartechsolutions.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-gray-400 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-500"
          >
            Built by Haidar Tech Solutions
          </a>
        </div>
      </div>
    </footer>
  );
}
