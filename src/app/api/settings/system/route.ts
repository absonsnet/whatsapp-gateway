import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
    try {
        const config = await prisma.systemConfig.findUnique({
            where: { id: "default" },
            select: {
                appName: true,
                description: true,
                faviconUrl: true,
                logoUrl: true,
                timezone: true,
                enableRegistration: true,
                allowLocalStorage: true,
                allowLocalStorageFor: true
            }
        });

        // Public fields (needed for UI branding everywhere)
        const safeConfig = config ? {
            appName: config.appName,
            description: config.description || "WhatsApp Gateway & Management Dashboard",
            faviconUrl: config.faviconUrl || "/favicon.svg",
            logoUrl: config.logoUrl,
            timezone: config.timezone,
        } : {
            appName: "WA-AKG",
            description: "WhatsApp Gateway & Management Dashboard",
            faviconUrl: "/favicon.svg",
            timezone: "Asia/Jakarta"
        };

        // Admin-only sensitive fields — return only when caller is SUPERADMIN
        try {
            const user = await getAuthenticatedUser(request);
            if (user?.role === "SUPERADMIN" && config) {
                return NextResponse.json({
                    status: true,
                    message: "System config fetched",
                    data: {
                        ...safeConfig,
                        enableRegistration: config.enableRegistration,
                        allowLocalStorage: config.allowLocalStorage,
                        allowLocalStorageFor: config.allowLocalStorageFor,
                    },
                });
            }
        } catch {
            // unauthenticated — fall through to public response
        }

        return NextResponse.json({ status: true, message: "System config fetched", data: safeConfig });
    } catch (error) {
        return NextResponse.json({ status: false, message: "Failed to fetch settings", error: "Failed to fetch settings" }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const user = await getAuthenticatedUser(req);
        if (!user || user.role !== "SUPERADMIN") {
            return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { appName, description, logoUrl, faviconUrl, timezone, enableRegistration, allowLocalStorage, allowLocalStorageFor } = body;

        // Build patch object only with provided fields, so partial updates don't wipe others
        const patch: Record<string, unknown> = {};
        if (appName !== undefined) patch.appName = appName;
        if (description !== undefined) patch.description = description;
        if (logoUrl !== undefined) patch.logoUrl = logoUrl;
        if (faviconUrl !== undefined) patch.faviconUrl = faviconUrl;
        if (timezone !== undefined) patch.timezone = timezone;
        if (enableRegistration !== undefined) patch.enableRegistration = enableRegistration;
        if (allowLocalStorage !== undefined) patch.allowLocalStorage = allowLocalStorage;
        if (allowLocalStorageFor !== undefined) patch.allowLocalStorageFor = allowLocalStorageFor;

        const config = await prisma.systemConfig.upsert({
            where: { id: "default" },
            update: patch,
            create: {
                id: "default",
                appName: appName ?? "WA-AKG",
                description: description ?? "WhatsApp Gateway & Management Dashboard",
                logoUrl: logoUrl ?? "",
                faviconUrl: faviconUrl ?? "/favicon.svg",
                timezone: timezone ?? "Asia/Jakarta",
                enableRegistration: enableRegistration ?? true,
            },
        });

        return NextResponse.json({ status: true, message: "System settings updated", data: config });
    } catch (error) {
        console.error("Update system settings error:", error);
        return NextResponse.json({ status: false, message: "Failed to update settings", error: "Failed to update settings" }, { status: 500 });
    }
}
