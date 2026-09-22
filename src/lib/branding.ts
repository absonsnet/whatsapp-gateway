import { prisma } from "@/lib/prisma";

export const DEFAULT_APP_NAME = "WA-AKG";
export const DEFAULT_APP_DESCRIPTION = "WhatsApp Gateway & Management Dashboard";

export async function getBrandConfig() {
    let config: {
        appName: string;
        description: string | null;
        logoUrl: string | null;
        faviconUrl: string | null;
    } | null = null;
    try {
        config = await prisma.systemConfig.findUnique({
            where: { id: "default" },
            select: { appName: true, description: true, logoUrl: true, faviconUrl: true },
        });
    } catch {
        // Use env values only when the database is unavailable or not initialized.
    }

    if (config) {
        return {
            appName: config.appName || DEFAULT_APP_NAME,
            description: config.description || DEFAULT_APP_DESCRIPTION,
            logoUrl: config.logoUrl || "/logo.svg",
            faviconUrl: config.faviconUrl || "/favicon.svg",
        };
    }

    return {
        appName: process.env.APP_NAME || DEFAULT_APP_NAME,
        description: process.env.APP_DESCRIPTION || DEFAULT_APP_DESCRIPTION,
        logoUrl: "/logo.svg",
        faviconUrl: "/favicon.svg",
    };
}