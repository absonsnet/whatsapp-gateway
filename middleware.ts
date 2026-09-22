import NextAuth from "next-auth";
import type { NextRequest } from "next/server";
import { authConfig } from "./src/auth.config";

const authMiddleware = NextAuth(authConfig).auth;

// Public URL for redirect normalization.
// Read from the request's original host: forwarded header (behind a proxy/production)
// or the request origin (local = localhost). Do not hardcode a domain so local
// redirects stay on localhost while production follows its current domain.
function getPublicUrl(request: NextRequest): string {
    const fwdHost = request.headers.get("x-forwarded-host");
    if (fwdHost) {
        const fwdProto = request.headers.get("x-forwarded-proto") || "https";
        return `${fwdProto}://${fwdHost}`;
    }

    const origin = request.nextUrl.origin;
    // Only when the origin binds to all interfaces (0.0.0.0) and cannot redirect: use env, then localhost.
    if (/^https?:\/\/0\.0\.0\.0(:\d+)?$/i.test(origin)) {
        const envUrl = process.env.NEXTAUTH_URL || process.env.BASE_URL;
        if (envUrl) return envUrl.replace(/\/$/, "");
        return origin.replace("0.0.0.0", "localhost");
    }
    return origin;
}

export default async function middleware(request: NextRequest) {
    const response = await (authMiddleware as any)(request, {});

    if (response?.headers) {
        const location = response.headers.get("location");
        if (location) {
            const publicUrl = getPublicUrl(request);

            try {
                let publicHost: URL;
                try {
                    publicHost = new URL(publicUrl);
                } catch {
                    return response;
                }

                // Try to parse the location URL — it may be absolute or relative
                let targetUrl: URL;
                if (location.startsWith("http://") || location.startsWith("https://")) {
                    targetUrl = new URL(location);
                } else {
                    targetUrl = new URL(location, publicUrl);
                }

                // Force the host to be the public host (no matter what)
                targetUrl.protocol = publicHost.protocol;
                targetUrl.hostname = publicHost.hostname;
                targetUrl.port = publicHost.port;

                // Also fix nested callbackUrl
                const cb = targetUrl.searchParams.get("callbackUrl");
                if (cb) {
                    try {
                        const cbUrl = cb.startsWith("http") ? new URL(cb) : new URL(cb, publicUrl);
                        cbUrl.protocol = publicHost.protocol;
                        cbUrl.hostname = publicHost.hostname;
                        cbUrl.port = publicHost.port;
                        targetUrl.searchParams.set("callbackUrl", cbUrl.toString());
                    } catch {
                        // ignore
                    }
                }

                response.headers.set("location", targetUrl.toString());
            } catch {
                // ignore parse errors
            }
        }
    }

    return response;
}

export const config = {
    matcher: ['/((?!api|_next/static|_next/image|.*\\.png$).*)'],
};
