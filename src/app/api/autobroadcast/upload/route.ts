import { NextResponse, NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";

export const runtime = "nodejs";

// Auto-broadcast media is returned as a DATA URI (base64), not a file.
// It is stored in the database (mediaUrl column) so it does NOT disappear after
// a container restart (ephemeral filesystem, for example Railway without a volume).
// The data URI is decoded back into a buffer when the broadcast is sent.
export async function POST(request: NextRequest) {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ status: false, message: "Unauthorized" }, { status: 401 });

    try {
        const formData = await request.formData();
        const file = formData.get("file") as File;

        if (!file) {
            return NextResponse.json({ status: false, message: "No file provided" }, { status: 400 });
        }

        // Validate file type
        const allowedTypes = ["image/jpeg", "image/png", "image/webp", "video/mp4"];
        if (!allowedTypes.includes(file.type)) {
            return NextResponse.json({ status: false, message: "Only JPG, PNG, WebP, and MP4 allowed" }, { status: 400 });
        }

        // Validate file size. Data URIs are stored in the database, so keep them smaller (4MB)
        // to avoid database/loading overhead. Large videos should use an external URL.
        const MAX = 4 * 1024 * 1024;
        if (file.size > MAX) {
            return NextResponse.json(
                { status: false, message: "File is too large (maximum 4MB for stored media). For larger files, use an external media URL." },
                { status: 400 }
            );
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const dataUri = `data:${file.type};base64,${buffer.toString("base64")}`;
        const type = file.type.startsWith("image") ? "image" : "video";

        return NextResponse.json({
            status: true,
            message: "File uploaded",
            // url = data URI (stored in the database). filename is display-only.
            data: { url: dataUri, filename: file.name, type }
        });
    } catch (error) {
        console.error("Upload error:", error);
        return NextResponse.json({ status: false, message: "Upload failed" }, { status: 500 });
    }
}
