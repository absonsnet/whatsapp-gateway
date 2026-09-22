import { prisma } from "@/lib/prisma";
import { WhatsAppInstance } from "./instance";
import { Server } from "socket.io";
import { initScheduler } from "@/lib/cron";
import { logger } from "@/lib/logger";

export class WhatsAppManager {
    private static instance: WhatsAppManager;
    private sessions: Map<string, WhatsAppInstance> = new Map();
    public io: Server | null = null;
    private watchdogInterval: NodeJS.Timeout | null = null;

    private constructor() {
        initScheduler();
    }

    public static getInstance(): WhatsAppManager {
        if (!WhatsAppManager.instance) {
            WhatsAppManager.instance = new WhatsAppManager();
        }
        return WhatsAppManager.instance;
    }

    setup(io: Server) {
        this.io = io;
    }

    async loadSessions() {
        if (!this.io) throw new Error("Socket.IO not initialized in WhatsAppManager");
        // Do not auto-start sessions that are LOGGED_OUT or intentionally STOPPED by the user.
        // Previously STOPPED sessions were loaded too, so a stopped session reconnected
        // by itself after a container restart.
        const sessions = await prisma.session.findMany({
            where: { status: { notIn: ["LOGGED_OUT", "STOPPED"] } }
        });

        for (const session of sessions) {
            const instance = new WhatsAppInstance(session.sessionId, session.userId, this.io);
            this.sessions.set(session.sessionId, instance);
            await instance.init();
        }
        logger.success("Manager", `Loaded ${sessions.length} sessions.`);

        // The watchdog auto-reconnect runs in the background (server-side) so
        // sessions that disconnect on their own (network blip, idle timeout, etc.)
        // reconnect automatically without requiring a user refresh or manual start.
        this.startWatchdog();
    }

    /**
    * Watchdog: checks all sessions every 45 seconds.
    * 1. Sessions that should be active but are DISCONNECTED -> reconnect automatically.
    * 2. Sessions that should be active but are missing from memory -> reload them.
    * Sessions stopped by the user or taken over by another connection (replaced) are skipped.
     */
    startWatchdog() {
        if (this.watchdogInterval) return;
        this.watchdogInterval = setInterval(() => {
            this.runWatchdog().catch((e) => logger.debug("Watchdog", "tick error (non-fatal)", e));
        }, 45_000);
        logger.info("Manager", "Session watchdog active (auto-reconnect every 45s).");
    }

    stopWatchdog() {
        if (this.watchdogInterval) {
            clearInterval(this.watchdogInterval);
            this.watchdogInterval = null;
        }
    }

    private async runWatchdog() {
        if (!this.io) return;

        // 1) Reconnect sesi in-memory yang mati.
        for (const [sessionId, inst] of this.sessions) {
            if (inst.isStopped || !inst.autoReconnect) continue;

            // Sesi yang "CONNECTED" tapi websocket sebenarnya mati (zombie):
            // Force reconnect so it remains online around the clock.
            if (inst.status === "CONNECTED") {
                if (!inst.isSocketAlive() && Date.now() - inst.lastInitAt > 60_000 && !inst.initializing) {
                    logger.warn("Watchdog", `Session ${sessionId} is CONNECTED but the socket is dead (zombie) -> reconnect`);
                    inst.init().catch((e) => logger.error("Watchdog", `Zombie reconnect ${sessionId} failed:`, e));
                }
                continue;
            }

            if (inst.status === "SCAN_QR") continue;
            if (inst.initializing || inst.reconnectPending) continue;
            // Allow time for the handshake after the last init before trying again.
            if (Date.now() - inst.lastInitAt < 60_000) continue;

            logger.info("Watchdog", `Auto-reconnecting session ${sessionId} (status ${inst.status})`);
            inst.init().catch((e) => logger.error("Watchdog", `Reconnect ${sessionId} failed:`, e));
        }

        // 2) Reload sessions that should be running but are missing from memory.
        try {
            const dbSessions = await prisma.session.findMany({
                where: { status: { notIn: ["LOGGED_OUT", "STOPPED"] } },
                select: { sessionId: true, userId: true },
            });
            for (const s of dbSessions) {
                if (this.sessions.has(s.sessionId)) continue;
                logger.info("Watchdog", `Reloading missing session: ${s.sessionId}`);
                const inst = new WhatsAppInstance(s.sessionId, s.userId, this.io);
                this.sessions.set(s.sessionId, inst);
                inst.init().catch((e) => logger.error("Watchdog", `Init ${s.sessionId} failed:`, e));
            }
        } catch {
            // Database error -> skip and try again on the next tick.
        }
    }

