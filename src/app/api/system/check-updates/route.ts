import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";

// ============================================================
// UPSTREAM UPDATE CHECK DIMATIKAN (manual update only)
// ------------------------------------------------------------
// Previously this route polled releases from another repository.
// (vinsaeroy/WA-AKG) lewat getLatestRelease(). Akibatnya tiap
// repo upstream rilis versi baru, instance ini ikut kena
// notifikasi/terdorong update.
//
// Per request: disconnect it from the other repository so changes there
// do NOT affect this application. Updates are performed manually, then
// baru di-push ke main repo sendiri.
//
// If this is enabled again in the future (for example, to check this repository),
// import { getLatestRelease } from "@/lib/github" dan { prisma }
// from "@/lib/prisma", lalu kembalikan logika notifikasi di bawah.
// ============================================================

const CURRENT_VERSION = "v1.5.4";

export async function POST(req: NextRequest) {
    const user = await getAuthenticatedUser(req); // Support API Key
    if (!user) {
        return NextResponse.json(
            { status: false, message: "Unauthorized", error: "Unauthorized" },
            { status: 401 }
        );
    }

    // Do not make any requests to GitHub or an upstream repository.
    return NextResponse.json({
        status: true,
        message: "Update check is disabled (manual update mode)",
        data: { version: CURRENT_VERSION, upstreamCheck: false }
    });
}
