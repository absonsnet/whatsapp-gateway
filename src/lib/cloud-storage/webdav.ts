import { ICloudStorageProvider } from "./index";

interface WebDAVCredentials {
    url: string;        // e.g. "https://nextcloud.example.com/remote.php/dav/files/username"
    username: string;
    password: string;
    basePath?: string;  // e.g. "/WhatsApp-Media/"
    publicUrlBase?: string; // e.g. "https://nextcloud.example.com/s/{share}" — public share base URL
}

/**
 * WebDAV cloud storage provider using native fetch().
 * Compatible with Nextcloud, ownCloud, Apache HTTP Server, and any WebDAV server.
 */
export class WebDAVProvider implements ICloudStorageProvider {
    private creds: WebDAVCredentials;

    constructor(credentials: WebDAVCredentials) {
        this.creds = credentials;
    }

    private getAuthHeader(): string {
        const encoded = Buffer.from(`${this.creds.username}:${this.creds.password}`).toString("base64");
        return `Basic ${encoded}`;
    }

    private getFileUrl(filename: string): string {
        const base = this.creds.url.replace(/\/+$/, "");
        const path = this.creds.basePath
            ? `/${this.creds.basePath.replace(/^\/+|\/+$/g, "")}/${filename}`
            : `/${filename}`;
        return `${base}${path}`;
    }

    async upload(buffer: Buffer, filename: string, mimetype: string): Promise<string> {
        const fileUrl = this.getFileUrl(filename);

        // Ensure the directory exists (MKCOL)
        if (this.creds.basePath) {
            const dirUrl = this.getFileUrl("").replace(/\/+$/, "");
            await fetch(dirUrl, {
                method: "MKCOL",
                headers: { Authorization: this.getAuthHeader() },
            }).catch(() => {
                // Directory might already exist — ignore error
            });
        }

        // Upload via PUT
        const res = await fetch(fileUrl, {
            method: "PUT",
            headers: {
                Authorization: this.getAuthHeader(),
                "Content-Type": mimetype,
            },
            body: new Uint8Array(buffer),
        });

        if (!res.ok && res.status !== 201 && res.status !== 204) {
            const error = await res.text();
            throw new Error(`WebDAV upload failed: ${res.status} ${error}`);
        }

        // If a public URL base is configured, use that
        if (this.creds.publicUrlBase) {
            const base = this.creds.publicUrlBase.replace(/\/+$/, "");
            const path = this.creds.basePath
                ? `/${this.creds.basePath.replace(/^\/+|\/+$/g, "")}/${filename}`
                : `/${filename}`;
            return `${base}${path}`;
        }

        // Otherwise return the WebDAV URL itself (requires auth to access)
        return fileUrl;
    }

    async delete(fileUrl: string): Promise<void> {
        try {
            await fetch(fileUrl, {
                method: "DELETE",
                headers: { Authorization: this.getAuthHeader() },
            });
        } catch {
            // Best-effort delete
        }
    }

    async test(): Promise<boolean> {
        try {
            // PROPFIND on the base directory to check connectivity
            const base = this.creds.url.replace(/\/+$/, "");
            const testUrl = this.creds.basePath
                ? `${base}/${this.creds.basePath.replace(/^\/+|\/+$/g, "")}`
                : base;

            const res = await fetch(testUrl, {
                method: "PROPFIND",
                headers: {
                    Authorization: this.getAuthHeader(),
                    Depth: "0",
                },
            });

            // WebDAV PROPFIND returns 207 Multi-Status on success
            return res.status === 207 || res.ok;
        } catch {
            return false;
        }
    }
}
