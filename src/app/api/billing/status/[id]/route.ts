import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { checkQrisStatus } from "@/lib/klikqris";
import { markPaymentPaidAndActivate } from "@/lib/billing";
import { logger } from "@/lib/logger";

// GET /api/billing/status/[id] — cek status pembayaran (polling dari UI).
// In addition to reading the database, confirm with KlikQRIS so late callbacks are handled.
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const user = await getAuthenticatedUser(request);
    if (!user) {
        return NextResponse.json(
            { status: false, message: "Unauthorized", error: "Unauthorized" },
            { status: 401 }
        );
    }

    const { id } = await params;
    const payment = await prisma.payment.findUnique({ where: { id } });

    if (!payment || (payment.userId !== user.id && user.role !== "SUPERADMIN")) {
        return NextResponse.json(
            { status: false, message: "Payment not found", error: "not_found" },
            { status: 404 }
        );
    }

    // If still pending and a reference exists, confirm with the gateway.
    if (payment.status === "PENDING" && payment.reference) {
        try {
            const { status } = await checkQrisStatus(payment.reference);
            if (status === "PAID") {
                await markPaymentPaidAndActivate(payment.id);
            } else if (status === "EXPIRED" || status === "FAILED" || status === "CANCELLED") {
                await prisma.payment.update({ where: { id: payment.id }, data: { status } });
            }
        } catch (e) {
            logger.warn("Billing", `Status polling failed for ${payment.id}`, e);
        }
    }

    const fresh = await prisma.payment.findUnique({ where: { id } });
    return NextResponse.json({
        status: true,
        data: {
            paymentId: fresh!.id,
            plan: fresh!.plan,
            amount: fresh!.amount,
            paymentStatus: fresh!.status,
            paidAt: fresh!.paidAt,
            expiresAt: fresh!.expiresAt
        }
    });
}
