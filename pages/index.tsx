import Link from 'next/link';
import Layout from './layout';
// import { Link } from 'react-router-dom'; // Assume you're using React Router


export default function Home() {

  return (
    <div className="relative h-screen bg-cover bg-center" style={{ backgroundImage: "url('/fpl-bg2.png')" }}>
      {/* Semi-transparent overlay (optional) */}
      <div className="absolute inset-0 bg-black bg-opacity-50"></div>

      {/* Floating card */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="bg-white p-10 max-w-md mx-auto rounded-lg shadow-2xl">
          <h1 className="text-3xl font-bold mb-2">Master Your Fantasy League</h1>
          <p className="mb-4 italic">Unlock advanced soccer stats and predictive heatmaps to gain an edge over the competition.</p>
          <Link href="/heatmap" className="inline-block bg-green-500 text-white py-2 px-4 rounded hover:bg-green-600 transition-colors">Explore Heatmaps
          </Link>
        </div>
      </div>

      {/* Your existing layout */}
      {/* <Layout>

      </Layout> */}
    </div>
  );
}
