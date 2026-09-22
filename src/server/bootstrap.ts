// ============================================================
// BOOTSTRAP — load .env BEFORE importing other modules
// ------------------------------------------------------------
// The Prisma client is created during import (src/lib/prisma.ts). If .env
// has not loaded, DATABASE_URL is empty and Prisma defaults to localhost:5432,
// causing ALL queries to fail (registration/login/scheduler).
//
// tsx does NOT load .env automatically, so load it manually here before
// dynamically importing the main server. Do not overwrite existing env values
// (Docker/host environments inject variables through the container).
// ============================================================
import fs from "fs";
import path from "path";

function loadEnvFile(file: string) {
    try {
        const p = path.resolve(process.cwd(), file);
        if (!fs.existsSync(p)) return;
        const content = fs.readFileSync(p, "utf8");
        for (const rawLine of content.split(/\r?\n/)) {
            const line = rawLine.trim();
            if (!line || line.startsWith("#")) continue;
            const eq = line.indexOf("=");
            if (eq === -1) continue;
            const key = line.slice(0, eq).trim();
            if (!key || process.env[key] !== undefined) continue; // do not overwrite existing env values
            let val = line.slice(eq + 1).trim();
            if (
                (val.startsWith('"') && val.endsWith('"')) ||
                (val.startsWith("'") && val.endsWith("'"))
            ) {
                val = val.slice(1, -1);
            }
            process.env[key] = val;
        }
    } catch {
        /* ignore */
    }
}

// .env.local takes precedence over .env (the more specific file loads first
// because loadEnvFile does not overwrite populated keys).
loadEnvFile(".env.local");
loadEnvFile(".env");

// Import the main server only now, so Prisma and other modules read the correct DATABASE_URL.
// No top-level await (the root is not "type: module", so tsx transpiles to CJS).
import("./index.js").catch((e) => {
    console.error("Failed to start server:", e);
    process.exit(1);
});
