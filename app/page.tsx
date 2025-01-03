import Head from "next/head";
import Link from "next/link";
import styles from "styles/pages/Home.module.css";

export default function Home() {
  return (
    <>
      <Head>
        <link rel="preload" as="image" href="/fpl-background.png" />
      </Head>
      <div className={styles.container}>
        <div className={styles.overlay}></div>

        {/* Floating card */}
        <div className={styles.cardWrapper}>
          <div className={styles.card}>
            <h1 className={styles.title}>Master Your Fantasy League</h1>
            <p className={styles.subtitle}>
              Unlock advanced soccer stats to gain an edge over the competition.
            </p>
            <Link href="/fixtures" className={styles.link}>
              Track Fixtures
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
