import FixtureMatrix from "@/components/features/fixtures/fixture-matrix";

export const metadata = { title: "Fixtures | Fantasy PL Stats" };

export default function FixturesPage() {
  return (
    <div className="flex flex-col flex-1 min-h-0 p-4 max-w-7xl mx-auto w-full">
      <h1 className="mb-4 text-2xl font-semibold text-gray-900 dark:text-white">
        Fixture Difficulty Matrix
      </h1>
      <FixtureMatrix />
    </div>
  );
}
