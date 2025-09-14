import { Geist, Geist_Mono } from "next/font/google";
import { useRouter } from "next/router";
import { generateHumanSlug } from "@/lib/slug";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export default function Home() {
  const router = useRouter();

  const createNewPaste = () => {
    const slug = generateHumanSlug();
    router.push(`/p/${slug}`);
  };

  return (
    <div
      className={`${geistSans.className} ${geistMono.className} font-sans min-h-screen flex items-center justify-center p-8`}
    >
      <main className="w-full max-w-2xl">
        <div className="flex flex-col items-center gap-6 text-center">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
            P2Paste
          </h1>
          <p className="opacity-70 text-sm sm:text-base">
            Realtime, peer‑to‑peer pastebin. Human‑readable links. No server
            storage.
          </p>
          <div>
            <button
              onClick={createNewPaste}
              className="rounded-md border border-black/10 dark:border-white/20 bg-foreground text-background px-4 py-2 text-sm sm:text-base hover:opacity-90"
            >
              New paste
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
