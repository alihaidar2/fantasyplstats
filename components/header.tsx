import React from 'react';
import Link from 'next/link';

const Header: React.FC = () => {
  return (
    <header className='sticky top-0 z-50 bg-green-700'>
      <nav className="flex items-center py-2 px-2.5">
        <Link href="/">
          <img src={'/fpl_logo2.png'} className='h-9 cursor-pointer' alt='FPL Logo' />
        </Link>

        <div className="flex space-x-4">
          <Link href="/">
            <p className="text-white cursor-pointer pl-4">Home</p>
          </Link>
          <Link href="/fixtures">
            <p className="text-white cursor-pointer">Fixtures</p>
          </Link>
          {/* Additional links can be uncommented as needed */}
        </div>

        {/* Placeholder for additional right-aligned elements */}
        <div>
          {/* Right-aligned elements like a search icon, user profile, etc. */}
        </div>
      </nav>
    </header>
  );
};

export default Header;
