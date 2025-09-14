import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";

// Defer requiring yjs and y-webrtc to client-side only
const isBrowser = typeof window !== "undefined";

export default function PastePage() {
  const router = useRouter();
  const { slug } = router.query;

  const [connectedPeers, setConnectedPeers] = useState(0);
  const [connected, setConnected] = useState(false);
  const textareaRef = useRef(null);
  const providerRef = useRef(null);
  const awarenessRef = useRef(null);
  const bindingRef = useRef(null);

  // Lazily create/reuse doc/provider on client
  useEffect(() => {
    if (!isBrowser) return;
    if (!slug) return;

    async function start() {
      const [{ Doc }, { WebrtcProvider }, yTextarea] = await Promise.all([
        import("yjs"),
        import("y-webrtc"),
        import("y-textarea"),
      ]);

      const roomName = `p2paste-${slug}`;
      const registry = (window.__p2paste_registry =
        window.__p2paste_registry || new Map());
      let entry = registry.get(roomName);
      if (!entry) {
        const doc = new Doc();
        const provider = new WebrtcProvider(roomName, doc, {
          signaling: [
            "wss://signaling.yjs.dev",
            "wss://y-webrtc-signaling-eu.herokuapp.com",
            "wss://y-webrtc-signaling-us.herokuapp.com",
          ],
        });
        entry = { doc, provider, refs: 0 };
        registry.set(roomName, entry);
      }
      entry.refs += 1;

      const { doc, provider } = entry;
      const ytext = doc.getText("content");

      providerRef.current = provider;
      awarenessRef.current = provider.awareness;

      // Bind to textarea
      const textarea = textareaRef.current;
      if (textarea) {
        const { TextAreaBinding } = yTextarea;
        bindingRef.current = new TextAreaBinding(ytext, textarea);
      }

      const onStatus = (event) => setConnected(Boolean(event?.connected));
      const onPeers = (event) => {
        const webrtc = event?.webrtcPeers?.length || 0;
        const bc = event?.bcPeers?.length || 0;
        // Include self to align with previous awareness-based count
        setConnectedPeers(webrtc + bc + 1);
      };
      provider.on("status", onStatus);
      provider.on("peers", onPeers);
      // Initialize immediately
      onStatus({ connected: provider.connected });
      // We don't know peers until we get first event; assume at least self
      setConnectedPeers(1);

      return () => {
        provider.off("status", onStatus);
        provider.off("peers", onPeers);
        if (
          bindingRef.current &&
          typeof bindingRef.current.destroy === "function"
        ) {
          try {
            bindingRef.current.destroy();
          } catch {}
        }
        // Decrement ref count and clean up when last consumer leaves this room
        const reg = window.__p2paste_registry;
        const e = reg?.get(roomName);
        if (e) {
          e.refs -= 1;
          if (e.refs <= 0) {
            try {
              e.provider.destroy();
            } catch {}
            reg.delete(roomName);
          }
        }
        providerRef.current = null;
        awarenessRef.current = null;
        bindingRef.current = null;
      };
    }

    const stop = start();
    return () => {
      // If start returned a cleanup promise, await it (ignored)
      Promise.resolve(stop).then((cleanup) => {
        if (typeof cleanup === "function") cleanup();
      });
    };
  }, [slug]);

  const copyLink = async () => {
    if (!isBrowser) return;
    await navigator.clipboard.writeText(window.location.href);
  };

  return (
    <div className="min-h-screen flex flex-col p-4 sm:p-8 gap-4">
      <header className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm opacity-70">Room</span>
          <code className="px-2 py-1 rounded bg-black/5 dark:bg-white/10 text-xs break-all">
            {slug}
          </code>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
              connected
                ? "bg-green-500/10 text-green-600 dark:text-green-400"
                : "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400"
            }`}
          >
            {connected ? "Connected" : "Connecting..."}
          </span>
          <span className="text-sm opacity-70">Peers: {connectedPeers}</span>
          <button
            onClick={copyLink}
            className="rounded border border-black/10 dark:border-white/20 px-3 py-1 text-sm hover:bg-black/5 dark:hover:bg-white/10"
          >
            Copy link
          </button>
        </div>
      </header>
      <main className="flex-1">
        <textarea
          ref={textareaRef}
          placeholder="Start typing… anyone on this URL can edit in real-time."
          className="w-full h-[70vh] sm:h-[75vh] resize-y rounded-md p-4 bg-transparent border border-black/10 dark:border-white/20 focus:outline-none focus:ring-2 focus:ring-blue-500/40 font-mono text-sm"
        />
      </main>
      <footer className="text-xs opacity-60">
        No database. No servers. No bullshit. Everything exists in your browser
        only while you&apos;re here.
      </footer>
    </div>
  );
}
