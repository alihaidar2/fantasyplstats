// pages/_app.tsx
import '../app/globals.css'; // Adjust the path to your global styles

function MyApp({ Component, pageProps }) {
  return <Component {...pageProps} />;
}

export default MyApp;
