import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { generateApiKey, hashApiKey, isHashedApiKey } from "@/lib/api-auth";

// Get current user's API key
export async function GET() {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });

    try {
        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { apiKey: true }
        });

        const stored = user?.apiKey || null;
        // New keys are stored hashed and cannot be displayed again (shown only once during generation).
        // Legacy plaintext keys can still be displayed until the user generates a new one.
        const hashed = isHashedApiKey(stored);
        return NextResponse.json({
            status: true,
            message: "API key fetched",
            data: {
                apiKey: hashed ? null : stored, // null when already hashed
                apiKeySet: !!stored,
                hidden: hashed
            }
        });
    } catch (error) {
        return NextResponse.json({ status: false, message: "Failed to fetch API key", error: "Failed to fetch API key" }, { status: 500 });
    }
}

// Generate new API key
export async function POST() {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });

    try {
        const newApiKey = generateApiKey();

        // Store only the HASH in the database. Plaintext is returned only once in this response.
        await prisma.user.update({
            where: { id: session.user.id },
            data: { apiKey: hashApiKey(newApiKey) }
        });

        return NextResponse.json({
            status: true,
            message: "API key generated. Save it now — this key will not be shown again.",
            data: { apiKey: newApiKey }
        });
    } catch (error) {
        console.error("Generate API key error:", error);
        return NextResponse.json({ status: false, message: "Failed to generate API key", error: "Failed to generate API key" }, { status: 500 });
    }
}

// Delete/revoke API key
export async function DELETE() {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });

    try {
        await prisma.user.update({
            where: { id: session.user.id },
            data: { apiKey: null }
        });

        return NextResponse.json({ status: true, message: "API key revoked" });
    } catch (error) {
        return NextResponse.json({ status: false, message: "Failed to revoke API key", error: "Failed to revoke API key" }, { status: 500 });
    }
}
