import "@/styles/globals.css";
import { Geist, Geist_Mono } from "next/font/google";
import Head from "next/head";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export default function App({ Component, pageProps }) {
  return (
    <div className={`${geistSans.variable} ${geistMono.variable} font-sans`}>
      <Head>
        <title>P2Paste</title>
        <meta
          name="description"
          content="Realtime, peer‑to‑peer pastebin. No servers. No database. No bullshit."
        />
        <meta property="og:title" content="P2Paste" />
        <meta
          property="og:description"
          content="Realtime, peer‑to‑peer pastebin. No servers. No database. No bullshit."
        />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content="P2Paste" />
        <meta
          name="twitter:description"
          content="Realtime, peer‑to‑peer pastebin. No servers. No database. No bullshit."
        />
      </Head>
      <Component {...pageProps} />
    </div>
  );
}
