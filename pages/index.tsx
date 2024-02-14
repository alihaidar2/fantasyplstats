import Link from "next/link";

export default function Home() {
  return (
    <div
      className="relative h-screen bg-cover bg-center"
      style={{ backgroundImage: "url('/fpl-bg6.png')" }}
    >
      {/* Semi-transparent overlay (optional) */}
      <div className="absolute inset-0 bg-black bg-opacity-30"></div>

      {/* Floating card */}
      <div className="absolute inset-0 flex items-center justify-center px-4 sm:px-6 lg:px-8">
        {" "}
        {/* Adjust horizontal padding */}
        <div className="bg-white p-6 sm:p-8 md:p-10 w-full max-w-2xl rounded-lg shadow-2xl">
          {" "}
          {/* Adjust width and padding */}
          <h1 className="text-2xl font-bold mb-2 text-center">
            Master Your Fantasy League
          </h1>
          <p className="mb-4 italic text-center">
            Unlock advanced soccer stats and predictive heatmaps to gain an edge
            over the competition.
          </p>
          <div className="text-center">
            <Link
              href="/fixtures"
              className="inline-block bg-green-500 text-white py-2 px-4 rounded hover:bg-green-600 transition-colors"
            >
              Explore Heatmaps
            </Link>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div
      className="relative h-screen bg-cover bg-center"
      style={{ backgroundImage: "url('/fpl-bg6.png')" }}
    >
      {/* Semi-transparent overlay (optional) */}
      <div className="absolute inset-0 bg-black bg-opacity-30"></div>

      {/* Floating card */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="bg-white p-10 max-w-md mx-auto rounded-lg shadow-2xl">
          <h1 className="text-2xl font-bold mb-2">
            Master Your Fantasy League
          </h1>
          <p className="mb-4 italic">
            Unlock advanced soccer stats and predictive heatmaps to gain an edge
            over the competition.
          </p>
          <Link
            href="/fixtures"
            className="inline-block bg-green-500 text-white py-2 px-4 rounded hover:bg-green-600 transition-colors"
          >
            Explore Heatmaps
          </Link>
        </div>
      </div>
    </div>
  );
}
