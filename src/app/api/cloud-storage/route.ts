import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { encryptJson, decryptJson } from "@/lib/crypto";

/**
 * Mask sensitive credential fields for safe display in the frontend.
 */
function maskCredentials(provider: string, credentials: any): any {
    const masked = { ...credentials };

    switch (provider) {
        case "GOOGLE_DRIVE":
            if (masked.accessToken) masked.accessToken = "••••" + masked.accessToken.slice(-8);
            if (masked.refreshToken) masked.refreshToken = "••••" + masked.refreshToken.slice(-8);
            break;
        case "AWS_S3":
            if (masked.secretAccessKey) masked.secretAccessKey = "••••" + masked.secretAccessKey.slice(-4);
            if (masked.accessKeyId) masked.accessKeyId = masked.accessKeyId.slice(0, 4) + "••••" + masked.accessKeyId.slice(-4);
            break;
        case "CLOUDINARY":
            if (masked.apiSecret) masked.apiSecret = "••••" + masked.apiSecret.slice(-4);
            break;
        case "WEBDAV":
            if (masked.password) masked.password = "••••••••";
            break;
    }

    return masked;
}

/**
 * GET /api/cloud-storage — List user's cloud storage configurations
 */
export async function GET(request: NextRequest) {
    const user = await getAuthenticatedUser(request);
    if (!user) {
        return NextResponse.json({ status: false, message: "Unauthorized" }, { status: 401 });
    }

    try {
        const configs = await prisma.cloudStorageConfig.findMany({
            where: { userId: user.id },
            orderBy: { updatedAt: "desc" },
        });

        const safeConfigs = configs.map((config) => {
            let creds: any = {};
            try {
                creds = decryptJson(config.credentials);
            } catch {
                creds = { error: "Failed to decrypt credentials" };
            }

            return {
                id: config.id,
                provider: config.provider,
                name: config.name,
                isActive: config.isActive,
                credentials: maskCredentials(config.provider, creds),
                createdAt: config.createdAt.toISOString(),
                updatedAt: config.updatedAt.toISOString(),
            };
        });

        return NextResponse.json({
            status: true,
            message: "Cloud storage configs fetched",
            data: safeConfigs,
        });
    } catch (error: any) {
        console.error("Cloud storage list error:", error);
        return NextResponse.json({ status: false, message: "Failed to list configs" }, { status: 500 });
    }
}

/**
 * POST /api/cloud-storage — Create or update a cloud storage configuration
 * Body: { id?, provider, name?, credentials, isActive? }
 */
export async function POST(request: NextRequest) {
    const user = await getAuthenticatedUser(request);
    if (!user) {
        return NextResponse.json({ status: false, message: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { id, provider, name, credentials, isActive } = body;

        if (!provider || !credentials) {
            return NextResponse.json(
                { status: false, message: "provider and credentials are required" },
                { status: 400 }
            );
        }

        // Validate provider
        const validProviders = ["GOOGLE_DRIVE", "AWS_S3", "CLOUDINARY", "WEBDAV"];
        if (!validProviders.includes(provider)) {
            return NextResponse.json(
                { status: false, message: `Invalid provider. Must be one of: ${validProviders.join(", ")}` },
                { status: 400 }
            );
        }

        // Encrypt credentials
        const encryptedCreds = encryptJson(credentials);

        if (id) {
            // Update existing config — verify ownership
            const existing = await prisma.cloudStorageConfig.findFirst({
                where: { id, userId: user.id },
            });

            if (!existing) {
                return NextResponse.json({ status: false, message: "Config not found" }, { status: 404 });
            }

            const updated = await prisma.cloudStorageConfig.update({
                where: { id },
                data: {
                    provider,
                    name: name || existing.name,
                    credentials: encryptedCreds,
                    isActive: isActive !== undefined ? isActive : existing.isActive,
                },
            });

            return NextResponse.json({
                status: true,
                message: "Cloud storage config updated",
                data: { id: updated.id, provider: updated.provider, name: updated.name, isActive: updated.isActive },
            });
        } else {
            // Create new config
            const created = await prisma.cloudStorageConfig.create({
                data: {
                    userId: user.id,
                    provider,
                    name: name || `My ${provider.replace("_", " ")} Storage`,
                    credentials: encryptedCreds,
                    isActive: isActive !== undefined ? isActive : true,
                },
            });

            return NextResponse.json({
                status: true,
                message: "Cloud storage config created",
                data: { id: created.id, provider: created.provider, name: created.name, isActive: created.isActive },
            });
        }
    } catch (error: any) {
        console.error("Cloud storage save error:", error);
        return NextResponse.json({ status: false, message: "Failed to save config" }, { status: 500 });
    }
}

/**
 * DELETE /api/cloud-storage — Delete a cloud storage configuration
 * Body: { id }
 */
export async function DELETE(request: NextRequest) {
    const user = await getAuthenticatedUser(request);
    if (!user) {
        return NextResponse.json({ status: false, message: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { id } = body;

        if (!id) {
            return NextResponse.json({ status: false, message: "id is required" }, { status: 400 });
        }

        // Verify ownership
        const existing = await prisma.cloudStorageConfig.findFirst({
            where: { id, userId: user.id },
        });

        if (!existing) {
            return NextResponse.json({ status: false, message: "Config not found" }, { status: 404 });
        }

        await prisma.cloudStorageConfig.delete({ where: { id } });

        return NextResponse.json({
            status: true,
            message: "Cloud storage config deleted",
        });
    } catch (error: any) {
        console.error("Cloud storage delete error:", error);
        return NextResponse.json({ status: false, message: "Failed to delete config" }, { status: 500 });
    }
}
