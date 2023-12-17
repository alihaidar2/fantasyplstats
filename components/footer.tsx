import React from 'react';

const Footer: React.FC = () => {
  return (
    <footer className="sticky bottom-0 bg-green-700 py-4 px-2.5 text-white flex items-center justify-between">
      {/* Left Section: Brand or Company Name */}
      <div className='flex-grow'>
        <p className="text-white italic text-sm m-0">
          © 2023 FPL Stats
        </p>
      </div>

      {/* Right Section: Compact Contact or Social Info */}
      <div className='flex-end'>
        🍉
      </div>
    </footer>
  );
};

export default Footer;
