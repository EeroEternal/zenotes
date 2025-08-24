import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { getServerImagesDir } from "@/lib/server-settings";

export async function GET(
  _req: NextRequest,
  { params }: { params: { name: string } }
) {
  try {
    const imagesDir = getServerImagesDir();
    const filePath = path.join(imagesDir, params.name);

    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();

    const mimeMap: Record<string, string> = {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".svg": "image/svg+xml",
      ".bmp": "image/bmp",
      ".ico": "image/x-icon",
    };

    const contentType = mimeMap[ext] || "application/octet-stream";
    return new NextResponse(data, { headers: { "Content-Type": contentType } });
  } catch (e) {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }
}

