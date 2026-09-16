import { ICloudStorageProvider } from "./index";
import crypto from "crypto";

interface CloudinaryCredentials {
    cloudName: string;
    apiKey: string;
    apiSecret: string;
    folder?: string; // e.g. "whatsapp-media"
}

/**
 * Cloudinary cloud storage provider using the Upload API (REST).
 * No SDK dependency — uses native fetch().
 */
export class CloudinaryProvider implements ICloudStorageProvider {
    private creds: CloudinaryCredentials;

    constructor(credentials: CloudinaryCredentials) {
        this.creds = credentials;
    }

    async upload(buffer: Buffer, filename: string, mimetype: string): Promise<string> {
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const publicId = filename.replace(/\.[^.]+$/, ""); // Remove extension
        const folder = this.creds.folder || "whatsapp-media";

        // Determine resource_type based on mimetype
        let resourceType = "auto";
        if (mimetype.startsWith("image/")) resourceType = "image";
        else if (mimetype.startsWith("video/")) resourceType = "video";
        else resourceType = "raw"; // documents, audio, etc.

        // Build signature (alphabetical order of params)
        const signParams = `folder=${folder}&public_id=${publicId}&timestamp=${timestamp}`;
        const signature = crypto
            .createHash("sha1")
            .update(signParams + this.creds.apiSecret)
            .digest("hex");

        // Use FormData with the upload API
        const formData = new FormData();
        formData.append("file", new Blob([buffer], { type: mimetype }), filename);
        formData.append("api_key", this.creds.apiKey);
        formData.append("timestamp", timestamp);
        formData.append("signature", signature);
        formData.append("public_id", publicId);
        formData.append("folder", folder);

        const res = await fetch(
            `https://api.cloudinary.com/v1_1/${this.creds.cloudName}/${resourceType}/upload`,
            {
                method: "POST",
                body: formData,
            }
        );

        if (!res.ok) {
            const error = await res.text();
            throw new Error(`Cloudinary upload failed: ${res.status} ${error}`);
        }

        const data = await res.json();
        return data.secure_url;
    }

    async delete(fileUrl: string): Promise<void> {
        // Extract public_id from URL
        // URL format: https://res.cloudinary.com/{cloudName}/{type}/upload/v{version}/{folder}/{publicId}.{ext}
        try {
            const urlObj = new URL(fileUrl);
            const pathParts = urlObj.pathname.split("/upload/");
            if (pathParts.length < 2) return;

            let publicId = pathParts[1]
                .replace(/^v\d+\//, "") // Remove version
                .replace(/\.[^.]+$/, ""); // Remove extension

            const timestamp = Math.floor(Date.now() / 1000).toString();
            const signParams = `public_id=${publicId}&timestamp=${timestamp}`;
            const signature = crypto
                .createHash("sha1")
                .update(signParams + this.creds.apiSecret)
                .digest("hex");

            await fetch(
                `https://api.cloudinary.com/v1_1/${this.creds.cloudName}/image/destroy`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        public_id: publicId,
                        api_key: this.creds.apiKey,
                        timestamp,
                        signature,
                    }),
                }
            );
        } catch {
            // Best-effort delete
        }
    }

    async test(): Promise<boolean> {
        try {
            // Use the ping endpoint (resource listing with small limit)
            const timestamp = Math.floor(Date.now() / 1000).toString();
            const signParams = `timestamp=${timestamp}`;
            const signature = crypto
                .createHash("sha1")
                .update(signParams + this.creds.apiSecret)
                .digest("hex");

            const res = await fetch(
                `https://api.cloudinary.com/v1_1/${this.creds.cloudName}/resources/image?max_results=1&timestamp=${timestamp}&api_key=${this.creds.apiKey}&signature=${signature}`,
                { method: "GET" }
            );
            return res.ok;
        } catch {
            return false;
        }
    }
}
