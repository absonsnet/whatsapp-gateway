import { NextResponse } from "next/server";
import { PLAN_ORDER } from "@/lib/plans";
import { getMergedPlans } from "@/lib/plans-store";

export const dynamic = "force-dynamic";

// Public: plans, prices, and limits (including SUPERADMIN database overrides).
// Used by the landing and pricing pages.
export async function GET() {
    const all = await getMergedPlans();
    const plans = PLAN_ORDER.map((id) => all[id]);
    return NextResponse.json({ status: true, data: plans });
}
