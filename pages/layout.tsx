import React, { ReactNode } from "react";
import Footer from "../components/footer";
import Header from "../components/header";

type LayoutProps = {
  children: ReactNode;
};

const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <div className="flex flex-col h-screen">
      {" "}
      {/* Full viewport height and flex column */}
      <link
        rel="stylesheet"
        href="../node_modules/@chatscope/chat-ui-kit-styles/dist/default/styles.min.css"
      ></link>
      {/* <Header /> */}
      <Header />
      <main className="flex-grow">
        {children} {/* page content */}
      </main>
      <Footer />
    </div>
  );
};

export default Layout;
