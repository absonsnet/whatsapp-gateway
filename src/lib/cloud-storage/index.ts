import { prisma } from "@/lib/prisma";
import { decryptJson } from "@/lib/crypto";
import { logger } from "@/lib/logger";
import { GoogleDriveProvider } from "./google-drive";
import { S3Provider } from "./s3";
import { CloudinaryProvider } from "./cloudinary";
import { WebDAVProvider } from "./webdav";

/**
 * Interface that all cloud storage providers must implement.
 */
export interface ICloudStorageProvider {
    /**
     * Upload a buffer to cloud storage.
     * @returns The public/accessible URL of the uploaded file.
     */
    upload(buffer: Buffer, filename: string, mimetype: string): Promise<string>;

    /**
     * Delete a file from cloud storage by its URL.
     */
    delete(fileUrl: string): Promise<void>;

    /**
     * Test connectivity / credentials.
     * @returns true if the connection is successful.
     */
    test(): Promise<boolean>;
}

/**
 * Create a provider instance from decrypted credentials and provider type.
 */
export function createProvider(
    providerType: string,
    credentials: any,
    configId?: string
): ICloudStorageProvider {
    switch (providerType) {
        case "GOOGLE_DRIVE":
            return new GoogleDriveProvider(credentials, configId);
        case "AWS_S3":
            return new S3Provider(credentials);
        case "CLOUDINARY":
            return new CloudinaryProvider(credentials);
        case "WEBDAV":
            return new WebDAVProvider(credentials);
        default:
            throw new Error(`Unknown cloud storage provider: ${providerType}`);
    }
}

/**
 * Resolve the storage strategy for a given user.
 *
 * Returns:
 * - mode: 'cloud'  → user has an active cloud config, use the provider
 * - mode: 'local'  → Super Admin allows local disk storage for this user
 * - mode: 'none'   → no storage available; gracefully skip media saving
 */
export async function resolveStorageForUser(userId: string): Promise<{
    mode: "cloud" | "local" | "none";
    provider?: ICloudStorageProvider;
    reason?: string;
}> {
    try {
        // 1. Check for an active cloud storage config
        const cloudConfig = await prisma.cloudStorageConfig.findFirst({
            where: { userId, isActive: true },
            orderBy: { updatedAt: "desc" }, // most recently updated = preferred
        });

        if (cloudConfig) {
            try {
                const credentials = decryptJson(cloudConfig.credentials);
                const provider = createProvider(
                    cloudConfig.provider,
                    credentials,
                    cloudConfig.id
                );
                return { mode: "cloud", provider };
            } catch (e) {
                logger.error(
                    "CloudStorage",
                    `Failed to initialize ${cloudConfig.provider} for user ${userId}:`,
                    e
                );
                // Fall through to check local storage
            }
        }

        // 2. Check Super Admin local storage policy
        const systemConfig = await prisma.systemConfig.findUnique({
            where: { id: "default" },
        });

        if (systemConfig) {
            // Per-user override
            const perUser = systemConfig.allowLocalStorageFor as string[] | null;
            if (Array.isArray(perUser) && perUser.includes(userId)) {
                return { mode: "local" };
            }

            // Global toggle
            if (systemConfig.allowLocalStorage) {
                return { mode: "local" };
            }
        }

        // 3. No storage available
        return {
            mode: "none",
            reason: "Cloud storage not configured and local storage is disabled by admin",
        };
    } catch (e) {
        logger.error("CloudStorage", "Error resolving storage for user:", e);
        return {
            mode: "none",
            reason: "Error resolving storage configuration",
        };
    }
}
