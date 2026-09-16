import { ICloudStorageProvider } from "./index";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { encryptJson } from "@/lib/crypto";

interface GoogleDriveCredentials {
    accessToken: string;
    refreshToken: string;
    tokenExpiry?: number; // epoch ms
    folderId?: string;    // target folder ID in Google Drive
}

/**
 * Google Drive cloud storage provider using OAuth 2.0.
 * Uploads files via the Google Drive API v3 and returns a shareable view link.
 */
export class GoogleDriveProvider implements ICloudStorageProvider {
    private creds: GoogleDriveCredentials;
    private configId?: string;

    constructor(credentials: GoogleDriveCredentials, configId?: string) {
        this.creds = credentials;
        this.configId = configId;
    }

    /**
     * Refresh the access token using the refresh token if expired.
     */
    private async ensureFreshToken(): Promise<string> {
        // If token is not expired, use it directly
        if (this.creds.tokenExpiry && Date.now() < this.creds.tokenExpiry - 60000) {
            return this.creds.accessToken;
        }

        const clientId = process.env.GOOGLE_CLIENT_ID;
        const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

        if (!clientId || !clientSecret) {
            throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required for Google Drive");
        }

        logger.info("CloudStorage", "Refreshing Google Drive access token...");

        const res = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                refresh_token: this.creds.refreshToken,
                grant_type: "refresh_token",
            }),
        });

        if (!res.ok) {
            const error = await res.text();
            throw new Error(`Failed to refresh Google token: ${error}`);
        }

        const data = await res.json();
        this.creds.accessToken = data.access_token;
        this.creds.tokenExpiry = Date.now() + (data.expires_in || 3600) * 1000;

        // Persist the refreshed token back to the database
        if (this.configId) {
            try {
                await prisma.cloudStorageConfig.update({
                    where: { id: this.configId },
                    data: { credentials: encryptJson(this.creds) },
                });
            } catch (e) {
                logger.warn("CloudStorage", "Failed to persist refreshed Google token:", e);
            }
        }

        return this.creds.accessToken;
    }

    async upload(buffer: Buffer, filename: string, mimetype: string): Promise<string> {
        const token = await this.ensureFreshToken();

        // Multipart upload to Google Drive API v3
        const boundary = "wa_akg_boundary_" + Date.now();
        const metadata: any = {
            name: filename,
            mimeType: mimetype,
        };

        if (this.creds.folderId) {
            metadata.parents = [this.creds.folderId];
        }

        const metadataStr = JSON.stringify(metadata);

        // Build multipart body
        const parts = [
            `--${boundary}\r\n`,
            `Content-Type: application/json; charset=UTF-8\r\n\r\n`,
            metadataStr,
            `\r\n--${boundary}\r\n`,
            `Content-Type: ${mimetype}\r\n\r\n`,
        ];

        const headerBuffer = Buffer.from(parts.join(""), "utf-8");
        const footerBuffer = Buffer.from(`\r\n--${boundary}--`, "utf-8");
        const body = Buffer.concat([headerBuffer, buffer, footerBuffer]);

        const res = await fetch(
            "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink,webContentLink",
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": `multipart/related; boundary=${boundary}`,
                },
                body,
            }
        );

        if (!res.ok) {
            const error = await res.text();
            throw new Error(`Google Drive upload failed: ${res.status} ${error}`);
        }

        const file = await res.json();

        // Make the file publicly readable
        await fetch(
            `https://www.googleapis.com/drive/v3/files/${file.id}/permissions`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    role: "reader",
                    type: "anyone",
                }),
            }
        ).catch(e => logger.warn("CloudStorage", "Failed to set Google Drive file permissions:", e));

        // Return direct download link
        return `https://drive.google.com/uc?export=view&id=${file.id}`;
    }

    async delete(fileUrl: string): Promise<void> {
        const token = await this.ensureFreshToken();
        const match = fileUrl.match(/id=([^&]+)/);
        if (!match) return;

        await fetch(`https://www.googleapis.com/drive/v3/files/${match[1]}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
        });
    }

    async test(): Promise<boolean> {
        try {
            const token = await this.ensureFreshToken();
            const res = await fetch(
                "https://www.googleapis.com/drive/v3/about?fields=user",
                { headers: { Authorization: `Bearer ${token}` } }
            );
            return res.ok;
        } catch {
            return false;
        }
    }
}
