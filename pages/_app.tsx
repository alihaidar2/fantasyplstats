// pages/_app.tsx
require('dotenv').config()
import '../app/globals.css'; // Adjust the path to your global styles

function MyApp({ Component, pageProps }) {
  return <Component {...pageProps} />;
}

export default MyApp;
