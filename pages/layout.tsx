import React, { ReactNode } from 'react';
import Link from 'next/link';
// import Header from '@/components/header';
// import Footer from '@/components/footer';
// import 'app/globals.css'
import Footer from '../components/footer';
import Header from '../components/header';

type LayoutProps = {
  children: ReactNode;
};

const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <div className="flex flex-col min-h-screen"> {/* keep footer at the bottom */}
      {/* <Header /> */}
      <Header />
      <main className='flex-grow'>
        {children} {/* page content */}
      </main>
      <Footer />
    </div>
  );
};

export default Layout;
