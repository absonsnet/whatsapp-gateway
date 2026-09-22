import { NextRequest, NextResponse } from "next/server";
import { prisma } from "./prisma";
import { getAuthenticatedUser } from "./api-auth";
import { effectivePlan, getPlanConfig, planAllows, type Capability, type PlanId } from "./plans";
import { getMergedPlan } from "./plans-store";
import { logger } from "./logger";

/**
 * Day and month dates in the Asia/Jakarta timezone.
 * en-CA menghasilkan format YYYY-MM-DD.
 */
function jakartaParts(d = new Date()): { day: string; month: string } {
    const day = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Jakarta",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).format(d);
    return { day, month: day.slice(0, 7) };
}

export interface UsageInfo {
    plan: PlanId;
    dayCount: number;
    monthCount: number;
    dailyLimit: number;
    monthlyLimit: number;
    dailyRemaining: number;
    monthlyRemaining: number;
}

function remaining(limit: number, used: number): number {
    if (limit < 0) return -1; // unlimited
    return Math.max(0, limit - used);
}

/**
 * Read current usage (without incrementing the counter).
 */
export async function getUsage(userId: string, plan: PlanId): Promise<UsageInfo> {
    const { day, month } = jakartaParts();
    const cfg = await getMergedPlan(plan);

    const [today, monthAgg] = await Promise.all([
        prisma.apiUsage.findUnique({ where: { userId_day: { userId, day } } }),
        prisma.apiUsage.aggregate({ _sum: { count: true }, where: { userId, month } })
    ]);

    const dayCount = today?.count ?? 0;
    const monthCount = monthAgg._sum.count ?? 0;

    return {
        plan,
        dayCount,
        monthCount,
        dailyLimit: cfg.dailyLimit,
        monthlyLimit: cfg.monthlyLimit,
        dailyRemaining: remaining(cfg.dailyLimit, dayCount),
        monthlyRemaining: remaining(cfg.monthlyLimit, monthCount)
    };
}

export interface ConsumeResult {
    allowed: boolean;
    scope?: "day" | "month";
    usage: UsageInfo;
}

/**
 * Check the limit, then increment the counter by 1 if allowed.
 * (There is a small race between check and increment, acceptable for this use case.)
 */
export async function consumeQuota(userId: string, plan: PlanId): Promise<ConsumeResult> {
    const { day, month } = jakartaParts();
    const cfg = await getMergedPlan(plan);
    const usage = await getUsage(userId, plan);

    if (cfg.dailyLimit >= 0 && usage.dayCount >= cfg.dailyLimit) {
        return { allowed: false, scope: "day", usage };
    }
    if (cfg.monthlyLimit >= 0 && usage.monthCount >= cfg.monthlyLimit) {
        return { allowed: false, scope: "month", usage };
    }

    await prisma.apiUsage.upsert({
        where: { userId_day: { userId, day } },
        create: { userId, day, month, count: 1 },
        update: { count: { increment: 1 } }
    });

    const next: UsageInfo = {
        ...usage,
        dayCount: usage.dayCount + 1,
        monthCount: usage.monthCount + 1,
        dailyRemaining: remaining(cfg.dailyLimit, usage.dayCount + 1),
        monthlyRemaining: remaining(cfg.monthlyLimit, usage.monthCount + 1)
    };

    return { allowed: true, usage: next };
}

type EnforceResult =
    | { user: NonNullable<Awaited<ReturnType<typeof getAuthenticatedUser>>>; usage: UsageInfo; error?: undefined }
    | { error: NextResponse; user?: undefined; usage?: undefined };

/**
 * Main helper for use in API routes:
 *   const gate = await enforceApiQuota(request);
 *   if (gate.error) return gate.error;
 *   const { user } = gate;
 *
 * Melakukan: autentikasi → cek plan efektif → konsumsi 1 quota.
 * Returns 401 when unauthenticated and 429 when the limit is exhausted.
 */
