// ============================================================
// PLAN & PRICING CONFIG (single source of truth)
// ------------------------------------------------------------
// Change values and prices here — the landing page, API limits,
// and checkout all use this configuration.
//
// Limit notes:
// - FREE: 1000 requests/month, 100 requests/day (as requested)
// - Others: RECOMMENDED, adjust as needed.
// - limit -1 = unlimited.
// ============================================================

export type PlanId = "FREE" | "STANDARD" | "PRO" | "ENTERPRISE";

// Features that can be toggled per plan. Used for access gating and
// automatically displayed as benefits on the pricing page.
export type Capability =
    | "autoReply"
    | "broadcast"
    | "autoBroadcast"
    | "scheduler"
    | "webhook"
    | "jpm"
    | "sticker";

export const CAPABILITIES: { id: Capability; label: string }[] = [
    { id: "autoReply", label: "Auto Reply" },
    { id: "broadcast", label: "Broadcast" },
    { id: "autoBroadcast", label: "Auto Broadcast" },
    { id: "scheduler", label: "Scheduler / Pesan Terjadwal" },
    { id: "webhook", label: "Webhook & API Events" },
    { id: "jpm", label: "JPM SW GC" },
    { id: "sticker", label: "Sticker Maker" },
];

export interface PlanConfig {
    id: PlanId;
    name: string;
    /** Monthly price in IDR. 0 = free, null = custom/contact sales */
    price: number | null;
    /** Subscription duration in days when purchased */
    durationDays: number;
    /** API request limit per day (-1 = unlimited) */
    dailyLimit: number;
    /** API request limit per month (-1 = unlimited) */
    monthlyLimit: number;
    /** Maximum WhatsApp sessions (-1 = unlimited) */
    maxSessions: number;
    /** Marked as "most popular" in the UI */
    highlight?: boolean;
    /** Features enabled per plan (gating + displayed as benefits) */
    capabilities: Record<Capability, boolean>;
    /** Additional benefits (free-form text) shown on pricing cards */
    features: string[];
}

export const PLANS: Record<PlanId, PlanConfig> = {
    FREE: {
        id: "FREE",
        name: "Free",
        price: 0,
        durationDays: 0, // never expires
        dailyLimit: 100,
        monthlyLimit: 1000,
        maxSessions: 1,
        capabilities: {
            autoReply: true,
            broadcast: false,
            autoBroadcast: false,
            scheduler: false,
            webhook: false,
            jpm: false,
            sticker: true,
        },
        features: [
            "1 WhatsApp session",
            "100 requests / day",
            "1,000 requests / month",
            "Basic auto-reply",
            "Akses REST API",
            "Community support"
        ]
    },
    STANDARD: {
        id: "STANDARD",
        name: "Standard",
        price: 50000, // recommended — adjust as needed
        durationDays: 30,
        dailyLimit: 1000,
        monthlyLimit: 20000,
        maxSessions: 3,
        highlight: true,
        capabilities: {
            autoReply: true,
            broadcast: true,
            autoBroadcast: false,
            scheduler: true,
            webhook: true,
            jpm: false,
            sticker: true,
        },
        features: [
            "3 WhatsApp sessions",
            "1,000 requests / day",
            "20,000 requests / month",
            "Auto-reply + scheduler",
            "Webhook events",
            "Email support"
        ]
    },
    PRO: {
        id: "PRO",
        name: "Pro",
        price: 150000, // recommended — adjust as needed
        durationDays: 30,
        dailyLimit: 5000,
        monthlyLimit: 100000,
        maxSessions: 10,
        capabilities: {
            autoReply: true,
            broadcast: true,
            autoBroadcast: true,
            scheduler: true,
            webhook: true,
            jpm: true,
            sticker: true,
        },
        features: [
            "10 WhatsApp sessions",
            "5,000 requests / day",
            "100,000 requests / month",
            "All Standard features",
            "Auto broadcast",
            "Priority support"
        ]
    },
    ENTERPRISE: {
        id: "ENTERPRISE",
        name: "Enterprise",
        price: null, // custom / contact sales
        durationDays: 30,
        dailyLimit: -1,
        monthlyLimit: -1,
        maxSessions: -1,
        capabilities: {
            autoReply: true,
            broadcast: true,
            autoBroadcast: true,
            scheduler: true,
            webhook: true,
            jpm: true,
            sticker: true,
        },
        features: [
            "Unlimited WhatsApp sessions",
            "Unlimited requests",
            "All Pro features",
            "SLA & dedicated server",
            "Custom onboarding",
            "Dedicated support"
        ]
    }
};

export const PLAN_ORDER: PlanId[] = ["FREE", "STANDARD", "PRO", "ENTERPRISE"];

export function getPlanConfig(plan: string | null | undefined): PlanConfig {
    const id = (plan || "FREE").toUpperCase() as PlanId;
    return PLANS[id] || PLANS.FREE;
}

/** Check whether a plan allows a capability. */
export function planAllows(cfg: PlanConfig, cap: Capability): boolean {
    return cfg?.capabilities?.[cap] !== false;
}

/**
 * Effective plan: paid subscriptions automatically become FREE
 * after their active period expires.
 */
export function effectivePlan(user: {
    plan?: string | null;
    planExpiresAt?: Date | string | null;
}): PlanId {
    const plan = (user.plan || "FREE").toUpperCase() as PlanId;
    if (plan === "FREE" || !PLANS[plan]) return "FREE";

    // FREE has no expiry; paid plans are checked by date.
    if (user.planExpiresAt) {
        const exp = new Date(user.planExpiresAt).getTime();
        if (!Number.isNaN(exp) && exp < Date.now()) return "FREE";
    }
    return plan;
}

export function formatIDR(amount: number | null): string {
    if (amount === null) return "Custom";
    if (amount === 0) return "Gratis";
    return "Rp" + amount.toLocaleString("id-ID");
}
