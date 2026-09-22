import cron from "node-cron";
import path from "path";
import fs from "fs";
import { prisma } from "@/lib/prisma";
import { waManager } from "./manager";
import { logger } from "@/lib/logger";
import { userPlanAllows } from "@/lib/plans-store";

// Lock to prevent double execution
let isRunning = false;

// Track broadcasts currently being sent (prevent same broadcast from running twice)
const activeBroadcasts = new Set<string>();

/**
 * Auto Broadcast Cron Job
 * Runs every minute, checks if any auto broadcast is due to send
 */
export function startAutoBroadcast() {
    logger.info("AutoBroadcast", "Auto Broadcast scheduler started");

    // Check every minute
    cron.schedule("* * * * *", async () => {
        // Global lock — skip if previous run is still executing
        if (isRunning) {
            return;
        }

        isRunning = true;

        try {
            const now = new Date();

            // Find all active auto broadcasts
                // Lightweight scan: do not load mediaUrl (it may be a large data URI) every minute.
            const broadcasts = await prisma.autoBroadcast.findMany({
                where: { isActive: true },
                select: {
                    id: true,
                    lastSentAt: true,
                    intervalMin: true,
                    session: { select: { sessionId: true, status: true, userId: true } }
                }
            });

            for (const b of broadcasts) {
                // Skip if session is not connected
                if (b.session.status !== "CONNECTED") continue;

                // Plan gating: skip if the owner's plan does not allow auto-broadcast.
                if (!(await userPlanAllows(b.session.userId, "autoBroadcast"))) continue;

                // Skip if this broadcast is already being sent
                if (activeBroadcasts.has(b.id)) continue;

                // Check if it's time to send
                const intervalMs = b.intervalMin * 60 * 1000;
                if (b.lastSentAt && (now.getTime() - b.lastSentAt.getTime()) < intervalMs) {
                    continue; // Not yet time
                }

                // Mark as active BEFORE sending to prevent double trigger
                activeBroadcasts.add(b.id);

                // Update lastSentAt IMMEDIATELY to prevent next cron tick from picking it up
                await prisma.autoBroadcast.update({
                    where: { id: b.id },
                    data: { lastSentAt: now }
                });

                // Load the full broadcast (including mediaUrl) ONLY when actually sending.
                const full = await prisma.autoBroadcast.findUnique({
                    where: { id: b.id },
                    include: { session: { select: { sessionId: true } } }
                });
                if (!full) {
                    activeBroadcasts.delete(b.id);
                    continue;
                }

                // Send in background (don't block the loop)
                sendBroadcast(full).finally(() => {
                    activeBroadcasts.delete(b.id);
                });
            }
        } catch (error: any) {
            const code = error?.code;
            if (["P1001", "P1002", "P1008", "P1017"].includes(code)) {
                logger.warn("AutoBroadcast", `Database is not ready (${code}) — skipping this cycle.`);
            } else {
                logger.error("AutoBroadcast", "Error in auto broadcast loop:", error);
            }
        } finally {
            isRunning = false;
        }
    });
}

/**
 * Send broadcast to all target groups
 */
async function sendBroadcast(broadcast: any) {
    try {
        logger.info("AutoBroadcast", `Sending broadcast "${broadcast.name}" for session ${broadcast.session.sessionId}`);

        const instance = waManager.getInstance(broadcast.session.sessionId);
        if (!instance || !instance.socket) return;

        // Determine target groups
        let targetJids: string[] = [];
        const targets = broadcast.targets as string[];

        if (targets.includes("ALL")) {
            const groups = await prisma.group.findMany({
                where: { sessionId: broadcast.sessionId },
                select: { jid: true }
            });
            targetJids = groups.map(g => g.jid);
        } else {
            targetJids = targets;
        }

        if (targetJids.length === 0) {
            logger.warn("AutoBroadcast", `No targets for broadcast "${broadcast.name}"`);
            return;
        }

        // Send to each group
        let sentCount = 0;
        for (const jid of targetJids) {
            try {
                if (broadcast.mediaUrl && broadcast.mediaType) {
                    const mediaContent: any = {};
                    let mediaSource: any;

                    // Determine the media source: data URI (database), local file (legacy), or external URL.
                    if (broadcast.mediaUrl.startsWith("data:")) {
                        const base64 = broadcast.mediaUrl.split(",")[1] || "";
                        mediaSource = Buffer.from(base64, "base64");
                    } else if (broadcast.mediaUrl.startsWith("/api/media/")) {
                        // Local file — read from disk
                        const filename = broadcast.mediaUrl.replace("/api/media/", "");

                        // Security: prevent path traversal
                        if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
                            logger.warn("AutoBroadcast", `Invalid filename: ${filename}`);
                            continue;
                        }

                        const mediaDir = path.join(process.cwd(), "data", "media");
                        const filePath = path.join(mediaDir, filename);

                        // Ensure resolved path is within mediaDir
                        const resolved = path.resolve(filePath);
                        if (!resolved.startsWith(path.resolve(mediaDir))) {
                            logger.warn("AutoBroadcast", `Path traversal attempt: ${filename}`);
                            continue;
                        }

                        if (fs.existsSync(filePath)) {
                            mediaSource = fs.readFileSync(filePath);
                        } else {
                            logger.warn("AutoBroadcast", `Media is missing from disk (${filename}) — the filesystem may be ephemeral (Railway without a volume). Sending text only. Mount persistent storage at /app/data to fix this.`);
                            // Skip media and send text only.
                            await instance.socket.sendMessage(jid, { text: broadcast.message });
                            sentCount++;
                            await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 3000));
                            continue;
                        }
                    } else {
                        mediaSource = { url: broadcast.mediaUrl };
                    }

                    if (broadcast.mediaType === "image") {
                        mediaContent.image = mediaSource;
                        mediaContent.caption = broadcast.message;
                    } else if (broadcast.mediaType === "video") {
                        mediaContent.video = mediaSource;
                        mediaContent.caption = broadcast.message;
                    } else if (broadcast.mediaType === "document") {
                        mediaContent.document = mediaSource;
                        mediaContent.caption = broadcast.message;
                    }

                    await instance.socket.sendMessage(jid, mediaContent);
                } else {
                    await instance.socket.sendMessage(jid, { text: broadcast.message });
                }
                sentCount++;

                // Delay between messages to avoid spam detection (2-5 seconds random)
                await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 3000));
            } catch (e) {
                logger.error("AutoBroadcast", `Failed to send to ${jid}:`, e);
            }
        }

        logger.success("AutoBroadcast", `Broadcast "${broadcast.name}" sent to ${sentCount}/${targetJids.length} groups`);
    } catch (error) {
        logger.error("AutoBroadcast", `Error sending broadcast "${broadcast.name}":`, error);
    }
}
