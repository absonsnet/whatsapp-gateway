import { prisma } from "./prisma";
import { logger } from "./logger";

// ============================================================
// KLIKQRIS PAYMENT CLIENT
// ------------------------------------------------------------
// According to the official documentation: https://klikqris.com/dokumentasi-api
//
// Credentials are read from the database (SystemConfig) and can only be managed
// by SUPERADMIN. If the database is empty, fall back to ENV for compatibility.
//
// Required headers for every request:
//   x-api-key:   <API_KEY>
//   id_merchant: <MERCHANT_ID>
//
// Endpoint:
//   POST {BASE}/qris/create            -> buat tagihan QRIS
//   GET  {BASE}/qris/status/{order_id} -> cek status
// ============================================================

export type NormalizedStatus = "PENDING" | "PAID" | "EXPIRED" | "FAILED" | "CANCELLED";

interface KlikQrisConfig {
    baseUrl: string;
    apiKey: string;
    merchantId: string;
    enabled: boolean;
}

/**
 * Get KlikQRIS configuration: prefer the database (managed by admin), then ENV.
 */
export async function getKlikQrisConfig(): Promise<KlikQrisConfig> {
    let baseUrl = process.env.KLIKQRIS_BASE_URL || "https://klikqris.com/api";
    let apiKey = process.env.KLIKQRIS_API_KEY || "";
    let merchantId = process.env.KLIKQRIS_MERCHANT_ID || "";
    let enabled = false;

    try {
        const cfg = await prisma.systemConfig.findUnique({ where: { id: "default" } });
        if (cfg) {
            if (cfg.klikqrisBaseUrl) baseUrl = cfg.klikqrisBaseUrl;
            if (cfg.klikqrisApiKey) apiKey = cfg.klikqrisApiKey;
            if (cfg.klikqrisMerchantId) merchantId = cfg.klikqrisMerchantId;
            enabled = Boolean(cfg.klikqrisEnabled);
        }
    } catch (e) {
        logger.warn("KlikQRIS", "Failed to read config from the database; using ENV:", e);
    }

    // When using ENV without a database config, consider it enabled when key and merchant are set.
    if (!enabled && apiKey && merchantId && !process.env.KLIKQRIS_FORCE_DB) {
        enabled = true;
    }

    return { baseUrl: baseUrl.replace(/\/$/, ""), apiKey, merchantId, enabled };
}

export async function isKlikQrisConfigured(): Promise<boolean> {
    const c = await getKlikQrisConfig();
    return Boolean(c.enabled && c.apiKey && c.merchantId);
}

export interface CreateQrisInput {
    amount: number; // IDR (nominal dasar / harga plan)
    orderId: string; // our unique ID (Payment.id) -> sent as order_id
    description?: string;
}

export interface CreateQrisResult {
    reference: string; // order_id (echo)
    qrImageUrl: string | null; // qris_url atau data-uri qris_image
    totalAmount: number | null; // total_amount = nominal akhir yg ditagih
    signature: string | null; // used to validate the webhook
    expiresAt: Date | null;
    raw: any;
}

function toInt(v: any): number | null {
    if (v === undefined || v === null) return null;
    const n = Math.round(Number(v));
    return Number.isNaN(n) ? null : n;
}

