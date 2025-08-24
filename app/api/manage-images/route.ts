import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { getServerImagesDir, getFsBaseUrl } from "@/lib/server-settings";
import crypto from "crypto";

// 生成唯一的文件名
function generateUniqueFilename(originalName: string): string {
  const ext = path.extname(originalName);
  const hash = crypto.randomBytes(8).toString("hex");
  const timestamp = Date.now();
  return `${timestamp}-${hash}${ext}`;
}

// 确保目录存在
async function ensureDir(dirPath: string) {
  try {
    await fs.access(dirPath);
  } catch {
    await fs.mkdir(dirPath, { recursive: true });
  }
}

// 处理本地文件
async function handleLocalFile(filePath: string): Promise<string | null> {
  try {
    // 检查文件是否存在
    await fs.access(filePath);

    // 读取文件
    const fileBuffer = await fs.readFile(filePath);
    const fileName = path.basename(filePath);
    const uniqueName = generateUniqueFilename(fileName);

    // 保存到 File System 根下的默认图片目录
    const imagesDir = getServerImagesDir();
    await ensureDir(imagesDir);

    const newPath = path.join(imagesDir, uniqueName);
    await fs.writeFile(newPath, fileBuffer);

    // 返回可访问的URL路径（由 /api/fs-images/[name] 提供）
    return `${getFsBaseUrl()}/${uniqueName}`;
  } catch (error) {
    console.error(`Failed to handle local file ${filePath}:`, error);
    return null;
  }
}

// 处理网络图片
async function handleWebImage(imageUrl: string): Promise<string | null> {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`);
    }

    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.startsWith("image/")) {
      throw new Error("URL does not point to an image");
    }

    // 获取文件扩展名
    let ext = ".jpg"; // 默认扩展名
    if (contentType.includes("png")) ext = ".png";
    else if (contentType.includes("gif")) ext = ".gif";
    else if (contentType.includes("webp")) ext = ".webp";
    else if (contentType.includes("svg")) ext = ".svg";

    // 从URL中尝试获取文件名
    const urlPath = new URL(imageUrl).pathname;
    const originalName = path.basename(urlPath) || `image${ext}`;
    const uniqueName = generateUniqueFilename(originalName);

    // 下载图片
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 保存到 File System 根下的默认图片目录
    const imagesDir = getServerImagesDir();
    await ensureDir(imagesDir);

    const newPath = path.join(imagesDir, uniqueName);
    await fs.writeFile(newPath, buffer);

    // 返回可访问的URL路径
    return `/images/${uniqueName}`;
  } catch (error) {
    console.error(`Failed to handle web image ${imageUrl}:`, error);
    return null;
  }
}

// POST: 处理单个图片
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imageUrl, type } = body;

    if (!imageUrl) {
      return NextResponse.json(
        { error: "Missing imageUrl parameter" },
        { status: 400 }
      );
    }

    let newUrl: string | null = null;

    // 判断是本地文件还是网络图片
    if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
      newUrl = await handleWebImage(imageUrl);
    } else if (imageUrl.startsWith("/") || imageUrl.startsWith("file://")) {
      const localPath = imageUrl.replace("file://", "");
      newUrl = await handleLocalFile(localPath);
    } else if (imageUrl.startsWith("data:image")) {
      // 处理base64图片
      const matches = imageUrl.match(/^data:image\/([a-z]+);base64,(.+)$/i);
      if (matches) {
        const ext = matches[1];
        const base64Data = matches[2];
        const buffer = Buffer.from(base64Data, "base64");

        const uniqueName = generateUniqueFilename(`image.${ext}`);
        const imagesDir = getServerImagesDir();
        await ensureDir(imagesDir);

        const newPath = path.join(imagesDir, uniqueName);
        await fs.writeFile(newPath, buffer);

        newUrl = `${getFsBaseUrl()}/${uniqueName}`;
      }
    }

    if (newUrl) {
      return NextResponse.json({
        success: true,
        newUrl,
        originalUrl: imageUrl
      });
    } else {
      return NextResponse.json(
        { error: "Failed to process image", originalUrl: imageUrl },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Image management error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PUT: 批量处理图片
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { images } = body; // 数组of图片URLs

    if (!images || !Array.isArray(images)) {
      return NextResponse.json(
        { error: "Missing or invalid images array" },
        { status: 400 }
      );
    }

    const results = [];

    for (const imageUrl of images) {
      let newUrl: string | null = null;

      if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
        newUrl = await handleWebImage(imageUrl);
      } else if (imageUrl.startsWith("/") || imageUrl.startsWith("file://")) {
        const localPath = imageUrl.replace("file://", "");
        newUrl = await handleLocalFile(localPath);
      } else if (imageUrl.startsWith("data:image")) {
        // 处理base64图片
        const matches = imageUrl.match(/^data:image\/([a-z]+);base64,(.+)$/i);
        if (matches) {
          const ext = matches[1];
          const base64Data = matches[2];
          const buffer = Buffer.from(base64Data, "base64");

          const uniqueName = generateUniqueFilename(`image.${ext}`);
          const publicDir = path.join(process.cwd(), "public", "images");
          await ensureDir(publicDir);

          const newPath = path.join(publicDir, uniqueName);
          await fs.writeFile(newPath, buffer);

          newUrl = `/images/${uniqueName}`;
        }
      }

      results.push({
        originalUrl: imageUrl,
        newUrl: newUrl,
        success: !!newUrl
      });
    }

    return NextResponse.json({
      success: true,
      results,
      processed: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length
    });
  } catch (error) {
    console.error("Batch image management error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// GET: 列出所有已管理的图片
export async function GET(request: NextRequest) {
  try {
    const publicDir = path.join(process.cwd(), "public", "images");
    await ensureDir(publicDir);

    const files = await fs.readdir(publicDir);
    const images = files
      .filter(file => /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(file))
      .map(file => ({
        name: file,
        url: `/images/${file}`,
        path: path.join(publicDir, file)
      }));

    // 获取文件信息
    const imagesWithStats = await Promise.all(
      images.map(async (img) => {
        const stats = await fs.stat(img.path);
        return {
          name: img.name,
          url: img.url,
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime
        };
      })
    );

    return NextResponse.json({
      success: true,
      images: imagesWithStats,
      total: imagesWithStats.length
    });
  } catch (error) {
    console.error("List images error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE: 删除图片
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { imageName } = body;

    if (!imageName) {
      return NextResponse.json(
        { error: "Missing imageName parameter" },
        { status: 400 }
      );
    }

    const publicDir = path.join(process.cwd(), "public", "images");
    const imagePath = path.join(publicDir, imageName);

    // 安全检查：确保路径在public/images目录内
    if (!imagePath.startsWith(publicDir)) {
      return NextResponse.json(
        { error: "Invalid image path" },
        { status: 400 }
      );
    }

    await fs.unlink(imagePath);

    return NextResponse.json({
      success: true,
      message: `Image ${imageName} deleted successfully`
    });
  } catch (error) {
    console.error("Delete image error:", error);
    return NextResponse.json(
      { error: "Failed to delete image" },
      { status: 500 }
    );
  }
}
