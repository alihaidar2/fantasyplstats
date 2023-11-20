import React from 'react';

const Footer: React.FC = () => {
  return (
    <footer className="flex items-center justify-between bg-green-500 py-2 px-2.5 text-white">
      {/* Left Section: Brand or Company Name */}
      <div className='flex-grow flex items-center justify-start'>
        <p className="text-gray-300 italic text-sm m-0">
          © 2023 FPL Stats
        </p>
      </div>

      {/* Right Section: Compact Contact or Social Info */}
      <div className='flex-grow flex items-center justify-end'>
        🍉
      </div>
    </footer>
  );
};

export default Footer;
