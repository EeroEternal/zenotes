import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

// 生成唯一的文件名
function generateUniqueFilename(originalPath: string): string {
  const ext = path.extname(originalPath);
  const hash = crypto.randomBytes(8).toString("hex");
  const timestamp = Date.now();
  return `${timestamp}-${hash}${ext}`;
}

// 处理单个图片
async function processImage(
  imagePath: string,
  sourceDir: string,
  imageDir: string,
  baseUrl: string,
): Promise<string | null> {
  try {
    // 如果已经是处理后的路径，直接返回
    if (imagePath.startsWith("/images/")) {
      return imagePath;
    }

    // 处理网络图片
    if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) {
      const response = await fetch(imagePath);
      if (!response.ok) {
        throw new Error(`Failed to download image: ${response.statusText}`);
      }

      const buffer = await response.arrayBuffer();
      const targetDir = path.join(process.cwd(), imageDir);
      await fs.mkdir(targetDir, { recursive: true });

      const urlPath = new URL(imagePath).pathname;
      const ext = path.extname(urlPath) || ".jpg";
      const newFilename = generateUniqueFilename(`image${ext}`);
      const targetPath = path.join(targetDir, newFilename);

      await fs.writeFile(targetPath, Buffer.from(buffer));
      return `${baseUrl}/${newFilename}`;
    }

    // 处理本地图片
    let fullImagePath: string = "";

    if (path.isAbsolute(imagePath)) {
      fullImagePath = imagePath;
    } else {
      // 尝试多个可能的路径
      const possiblePaths = [
        path.join(sourceDir, imagePath),
        path.join(sourceDir, "pics", imagePath),
        path.join("/Users/mac-m4/sync/md/pics", imagePath),
        path.join("/Users/mac-m4/sync/md", imagePath),
      ];

      let found = false;
      for (const possiblePath of possiblePaths) {
        try {
          await fs.access(possiblePath);
          fullImagePath = possiblePath;
          found = true;
          break;
        } catch {
          continue;
        }
      }

      if (!found) {
        console.warn(`Image not found: ${imagePath}`);
        return null;
      }
    }

    // 复制图片到目标目录
    const targetDir = path.join(process.cwd(), imageDir);
    await fs.mkdir(targetDir, { recursive: true });

    const newFilename = generateUniqueFilename(fullImagePath);
    const targetPath = path.join(targetDir, newFilename);

    await fs.copyFile(fullImagePath, targetPath);
    return `${baseUrl}/${newFilename}`;
  } catch (error) {
    console.error(`Failed to process image ${imagePath}:`, error);
    return null;
  }
}

// 处理Markdown内容中的图片
async function processMarkdownImages(
  content: string,
  sourceDir: string,
  imageDir: string,
  baseUrl: string,
): Promise<{ content: string; images: number }> {
  // 匹配所有图片引用
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  const matches = Array.from(content.matchAll(imageRegex));

  let processedContent = content;
  let processedImages = 0;

  for (const match of matches) {
    const [fullMatch, altText, imagePath] = match;

    try {
      const newImageUrl = await processImage(
        imagePath,
        sourceDir,
        imageDir,
        baseUrl,
      );

      if (newImageUrl) {
        // 替换原始图片路径为新路径
        const newMarkdown = `![${altText}](${newImageUrl})`;
        processedContent = processedContent.replace(fullMatch, newMarkdown);
        processedImages++;
      }
    } catch (error) {
      console.error(`Failed to process image ${imagePath}:`, error);
    }
  }

  return {
    content: processedContent,
    images: processedImages,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      filePath,
      processImages = true,
      imageDir = "public/images",
      baseUrl = "/images",
    } = body;

    if (!filePath) {
      return NextResponse.json(
        { error: "Missing filePath parameter" },
        { status: 400 },
      );
    }

    // 处理文件路径 - 确保使用绝对路径
    let fullFilePath = filePath;
    if (!path.isAbsolute(filePath)) {
      // 如果是相对路径，尝试从当前工作目录解析
      fullFilePath = path.resolve(process.cwd(), filePath);
    }

    // 检查文件是否存在
    try {
      await fs.access(fullFilePath);
    } catch (error) {
      return NextResponse.json(
        { 
          error: `File not found: ${filePath}`,
          details: `Attempted to read file at: ${fullFilePath}` 
        },
        { status: 404 },
      );
    }

    // 读取Markdown文件
    const content = await fs.readFile(fullFilePath, "utf-8");
    const sourceDir = path.dirname(fullFilePath);

    // 处理图片
    let result = { content, images: 0 };
    if (processImages) {
      result = await processMarkdownImages(
        content,
        sourceDir,
        imageDir,
        baseUrl,
      );
    }

    return NextResponse.json({
      success: true,
      content: result.content,
      images: result.images,
      filePath: fullFilePath,
    });
  } catch (error) {
    console.error("Import markdown error:", error);
    
    // 提供更具体的错误信息
    let errorMessage = "Failed to import markdown";
    let statusCode = 500;
    
    if (error instanceof Error) {
      if (error.message.includes("ENOENT")) {
        errorMessage = `File not found: ${filePath}`;
        statusCode = 404;
      } else if (error.message.includes("EACCES")) {
        errorMessage = `Permission denied: Cannot read file ${filePath}`;
        statusCode = 403;
      } else if (error.message.includes("EISDIR")) {
        errorMessage = `Path is a directory, not a file: ${filePath}`;
        statusCode = 400;
      } else {
        errorMessage = error.message;
      }
    }
    
    return NextResponse.json(
      {
        error: errorMessage,
        details: error instanceof Error ? error.message : "Unknown error",
        filePath: filePath,
        resolvedPath: fullFilePath || filePath
      },
      { status: statusCode },
    );
  }
}
