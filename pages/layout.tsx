import React, { ReactNode } from 'react';
import Link from 'next/link';
// import Header from '@/components/header';
// import Footer from '@/components/footer';
import 'app\\globals.css'
import Footer from '../components/footer';

type LayoutProps = {
  children: ReactNode;
};

const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <div className="flex flex-col min-h-screen"> {/* keep footer at the bottom */}
      {/* <Header /> */}
      <header className='header'>
        <nav className="flex items-center justify-between bg-green-500 py-2 px-2.5">
          {/* Left-aligned Home icon */}
          <Link href="/" className="text-white">
            <img src={'/fpl_logo.png'} className='h-5' alt={'O'} />
          </Link>

          {/* Center-aligned links */}
          <div className="flex-grow flex items-center justify-center">
            <Link href="/" className="text-white mx-2">Home</Link>
            <Link href="/teams" className="text-white mx-2">Teams</Link>
            <Link href="/fixtures" className="text-white mx-2">Fixture Tracker</Link>
            <Link href="/players" className="text-white mx-2">Players</Link>
            <Link href="/about" className="text-white mx-2">About Us</Link>
          </div>

          {/* Right-aligned empty space for balance */}
          <div className="h-6 w-6"></div>
        </nav>
      </header>
      <main className='flex-grow'>
        {children} {/* page content */}
      </main>
      <Footer />
    </div>
  );
};

export default Layout;
