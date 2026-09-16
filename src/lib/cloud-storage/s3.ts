import { ICloudStorageProvider } from "./index";
import { S3Client, PutObjectCommand, DeleteObjectCommand, HeadBucketCommand } from "@aws-sdk/client-s3";

interface S3Credentials {
    accessKeyId: string;
    secretAccessKey: string;
    region: string;
    bucket: string;
    prefix?: string;       // e.g. "whatsapp-media/"
    endpoint?: string;     // Custom endpoint for S3-compatible services (MinIO, DigitalOcean Spaces, etc.)
    forcePathStyle?: boolean;
    customDomain?: string; // e.g. "cdn.example.com" — used for public URL
}

/**
 * AWS S3 (and S3-compatible) cloud storage provider.
 */
export class S3Provider implements ICloudStorageProvider {
    private client: S3Client;
    private creds: S3Credentials;

    constructor(credentials: S3Credentials) {
        this.creds = credentials;

        const clientConfig: any = {
            region: credentials.region || "us-east-1",
            credentials: {
                accessKeyId: credentials.accessKeyId,
                secretAccessKey: credentials.secretAccessKey,
            },
        };

        if (credentials.endpoint) {
            clientConfig.endpoint = credentials.endpoint;
        }

        if (credentials.forcePathStyle) {
            clientConfig.forcePathStyle = true;
        }

        this.client = new S3Client(clientConfig);
    }

    private getKey(filename: string): string {
        const prefix = this.creds.prefix ? this.creds.prefix.replace(/\/+$/, "") + "/" : "";
        return `${prefix}${filename}`;
    }

    async upload(buffer: Buffer, filename: string, mimetype: string): Promise<string> {
        const key = this.getKey(filename);

        await this.client.send(
            new PutObjectCommand({
                Bucket: this.creds.bucket,
                Key: key,
                Body: buffer,
                ContentType: mimetype,
                ACL: "public-read",
            })
        );

        // Build URL
        if (this.creds.customDomain) {
            return `https://${this.creds.customDomain}/${key}`;
        }

        if (this.creds.endpoint) {
            // S3-compatible endpoint
            const base = this.creds.endpoint.replace(/\/$/, "");
            return `${base}/${this.creds.bucket}/${key}`;
        }

        // Standard AWS S3 URL
        return `https://${this.creds.bucket}.s3.${this.creds.region}.amazonaws.com/${key}`;
    }

    async delete(fileUrl: string): Promise<void> {
        // Extract key from URL
        const urlObj = new URL(fileUrl);
        let key = urlObj.pathname.replace(/^\//, "");

        // Remove bucket prefix if present in path-style URL
        if (key.startsWith(this.creds.bucket + "/")) {
            key = key.substring(this.creds.bucket.length + 1);
        }

        await this.client.send(
            new DeleteObjectCommand({
                Bucket: this.creds.bucket,
                Key: key,
            })
        );
    }

    async test(): Promise<boolean> {
        try {
            await this.client.send(
                new HeadBucketCommand({ Bucket: this.creds.bucket })
            );
            return true;
        } catch {
            return false;
        }
    }
}
