/* eslint-disable @next/next/no-img-element */
import React from 'react';
import Link from 'next/link';

const Header: React.FC = () => {
  return (
    <header className='header'>
      <nav className="flex items-center justify-between bg-green-500 py-2 px-2.5">
        {/* Left-aligned Home icon */}
        <Link href="/" className="text-white">
          <img src={'/fpl_logo2.png'} className='h-5' alt={'O'} />
          {/* <img src={'/fpl_logo.png'} className='h-5' alt={'O'} /> */}
        </Link>

        {/* Center-aligned links */}
        <div className="flex-grow flex items-center justify-center">
          <Link href="/" className="text-white mx-2">Home</Link>
          <Link href="/fixtures" className="text-white mx-2">Fixture</Link>
          <Link href="/teams" className="text-white mx-2">Teams</Link>
          <Link href="/players" className="text-white mx-2">Players</Link>
          <Link href="/about" className="text-white mx-2">About Us</Link>
        </div>

        {/* Right-aligned empty space for balance */}
        <div className="h-6 w-6"></div>
      </nav>
    </header>
  );
};

export default Header;