    async createSession(userId: string, name: string, customSessionId?: string) {
        // Fallback to global IO if instance IO is missing (Next.js Context Issue)
        if (!this.io && (global as any).io) {
            this.io = (global as any).io;
        }

        if (!this.io) {
            logger.error("Manager", "Socket.IO not initialized in WhatsAppManager, and global fallback failed.");
            throw new Error("Socket.IO not initialized");
        }

        // Use custom ID if provided, otherwise generate random
        const sessionId = customSessionId || Math.random().toString(36).substring(7);

        const session = await prisma.session.create({
            data: {
                userId,
                name,
                sessionId,
                status: "DISCONNECTED",
                botConfig: {
                    create: {
                        enabled: true,
                        botMode: "OWNER",
                        autoReplyMode: "ALL"
                    }
                }
            }
        });

        const instance = new WhatsAppInstance(sessionId, userId, this.io);
        this.sessions.set(sessionId, instance);
        await instance.init();

        return session;
    }

    public getInstance(sessionId: string) {
        return this.sessions.get(sessionId);
    }

    async deleteSession(sessionId: string) {
        const instance = this.sessions.get(sessionId);
        if (instance) {
            // Logout/Close socket
            instance.socket?.end(undefined);
            this.sessions.delete(sessionId);
        }
        // deleteMany is idempotent: it does not throw P2025 if the record already
        // terhapus (mis. delete ganda / balapan event dari socket zombie).
        await prisma.session.deleteMany({ where: { sessionId } });
    }

    /**
     * Cleanup an in-memory instance without touching the DB.
     * Used when the DB session has already been deleted but a zombie
     * Baileys socket is still emitting events.
     */
    cleanupOrphanInstance(sessionId: string) {
        const instance = this.sessions.get(sessionId);
        if (instance) {
            try {
                instance.isStopped = true;
                instance.socket?.end(undefined);
                instance.socket = null as any;
            } catch { /* ignore */ }
            this.sessions.delete(sessionId);
        }
    }

    async stopSession(sessionId: string) {
        const instance = this.sessions.get(sessionId);
        if (instance) {
            instance.isStopped = true; // Prevent auto-reconnect
            instance.socket?.end(undefined);
            instance.status = "STOPPED";
            this.io?.to(sessionId).emit("connection.update", { sessionId, status: "STOPPED", qr: null });
            await prisma.session.update({
                where: { sessionId },
                data: { status: "STOPPED" }
            });
        }
    }

    async startSession(sessionId: string) {
        // If already running, do nothing
        const existingInstance = this.sessions.get(sessionId);
        if (existingInstance && existingInstance.status === "CONNECTED") {
            return;
        }

        const session = await prisma.session.findUnique({ where: { sessionId } });
        if (!session) throw new Error("Session not found");

        // Re-initialize
        let instance = this.sessions.get(sessionId);
        if (!instance) {
            instance = new WhatsAppInstance(sessionId, session.userId, this.io!);
            this.sessions.set(sessionId, instance);
        }

        await instance.init();
    }

    async restartSession(sessionId: string) {
        await this.stopSession(sessionId);
        // Small delay to ensure cleanup
        await new Promise(resolve => setTimeout(resolve, 1000));
        await this.startSession(sessionId);
    }

    async requestPairingCode(sessionId: string, phoneNumber: string) {
        const instance = this.sessions.get(sessionId);
        if (!instance) throw new Error("Instance not found or not running");
        return await instance.requestPairingCode(phoneNumber);
    }
}

const globalForWhatsapp = global as unknown as { waManager: WhatsAppManager };

export const waManager = globalForWhatsapp.waManager || WhatsAppManager.getInstance();

// Always store in global to ensure singleton across Next.js compilations/chunks
globalForWhatsapp.waManager = waManager;
