import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encryptJson } from "@/lib/crypto";
import { auth } from "@/lib/auth";

/**
 * GET /api/cloud-storage/google/callback — OAuth 2.0 callback for Google Drive
 *
 * Google redirects here after user authorizes. We exchange the code for tokens,
 * encrypt and save them as a CloudStorageConfig, then redirect back to the dashboard.
 */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const code = searchParams.get("code");
        const error = searchParams.get("error");
        const state = searchParams.get("state"); // We pass userId or configId in state

        if (error) {
            return NextResponse.redirect(
                new URL(`/dashboard/cloud-storage?error=${encodeURIComponent(error)}`, request.url)
            );
        }

        if (!code) {
            return NextResponse.redirect(
                new URL("/dashboard/cloud-storage?error=No+authorization+code+received", request.url)
            );
        }

        // Verify the user is authenticated
        const session = await auth();
        const userId = (session?.user as any)?.id;

        if (!userId) {
            return NextResponse.redirect(
                new URL("/auth/login?error=Please+login+first", request.url)
            );
        }

        // Exchange code for tokens
        const clientId = process.env.GOOGLE_CLIENT_ID;
        const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.BASE_URL || "http://localhost:3030";

        if (!clientId || !clientSecret) {
            return NextResponse.redirect(
                new URL("/dashboard/cloud-storage?error=Google+OAuth+not+configured", request.url)
            );
        }

        const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                code,
                client_id: clientId,
                client_secret: clientSecret,
                redirect_uri: `${baseUrl}/api/cloud-storage/google/callback`,
                grant_type: "authorization_code",
            }),
        });

        if (!tokenRes.ok) {
            const errorBody = await tokenRes.text();
            console.error("Google token exchange failed:", errorBody);
            return NextResponse.redirect(
                new URL("/dashboard/cloud-storage?error=Token+exchange+failed", request.url)
            );
        }

        const tokens = await tokenRes.json();

        // Get user info for the config name
        let userName = "Google Drive";
        try {
            const userInfoRes = await fetch("https://www.googleapis.com/drive/v3/about?fields=user", {
                headers: { Authorization: `Bearer ${tokens.access_token}` },
            });
            if (userInfoRes.ok) {
                const userInfo = await userInfoRes.json();
                userName = `Google Drive (${userInfo.user?.emailAddress || userInfo.user?.displayName || "Connected"})`;
            }
        } catch {
            // Non-critical — use default name
        }

        // Extract folder ID from state if provided
        let folderId: string | undefined;
        if (state) {
            try {
                const stateData = JSON.parse(Buffer.from(state, "base64").toString("utf8"));
                folderId = stateData.folderId;
            } catch {
                // state might not be JSON
            }
        }

        // Encrypt and save credentials
        const credentials = {
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            tokenExpiry: Date.now() + (tokens.expires_in || 3600) * 1000,
            folderId,
        };

        const encrypted = encryptJson(credentials);

        // Check if user already has a Google Drive config — update it
        const existing = await prisma.cloudStorageConfig.findFirst({
            where: { userId, provider: "GOOGLE_DRIVE" },
        });

        if (existing) {
            await prisma.cloudStorageConfig.update({
                where: { id: existing.id },
                data: {
                    credentials: encrypted,
                    name: userName,
                    isActive: true,
                },
            });
        } else {
            await prisma.cloudStorageConfig.create({
                data: {
                    userId,
                    provider: "GOOGLE_DRIVE",
                    name: userName,
                    credentials: encrypted,
                    isActive: true,
                },
            });
        }

        return NextResponse.redirect(
            new URL("/dashboard/cloud-storage?success=Google+Drive+connected+successfully", request.url)
        );
    } catch (error: any) {
        console.error("Google OAuth callback error:", error);
        return NextResponse.redirect(
            new URL(`/dashboard/cloud-storage?error=${encodeURIComponent(error.message || "OAuth failed")}`, request.url)
        );
    }
}
