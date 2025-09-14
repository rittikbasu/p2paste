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
      const [{ Doc, applyUpdate, encodeStateAsUpdate }, yTextarea, torrent] =
        await Promise.all([
          import("yjs"),
          import("y-textarea"),
          import("trystero/torrent"),
        ]);

      const roomName = `p2paste-${slug}`;

      // Create fresh Y.Doc and WebrtcProvider for each component instance
      // This ensures proper document syncing across different browsers
      const doc = new Doc();

      const ytext = doc.getText("content");

      // Trystero setup (torrent backend uses public trackers, no server you manage)
      const { joinRoom, defaultRelayUrls } = torrent;
      const room = joinRoom(
        {
          appId: "p2paste",
          relayUrls: defaultRelayUrls,
          relayRedundancy: defaultRelayUrls.length,
          rtcConfig: { iceCandidatePoolSize: 16 },
        },
        roomName
      );
      const [sendUpdate, onUpdate] = room.makeAction("yupdate");
      const [sendFullState, onFullState] = room.makeAction("yfull");
      const [sendRequestFull, onRequestFull] = room.makeAction("yreq");

      // Broadcast local Yjs updates
      doc.on("update", (update, origin) => {
        // Avoid echoing remote updates
        if (origin === "remote") return;
        sendUpdate(update);
      });

      // Apply remote incremental updates
      onUpdate((update, peerId) => {
        try {
          applyUpdate(doc, update, "remote");
        } catch {}
      });

      // Handle receiving a full document state
      onFullState((update, peerId) => {
        try {
          applyUpdate(doc, update, "remote");
        } catch {}
      });

      // Presence: track peer joins/leaves and send full state to the new peer
      room.onPeerJoin((peerId) => {
        setConnectedPeers((n) => n + 1);
        try {
          const full = encodeStateAsUpdate(doc);
          sendFullState(full, peerId);
        } catch {}
      });

      // If we join and have empty doc, request full state from any peer
      setTimeout(() => {
        if ((ytext?.length || 0) === 0) {
          try {
            sendRequestFull({});
          } catch {}
        }
      }, 100);

      onRequestFull((_, fromPeerId) => {
        // Respond with full state if we have content
        if ((ytext?.length || 0) > 0) {
          try {
            const full = encodeStateAsUpdate(doc);
            sendFullState(full, fromPeerId);
          } catch {}
        }
      });
      room.onPeerLeave(() => setConnectedPeers((n) => Math.max(1, n - 1)));
      setConnectedPeers(1);
      setConnected(true);

      // Bind to textarea
      const textarea = textareaRef.current;
      if (textarea) {
        const { TextAreaBinding } = yTextarea;
        bindingRef.current = new TextAreaBinding(ytext, textarea);
      }

      // Debug: log document changes locally
      const onDocUpdate = (update, origin) => {
        console.log("Doc update:", { textLength: ytext.length, origin });
        const ta = textareaRef.current;
        if (ta) {
          ta.value = ytext.toString();
        }
      };
      doc.on("update", onDocUpdate);

      return () => {
        doc.off("update", onDocUpdate);
        if (
          bindingRef.current &&
          typeof bindingRef.current.destroy === "function"
        ) {
          try {
            bindingRef.current.destroy();
          } catch {}
        }
        try {
          room.leave();
        } catch {}
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
        No servers. No database. No bullshit. Everything exists in your browser
        only while you&apos;re here.
      </footer>
    </div>
  );
}
