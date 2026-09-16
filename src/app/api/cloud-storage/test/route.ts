import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { decryptJson } from "@/lib/crypto";
import { createProvider } from "@/lib/cloud-storage";

/**
 * POST /api/cloud-storage/test — Test connectivity for a saved config
 * Body: { configId } or { provider, credentials } for unsaved testing
 */
export async function POST(request: NextRequest) {
    const user = await getAuthenticatedUser(request);
    if (!user) {
        return NextResponse.json({ status: false, message: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { configId, provider: rawProvider, credentials: rawCredentials } = body;

        let provider: string;
        let credentials: any;

        if (configId) {
            // Test a saved config
            const config = await prisma.cloudStorageConfig.findFirst({
                where: { id: configId, userId: user.id },
            });

            if (!config) {
                return NextResponse.json({ status: false, message: "Config not found" }, { status: 404 });
            }

            provider = config.provider;
            credentials = decryptJson(config.credentials);
        } else if (rawProvider && rawCredentials) {
            // Test unsaved credentials directly
            provider = rawProvider;
            credentials = rawCredentials;
        } else {
            return NextResponse.json(
                { status: false, message: "configId or (provider + credentials) required" },
                { status: 400 }
            );
        }

        const storageProvider = createProvider(provider, credentials);
        const success = await storageProvider.test();

        return NextResponse.json({
            status: true,
            message: success ? "Connection successful" : "Connection failed",
            data: { success },
        });
    } catch (error: any) {
        console.error("Cloud storage test error:", error);
        return NextResponse.json({
            status: false,
            message: `Test failed: ${error.message || "Unknown error"}`,
            data: { success: false },
        }, { status: 500 });
    }
}