function parseKlikDate(s: any): Date | null {
    if (!s) return null;
    // format "2026-06-14 10:51:50" -> anggap waktu lokal server, treat as ISO-ish
    const iso = String(s).replace(" ", "T");
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Buat transaksi QRIS baru.
 */
export async function createQrisTransaction(input: CreateQrisInput): Promise<CreateQrisResult> {
    const cfg = await getKlikQrisConfig();
    if (!cfg.apiKey || !cfg.merchantId) {
        throw new Error("KlikQRIS is not configured (API key / merchant ID is empty)");
    }

    const url = `${cfg.baseUrl}/qris/create`;
    const payload = {
        order_id: input.orderId,
        id_merchant: cfg.merchantId,
        amount: Math.round(input.amount),
        keterangan: input.description || "Upgrade plan"
    };

    let json: any;
    try {
        const res = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": cfg.apiKey,
                id_merchant: cfg.merchantId
            },
            body: JSON.stringify(payload),
            cache: "no-store"
        });
        const text = await res.text();
        try {
            json = JSON.parse(text);
        } catch {
            json = { _raw: text };
        }
        if (!res.ok || json?.status === false) {
            const msg = json?.message || `HTTP ${res.status}`;
            logger.error("KlikQRIS", `Create failed: ${msg} | ${text.slice(0, 300)}`);
            throw new Error(`KlikQRIS: ${msg}`);
        }
    } catch (e: any) {
        logger.error("KlikQRIS", "Create transaction error:", e);
        throw new Error(e?.message || "Failed to contact KlikQRIS");
    }

    const data = json?.data || {};

    return {
        reference: String(data.order_id || input.orderId),
        // Utamakan gambar base64 (qris_image), fallback ke url file (qris_url)
        qrImageUrl: data.qris_image || data.qris_url || null,
        totalAmount: toInt(data.total_amount),
        signature: data.signature ? String(data.signature) : null,
        expiresAt: parseKlikDate(data.expired_at),
        raw: json
    };
}

/**
 * Normalisasi status KlikQRIS -> status internal.
 * (the status endpoint uses "SUCCESS"; the webhook uses "PAID")
 */
export function normalizeStatus(raw: string | undefined | null): NormalizedStatus {
    const s = String(raw || "").toUpperCase();
    if (["PAID", "SUCCESS", "SETTLED", "COMPLETED"].includes(s)) return "PAID";
    if (["EXPIRED", "EXPIRE", "TIMEOUT"].includes(s)) return "EXPIRED";
    if (["CANCELLED", "CANCELED", "VOID"].includes(s)) return "CANCELLED";
    if (["FAILED", "FAILURE", "DECLINED", "REJECTED"].includes(s)) return "FAILED";
    return "PENDING";
}

/**
 * Cek status transaksi (GET /qris/status/{order_id}).
 */
export async function checkQrisStatus(orderId: string): Promise<{ status: NormalizedStatus; raw: any }> {
    const cfg = await getKlikQrisConfig();
    if (!cfg.apiKey || !cfg.merchantId) {
        throw new Error("KlikQRIS is not configured");
    }

    const url = `${cfg.baseUrl}/qris/status/${encodeURIComponent(orderId)}`;
    let json: any;
    try {
        const res = await fetch(url, {
            method: "GET",
            headers: {
                "x-api-key": cfg.apiKey,
                id_merchant: cfg.merchantId
            },
            cache: "no-store"
        });
        const text = await res.text();
        try {
            json = JSON.parse(text);
        } catch {
            json = { _raw: text };
        }
    } catch (e: any) {
        logger.error("KlikQRIS", "Status check error:", e);
        throw new Error(e?.message || "Failed to check KlikQRIS status");
    }

    const statusRaw = json?.data?.status ?? json?.status;
    return { status: normalizeStatus(statusRaw), raw: json };
}

/**
 * Validasi webhook KlikQRIS.
 * According to the documentation: compare the `signature` in the callback
 * payload with the `signature` received during creation (stored in Payment.signature).
 */
export function verifyCallbackSignature(payloadSignature: string | null | undefined, storedSignature: string | null | undefined): boolean {
    if (!storedSignature || !payloadSignature) return false;
    // bandingkan aman (constant-time sederhana)
    const a = String(payloadSignature);
    const b = String(storedSignature);
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

/**
 * Ambil { orderId, status, signature } dari payload callback.
 */
export function parseCallback(body: any): {
    orderId: string | null;
    status: NormalizedStatus;
    signature: string | null;
} {
    return {
        orderId: body?.order_id ? String(body.order_id) : null,
        status: normalizeStatus(body?.status),
        signature: body?.signature ? String(body.signature) : null
    };
}
