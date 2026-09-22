import { NextResponse } from "next/server";
import { getApiDocs } from "@/lib/swagger";
import { getBrandConfig } from "@/lib/branding";

// next-swagger-doc scans source files with `fs`, so this MUST use the Node.js runtime
// (not Edge) and must not be statically cached during the build (force-dynamic).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const spec = getApiDocs() as { info: { title: string } } & Record<string, unknown>;
    const { appName } = await getBrandConfig();
    spec.info.title = `${appName} API Documentation`;
    return NextResponse.json(spec, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    // Do not let /swagger render blank if spec scanning fails in production.
    // Return a minimal valid spec with error information so the UI still renders.
    console.error("[api/docs] Failed to build OpenAPI spec:", err);
    const fallback = {
      openapi: "3.0.0",
      info: {
        title: "WA-AKG API Documentation",
        version: "1.2.0",
        description:
          "⚠️ Failed to load the complete specification on the server. Check the server log. " +
          "The endpoints still work; only the documentation display is affected.",
      },
      paths: {},
    };
    return NextResponse.json(fallback, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
