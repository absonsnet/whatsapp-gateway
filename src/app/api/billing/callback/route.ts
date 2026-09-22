import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyCallbackSignature, parseCallback } from "@/lib/klikqris";
import { markPaymentPaidAndActivate } from "@/lib/billing";
import { logger } from "@/lib/logger";

// POST /api/billing/callback
// Webhook from KlikQRIS. Register this URL in the KlikQRIS dashboard:
//   https://rifalos.shop/api/billing/callback
//
// Validate according to the documentation: compare the `signature` in the callback
// payload with the `signature` stored when the transaction was created (Payment.signature).
// Always return HTTP 200 OK so the gateway does not retry indefinitely.
export async function POST(request: NextRequest) {
    const rawBody = await request.text();

    let body: any;
    try {
        body = JSON.parse(rawBody);
    } catch {
        return NextResponse.json({ status: false, message: "Invalid JSON" }, { status: 400 });
    }

    const { orderId, status, signature } = parseCallback(body);
    if (!orderId) {
        return NextResponse.json({ status: false, message: "Missing order_id" }, { status: 400 });
    }

    // The order_id we send is Payment.id; reference is also set to order_id.
    const payment = await prisma.payment.findFirst({
        where: { OR: [{ id: orderId }, { reference: orderId }] }
    });

    if (!payment) {
        logger.warn("Billing", `Callback for unknown order_id: ${orderId}`);
        // Return 200 so the gateway stops retrying invalid data.
        return NextResponse.json({ status: true, message: "Ignored (unknown order)" });
    }

    // Validate the signature against the value stored during creation.
    if (!verifyCallbackSignature(signature, payment.signature)) {
        logger.warn("Billing", `Callback signature mismatch for ${orderId} — rejected`);
        return NextResponse.json({ status: false, message: "Invalid signature" }, { status: 401 });
    }

    try {
        if (status === "PAID") {
            // Idempotent: markPaymentPaidAndActivate skips an already-PAID payment.
            await markPaymentPaidAndActivate(payment.id);
        } else if (status === "EXPIRED" || status === "FAILED" || status === "CANCELLED") {
            if (payment.status !== "PAID") {
                await prisma.payment.update({ where: { id: payment.id }, data: { status } });
            }
        }
    } catch (e) {
        logger.error("Billing", "Failed to process callback:", e);
        return NextResponse.json({ status: false, message: "Processing error" }, { status: 500 });
    }

    return NextResponse.json({ status: true, message: "OK" });
}