export async function enforceApiQuota(request: NextRequest, capability?: Capability): Promise<EnforceResult> {
    const user = await getAuthenticatedUser(request);
    if (!user) {
        return {
            error: NextResponse.json(
                { status: false, message: "Unauthorized", error: "Unauthorized" },
                { status: 401 }
            )
        };
    }

    // SUPERADMIN: unlimited plan — bypass quota and capability gating entirely.
    if ((user as any).role === "SUPERADMIN") {
        return {
            user,
            usage: {
                plan: "ENTERPRISE",
                dayCount: 0,
                monthCount: 0,
                dailyLimit: -1,
                monthlyLimit: -1,
                dailyRemaining: -1,
                monthlyRemaining: -1
            }
        };
    }

    const plan = effectivePlan(user as any);

    // Capability gating: reject when the feature is disabled on the user's plan.
    if (capability) {
        const cfg = await getMergedPlan(plan);
        if (!planAllows(cfg, capability)) {
            return {
                error: NextResponse.json(
                    {
                        status: false,
                        message: `This feature is not available on the ${plan} plan. Upgrade your plan to access it.`,
                        error: "feature_not_in_plan",
                        data: { plan, capability }
                    },
                    { status: 403 }
                )
            };
        }
    }

    try {
        const result = await consumeQuota(user.id, plan);
        if (!result.allowed) {
            const scopeLabel = result.scope === "day" ? "daily" : "monthly";
            return {
                error: NextResponse.json(
                    {
                        status: false,
                        message: `${scopeLabel} limit for the ${plan} plan has been reached. Upgrade your plan for more quota.`,
                        error: "rate_limited",
                        data: {
                            plan,
                            scope: result.scope,
                            usage: result.usage
                        }
                    },
                    {
                        status: 429,
                        headers: {
                            "X-RateLimit-Limit-Day": String(result.usage.dailyLimit),
                            "X-RateLimit-Limit-Month": String(result.usage.monthlyLimit),
                            "X-RateLimit-Remaining-Day": String(result.usage.dailyRemaining),
                            "X-RateLimit-Remaining-Month": String(result.usage.monthlyRemaining)
                        }
                    }
                )
            };
        }
        return { user, usage: result.usage };
    } catch (e) {
        // If usage recording fails, do not block the request (fail open),
        // tapi tetap log biar ketahuan.
        logger.error("RateLimit", "Failed to consume quota:", e);
        return { user, usage: await getUsage(user.id, plan).catch(() => ({
            plan,
            dayCount: 0,
            monthCount: 0,
            dailyLimit: getPlanConfig(plan).dailyLimit,
            monthlyLimit: getPlanConfig(plan).monthlyLimit,
            dailyRemaining: -1,
            monthlyRemaining: -1
        } as UsageInfo)) };
    }
}


/**
 * Cek auth + kapabilitas plan TANPA mengonsumsi kuota.
 * For configuration endpoints (webhooks, scheduler, auto-reply, etc.):
 *   const gate = await enforceCapability(request, "webhook");
 *   if (gate.error) return gate.error;
 *   const { user } = gate;
 */
export async function enforceCapability(
    request: NextRequest,
    capability: Capability
): Promise<
    | { user: NonNullable<Awaited<ReturnType<typeof getAuthenticatedUser>>>; error?: undefined }
    | { error: NextResponse; user?: undefined }
> {
    const user = await getAuthenticatedUser(request);
    if (!user) {
        return {
            error: NextResponse.json(
                { status: false, message: "Unauthorized", error: "Unauthorized" },
                { status: 401 }
            )
        };
    }
    if ((user as any).role === "SUPERADMIN") return { user };

    const plan = effectivePlan(user as any);
    const cfg = await getMergedPlan(plan);
    if (!planAllows(cfg, capability)) {
        return {
            error: NextResponse.json(
                {
                    status: false,
                    message: `This feature is not available on the ${plan} plan. Upgrade your plan to access it.`,
                    error: "feature_not_in_plan",
                    data: { plan, capability }
                },
                { status: 403 }
            )
        };
    }
    return { user };
}
