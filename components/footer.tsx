// components/Footer.tsx
import React from "react";

const Footer = () => {
  return (
    <footer className="sticky bottom-0 z-10 bg-green-700 py-4 px-2.5 text-white flex items-center justify-between">
      <div className="flex-grow">
        <p className="text-white italic text-sm m-0">© 2023 FPL Stats</p>
      </div>

      <div className="flex-end">🍉</div>
    </footer>
  );
};

export default Footer;
