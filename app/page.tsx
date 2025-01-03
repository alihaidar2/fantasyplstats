import Link from "next/link";

export default function Home() {
  return (
    <div
      className="relative h-screen bg-cover bg-center"
      style={{ backgroundImage: "url('/fpl-background.png')" }}
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
          <h1 className="text-2xl font-bold mb-2 text-center text-black">
            Master Your Fantasy League
          </h1>
          <p className="mb-4 italic text-center text-black">
            Unlock advanced soccer stats to gain an edge over the competition.
          </p>
          <div className="text-center">
            <Link
              href="/fixtures"
              className="inline-block bg-green-500 text-white py-2 px-4 rounded hover:bg-green-600 transition-colors m-1"
            >
              Track Fixtures
            </Link>
            {/*
            <Link
              href="/chat"
              className="inline-block bg-green-500 text-white py-2 px-4 rounded hover:bg-green-600 transition-colors m-1"
            >
              Start chatting
            </Link> */}
          </div>
        </div>
      </div>
    </div>
  );
}

// Server-side rendering
export async function getServerSideProps() {
  return {
    props: {}, // No dynamic data, just ensure SSR is enabled
  };
}
