import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { generateHumanSlug } from "@/lib/slug";

// Defer requiring yjs and y-webrtc to client-side only
const isBrowser = typeof window !== "undefined";

export default function PastePage() {
  const router = useRouter();
  const { slug } = router.query;

  const [connectedPeers, setConnectedPeers] = useState(0);
  const [connected, setConnected] = useState(false);
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef(null);
  const bindingRef = useRef(null);
  const roomRef = useRef(null);
  const startedRef = useRef(false);
  const unsubsRef = useRef([]);

  // Lazily create/reuse doc/provider on client
  useEffect(() => {
    if (!isBrowser) return;
    if (!slug) return;

    async function start() {
      // Prevent duplicate start in StrictMode or fast re-mounts
      if (startedRef.current) {
        return () => {};
      }
      startedRef.current = true;
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
      const { joinRoom, getRelaySockets } = torrent;
      const room = joinRoom(
        {
          appId: "p2paste",
          relayUrls: [
            "wss://tracker.webtorrent.dev",
            "wss://tracker.openwebtorrent.com",
            "wss://tracker.btorrent.xyz",
          ],
          relayRedundancy: 3,
          // Keep RTC candidate pool small to avoid resource spikes during reconnects
          rtcConfig: { iceCandidatePoolSize: 2 },
        },
        roomName
      );
      roomRef.current = room;
      const [sendUpdate, onUpdate] = room.makeAction("yupdate");
      const [sendFullState, onFullState] = room.makeAction("yfull");
      const [sendRequestFull, onRequestFull] = room.makeAction("yreq");

      // Broadcast local Yjs updates (incremental)
      const onLocalUpdate = (update, origin) => {
        if (origin === "remote") return;
        sendUpdate(update);
      };
      doc.on("update", onLocalUpdate);

      // Remove fallback full-snapshot on local edits to avoid heavy traffic and duplication

      // Apply remote incremental updates
      const offUpdate = onUpdate((update) => {
        try {
          applyUpdate(doc, update, "remote");
        } catch (err) {
          console.warn(
            "[p2paste] failed to apply remote incremental update",
            err
          );
        }
      });
      if (typeof offUpdate === "function") unsubsRef.current.push(offUpdate);

      // Handle receiving a full document state
      const offFull = onFullState((update) => {
        try {
          applyUpdate(doc, update, "remote");
        } catch (err) {
          console.warn("[p2paste] failed to apply full document state", err);
        }
      });
      if (typeof offFull === "function") unsubsRef.current.push(offFull);

      // Presence: track peer joins/leaves and send full state to the new peer
      const offJoin = room.onPeerJoin(() => {
        setConnectedPeers((n) => {
          const next = n + 1;
          if (next > 0) setConnected(true);
          return next;
        });
      });
      if (typeof offJoin === "function") unsubsRef.current.push(offJoin);

      // Request full state immediately when joining (always, not just if empty)
      const requestFullTimeoutId = setTimeout(() => {
        try {
          sendRequestFull({});
        } catch (err) {
          console.warn("[p2paste] failed to request full state", err);
        }
      }, 0);

      const offReq = onRequestFull((_, fromPeerId) => {
        // Always respond with full state (even if empty, to confirm connection)
        try {
          const full = encodeStateAsUpdate(doc);
          sendFullState(full, fromPeerId);
        } catch (err) {
          console.warn(
            "[p2paste] failed to send full state in response to request",
            err
          );
        }
      });
      if (typeof offReq === "function") unsubsRef.current.push(offReq);
      const offLeave = room.onPeerLeave(() =>
        setConnectedPeers((n) => {
          const next = Math.max(0, n - 1);
          if (next === 0) setConnected(false);
          return next;
        })
      );
      if (typeof offLeave === "function") unsubsRef.current.push(offLeave);

      // Bind to textarea
      const textarea = textareaRef.current;
      if (textarea) {
        const { TextAreaBinding } = yTextarea;
        bindingRef.current = new TextAreaBinding(ytext, textarea);
      }

      // TextAreaBinding reflects Y.Text changes; no extra UI writer needed

      // Proactive cleanup on pagehide/visibilitychange
      const onPageHide = () => {
        try {
          room.leave();
        } catch (err) {
          console.warn("[p2paste] room.leave failed on pagehide", err);
        }
      };
      window.addEventListener("pagehide", onPageHide);

      return () => {
        // Unsubscribe Trystero handlers
        try {
          unsubsRef.current.forEach((off) => {
            try {
              if (typeof off === "function") off();
            } catch (err) {
              console.warn("[p2paste] unsubscribe failed", err);
            }
          });
        } finally {
          unsubsRef.current = [];
        }
        // Remove Yjs local update listener
        try {
          doc.off("update", onLocalUpdate);
        } catch {}
        // Clear any request timeout
        try {
          clearTimeout(requestFullTimeoutId);
        } catch {}
        window.removeEventListener("pagehide", onPageHide);
        if (
          bindingRef.current &&
          typeof bindingRef.current.destroy === "function"
        ) {
          try {
            bindingRef.current.destroy();
          } catch (err) {
            console.warn("[p2paste] failed to destroy TextAreaBinding", err);
          }
        }
        try {
          room.leave();
        } catch (err) {
          console.warn("[p2paste] room.leave failed during cleanup", err);
        }
        // Force-close any tracker sockets to avoid long-lived retries that can wedge dev/HMR
        try {
          const sockets = getRelaySockets?.();
          if (sockets) {
            Object.values(sockets).forEach((ws) => {
              try {
                ws.close(1000, "cleanup");
              } catch (err) {
                console.warn("[p2paste] tracker websocket close failed", err);
              }
            });
          }
        } catch (err) {
          console.warn("[p2paste] failed to close tracker sockets", err);
        }
        bindingRef.current = null;
        roomRef.current = null;
        startedRef.current = false;
      };
    }

    const devDelayMs = process.env.NODE_ENV === "development" ? 400 : 0;
    let stopPromise = null;
    let canceled = false;
    let idleId = null;
    let kickoffTimeoutId = null;

    const kickoff = () => {
      if (canceled) return;
      stopPromise = start();
    };

    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      idleId = window.requestIdleCallback(() => {
        kickoffTimeoutId = setTimeout(kickoff, devDelayMs);
      });
    } else {
      kickoffTimeoutId = setTimeout(kickoff, devDelayMs);
    }

    return () => {
      canceled = true;
      try {
        if (
          idleId &&
          typeof window !== "undefined" &&
          "cancelIdleCallback" in window
        ) {
          window.cancelIdleCallback(idleId);
        }
      } catch {}
      try {
        if (kickoffTimeoutId) clearTimeout(kickoffTimeoutId);
      } catch {}
      // If start returned a cleanup promise, await it (ignored)
      Promise.resolve(stopPromise).then((cleanup) => {
        if (typeof cleanup === "function") cleanup();
      });
    };
  }, [slug]);

  const copyLink = async () => {
    if (!isBrowser) return;
    const url = window.location.href;
    let success = false;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        success = true;
      }
    } catch {}
    if (!success) {
      try {
        const helper = document.createElement("textarea");
        helper.value = url;
        helper.setAttribute("readonly", "");
        helper.style.position = "fixed";
        helper.style.top = "0";
        helper.style.left = "0";
        helper.style.opacity = "0";
        document.body.appendChild(helper);
        helper.select();
        helper.setSelectionRange(0, helper.value.length);
        success = document.execCommand("copy");
        document.body.removeChild(helper);
      } catch {}
    }
    if (!success) {
      try {
        window.prompt("Copy link", url);
      } catch {}
    }
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const createNewPaste = () => {
    const newSlug = generateHumanSlug();
    router.push(`/p/${newSlug}`);
  };

  return (
    <div className="min-h-screen flex flex-col p-4 sm:p-8 gap-4 w-full max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl sm:text-2xl font-medium tracking-tight">
          P2Paste
        </h1>
        <button
          onClick={createNewPaste}
          className="rounded-md border border-white/20 bg-foreground text-background px-3 py-1 text-sm shadow-sm hover:opacity-90"
          aria-label="Create new paste"
        >
          Create new paste
        </button>
      </div>
      <header className="grid grid-cols-[1fr_auto] items-center gap-2 sm:gap-3 sm:flex sm:justify-between rounded-md pt-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm opacity-70">Room</span>
          <code className="px-2 py-1 rounded bg-white/10 text-xs break-all">
            {slug}
          </code>
        </div>
        <div className="justify-self-end sm:hidden">
          <button
            onClick={copyLink}
            className="relative inline-flex items-center rounded border border-white/20 px-3 py-1 text-sm hover:bg-white/10 disabled:opacity-60 disabled:cursor-not-allowed w-[90px] justify-center"
            disabled={copied}
          >
            <span
              aria-live="polite"
              className={`${
                copied ? "pl-4" : "pl-0"
              } transition-[padding] whitespace-nowrap`}
            >
              {copied ? "Copied" : "Copy link"}
            </span>
            <span
              className={`${
                copied ? "opacity-100" : "opacity-0"
              } transition-opacity absolute left-2 top-1/2 -translate-y-1/2`}
              aria-hidden="true"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </span>
          </button>
        </div>
        <div className="hidden sm:block">
          <button
            onClick={copyLink}
            className="relative inline-flex items-center rounded border border-white/20 px-3 py-1 text-sm hover:bg-white/10 disabled:opacity-60 disabled:cursor-not-allowed w-[90px] justify-center"
            disabled={copied}
          >
            <span
              aria-live="polite"
              className={`${
                copied ? "pl-4" : "pl-0"
              } transition-[padding] whitespace-nowrap`}
            >
              {copied ? "Copied" : "Copy link"}
            </span>
            <span
              className={`${
                copied ? "opacity-100" : "opacity-0"
              } transition-opacity absolute left-2 top-1/2 -translate-y-1/2`}
              aria-hidden="true"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </span>
          </button>
        </div>
      </header>
      <main className="flex-1">
        <div className="relative">
          <textarea
            ref={textareaRef}
            placeholder="start typing… anyone on this link can edit in realtime"
            id="content"
            name="content"
            aria-label="Paste content"
            className="w-full h-[70vh] sm:h-[75vh] resize-y rounded-md p-4 pt-12 bg-transparent border border-white/20 focus:outline-none focus:ring-2 focus:ring-blue-500/40 font-mono text-base sm:text-sm"
          />
          <div className="absolute top-2 left-4 pointer-events-none">
            <span className="text-sm opacity-70 font-mono">
              Peers: {connectedPeers}
            </span>
          </div>
          <div className="absolute top-2 right-4 pointer-events-none">
            <span
              className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium font-mono ${
                connected
                  ? "bg-green-500/10 text-green-400"
                  : "bg-yellow-500/10 text-yellow-400 animate-pulse"
              }`}
            >
              {connected ? "Connected" : "Connecting"}
            </span>
          </div>
        </div>
      </main>
      <footer className="text-xs sm:text-sm opacity-60">
        Everything exists in your browser only while you&apos;re here.
      </footer>
    </div>
  );
}
