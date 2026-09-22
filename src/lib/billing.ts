import { prisma } from "./prisma";
import { getPlanConfig } from "./plans";
import { logger } from "./logger";

/**
 * Mark a Payment as PAID and activate the user's plan.
 * Idempotent: do nothing if the payment is already PAID.
 *
 * Active-period extension:
 * - if the user's plan is still active (planExpiresAt > now), add duration
 *   to the remaining active period (extend).
 * - if it has expired or does not exist, calculate from now.
 */
export async function markPaymentPaidAndActivate(paymentId: string): Promise<boolean> {
    return prisma.$transaction(async (tx) => {
        const payment = await tx.payment.findUnique({ where: { id: paymentId } });
        if (!payment) {
            logger.warn("Billing", `Payment ${paymentId} not found`);
            return false;
        }
        if (payment.status === "PAID") {
            return true; // idempotent
        }

        const cfg = getPlanConfig(payment.plan);
        const durationDays = payment.durationDays || cfg.durationDays || 30;

        const user = await tx.user.findUnique({ where: { id: payment.userId } });
        const now = new Date();

        let base = now;
        if (
            user?.plan === payment.plan &&
            user?.planExpiresAt &&
            new Date(user.planExpiresAt).getTime() > now.getTime()
        ) {
            base = new Date(user.planExpiresAt); // extend from the remaining active period
        }

        const newExpiry = new Date(base.getTime() + durationDays * 24 * 60 * 60 * 1000);

        await tx.payment.update({
            where: { id: payment.id },
            data: { status: "PAID", paidAt: now }
        });

        await tx.user.update({
            where: { id: payment.userId },
            data: { plan: payment.plan, planExpiresAt: newExpiry }
        });

        // In-app notification
        await tx.notification.create({
            data: {
                userId: payment.userId,
                title: `Plan ${cfg.name} activated 🎉`,
                message: `Payment successful. Plan ${cfg.name} is active until ${newExpiry.toLocaleString("id-ID")}.`,
                type: "SUCCESS",
                href: "/dashboard/billing"
            }
        }).catch(() => {});

        logger.success("Billing", `Plan ${payment.plan} activated for user ${payment.userId} until ${newExpiry.toISOString()}`);
        return true;
    });
}
