import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server } from "socket.io";
import { setupSocket } from "./socket";
import { waManager } from "../modules/whatsapp/manager";
import { logger } from "../lib/logger";
import pkg from "../../package.json";

// Suppress noisy debug logs in production to prevent Railway log rate limit
if (process.env.NODE_ENV === "production") {
    // Filter console.log/info — keep error and warn
    const originalLog = console.log;
    const originalInfo = console.info;
    
    const shouldBlock = (args: any[]) => {
        const msg = String(args[0] || "");
        const fullMsg = args.map(a => typeof a === "string" ? a : JSON.stringify(a).slice(0, 200)).join(" ");
        // Block Baileys raw debug dumps
        return (
            msg.includes("Buffer ") ||
            msg.includes("pubKey") ||
            msg.includes("privKey") ||
            msg.includes("rootKey") ||
            msg.includes("ephemeralKeyPair") ||
            msg.includes("currentRatchet") ||
            msg.includes("Closing session") ||
            msg.includes("Closing open session") ||
            msg.includes("indexInfo") ||
            msg.includes("pendingPreKey") ||
            msg.includes("registrationId") ||
            msg.includes("_chains") ||
            msg.includes("baseKey") ||
            msg.includes("chainKey") ||
            msg.includes("messageKeys") ||
            fullMsg.includes("Buffer ") ||
            fullMsg.includes("pubKey:") ||
            fullMsg.includes("privKey:")
        );
    };
    
    console.log = (...args: any[]) => {
        if (shouldBlock(args)) return;
        originalLog(...args);
    };
    console.info = (...args: any[]) => {
        if (shouldBlock(args)) return;
        originalInfo(...args);
    };
}

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "localhost";
const port = parseInt(process.env.PORT || "3030", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  let heartbeatInterval: NodeJS.Timeout | null = null;
  let keepAliveInterval: NodeJS.Timeout | null = null;

  const server = createServer(async (req, res) => {
    try {
      if (!req.url) return;

      // Trust proxy headers (x-forwarded-host, x-forwarded-proto)
      // This is critical for Railway/Render/etc. so Next.js sees the public URL
      const forwardedHost = req.headers["x-forwarded-host"];
      const forwardedProto = req.headers["x-forwarded-proto"];

      if (forwardedHost && typeof forwardedHost === "string") {
        // Override host header so Next.js generates correct absolute URLs
        req.headers.host = forwardedHost;
      }

      // Some Next.js internals check x-forwarded-* — make sure they're set
      if (!forwardedProto && process.env.NODE_ENV === "production") {
        req.headers["x-forwarded-proto"] = "https";
      }

      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      logger.error("Server", "Error handling", req.url, err);
      res.statusCode = 500;
      res.end("internal server error");
    }
  });

  const io = new Server(server, {
    path: "/api/socket/io",
    addTrailingSlash: false,
    // Prefer WebSocket; allow polling as fallback for legacy clients,
    // but new clients now request `transports: ['websocket']` directly.
    transports: ["websocket", "polling"],
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  setupSocket(io);
  // Optional: Global instance for Baileys to emit events
  (global as any).io = io;

  // Initialize WhatsApp Manager
  waManager.setup(io);
  waManager.loadSessions();

  // Start Scheduler
  import("../modules/whatsapp/scheduler").then(m => m.startScheduler());

  // Start Auto Broadcast
  import("../modules/whatsapp/auto-broadcast").then(m => m.startAutoBroadcast());

  // Cloudflare 520 Fix: increase keep-alive timeout so Node doesn't kill idle connections that Cloudflare expects to reuse
  // See: https://github.com/vercel/next.js/issues/48962
  server.keepAliveTimeout = 120 * 1000; // 120 seconds
  server.headersTimeout = 120 * 1000; // 120 seconds

  server.listen(port, () => {
    logger.banner(pkg.name.toUpperCase(), pkg.version, port);

    // --- WA-AKG Monitor Heartbeat ---
    // Sends a ping every 30 seconds to the monitoring server
    // This is only to document how many active WA-AKG services exist.
    // It is monitoring only and has no other purpose. More active WA-AKG services
    // help guide further development. Thank you for using WA-AKG.
    const MONITOR_URL = "https://api-wa-akg.aikeigroup.net/api/ping";
    const APP_URL = process.env.BASE_URL || `http://${hostname}:${port}`; // You can change this for your WA-AKG security, but do not remove the heartbeat entirely.
    const APP_NAME = process.env.APP_NAME || "WA-AKG";

    const sendHeartbeat = async () => {
      try {
        await fetch(MONITOR_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            appUrl: APP_URL,
            appName: APP_NAME,
            isBackend: true,
            systemInfo: {
              platform: process.platform,
              nodeVersion: process.version,
              memoryUsage: Math.round(process.memoryUsage().rss / 1024 / 1024) + "MB"
            }
          }),
        });
      } catch (error) {
        // Silently fail to not disturb the main application
      }
    };

    // Initial ping
    sendHeartbeat();
    // Interval ping
    heartbeatInterval = setInterval(sendHeartbeat, 30000);
    // --------------------------------

    // --- Self keep-alive (anti idle-sleep) ---
    // Some platforms (for example, Render free) put services to sleep without
    // incoming HTTP traffic, which also kills WhatsApp sessions. Periodically pinging
    // the public URL keeps the platform treating the service as active.
    // Runs only when BASE_URL is set to a public HTTPS URL and is not disabled.
    const baseUrl = process.env.BASE_URL || "";
    const keepAliveEnabled = baseUrl.startsWith("https://") && process.env.DISABLE_KEEPALIVE !== "true";
    if (keepAliveEnabled) {
      const selfPing = async () => {
        try {
          await fetch(`${baseUrl.replace(/\/$/, "")}/api/health`, { method: "GET" });
        } catch {
          // Fail silently and try again on the next interval.
        }
      };
      // Ping every 4 minutes (below common idle-sleep threshold of ~15 mins).
      keepAliveInterval = setInterval(selfPing, 4 * 60 * 1000);
      logger.info("Server", `Self keep-alive active → ${baseUrl}/api/health (every 4 minutes)`);
    }
    // --------------------------------
  });

  // --- Graceful Shutdown ---
  // Important for Railway/production: close DB pools, sockets, and server cleanly
  // so in-flight requests finish and resources are released before container exits
  let isShuttingDown = false;
  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.info("Server", `Received ${signal}, shutting down gracefully...`);

    // Stop accepting new connections
    server.close(() => {
      logger.info("Server", "HTTP server closed");
    });

    // Clear heartbeat
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    if (keepAliveInterval) clearInterval(keepAliveInterval);

    // Close socket.io connections
    try {
      io.close();
    } catch { /* ignore */ }

    // Force exit after 10s if cleanup hangs
    setTimeout(() => {
      logger.warn("Server", "Forced exit after timeout");
      process.exit(0);
    }, 10000).unref();

    // Allow normal exit when all listeners closed
    setTimeout(() => process.exit(0), 2000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // Handle uncaught errors so process doesn't crash silently
  process.on("uncaughtException", (err) => {
    logger.error("Server", "Uncaught exception:", err);
  });
  process.on("unhandledRejection", (reason) => {
    logger.error("Server", "Unhandled rejection:", reason);
  });
});
