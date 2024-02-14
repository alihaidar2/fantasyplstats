// pages/_app.tsx
require("dotenv").config();
import "../app/globals.css"; // Adjust the path to your global styles
import "@chatscope/chat-ui-kit-styles/dist/default/styles.min.css";

function MyApp({ Component, pageProps }) {
  return <Component {...pageProps} />;
}

export default MyApp;
