import sharp from "sharp";
import fs from "fs";
import path from "path";
import { generateImage } from "../gemini";

export const dynamic = "force-dynamic";

/**
 * 将 base64 图片压缩为 WebP，大幅降低传输体积。
 * 2K 原图 ~2MB → WebP ~150KB，在 1 Mbps 带宽下从 20s 降到 1.5s。
 */
async function compressToWebP(
  base64Data: string,
): Promise<{ data: string; mimeType: string }> {
  const buffer = Buffer.from(base64Data, "base64");
  const compressed = await sharp(buffer)
    .resize({ width: 1280, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
  return {
    data: `data:image/webp;base64,${compressed.toString("base64")}`,
    mimeType: "image/webp",
  };
}

/**
 * 从磁盘加载预压缩的参考图（1024px JPEG，已提前生成）。
 * 避免每次请求都用 sharp 重新压缩，节省 5-10 秒 CPU 时间。
 */
function loadRefFromDisk(
  filename: string,
): { data: string; mimeType: string } | null {
  // 优先用预压缩的小图
  const smallName = filename.replace(".webp", ".jpg");
  const smallPath = path.join(process.cwd(), "public", "references", "small", smallName);
  if (fs.existsSync(smallPath)) {
    const buffer = fs.readFileSync(smallPath);
    return {
      data: buffer.toString("base64"),
      mimeType: "image/jpeg",
    };
  }
  return null;
}

const REF_FILES = {
  layout: "1_layout.webp",
  kv_ref_1: "2_ref.webp",
  heart: "3_heart.webp",
  city_landmark: "4_landmark.webp",
};

/**
 * POST /api/generate
 *
 * 接收 FormData（prompt + model），
 * 参考图从服务器磁盘直接加载，避免浏览器上传。
 * 如果用户替换了参考图，才从 FormData 中读取。
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const formData = await request.formData();
    const prompt = formData.get("prompt")?.toString();
    const model = formData.get("model")?.toString() || "gemini-3-pro-image";
    const count = parseInt(formData.get("count")?.toString() || "1", 10);

    if (!prompt) {
      return Response.json(
        { error: "缺少 prompt 参数" },
        { status: 400 },
      );
    }

    // 参考图：优先从磁盘加载（默认图片），如果用户替换了则从 FormData 读取
    const referenceImages: Array<{ data: string; mimeType: string }> = [];

    for (const [field, filename] of Object.entries(REF_FILES)) {
      const file = formData.get(field);
      if (file instanceof File && file.size > 0) {
        // 用户上传了自定义图片，使用上传的文件
        const buffer = await file.arrayBuffer();
        const compressed = await sharp(Buffer.from(buffer))
          .resize({ width: 1024, withoutEnlargement: true })
          .jpeg({ quality: 80 })
          .toBuffer();
        referenceImages.push({
          data: compressed.toString("base64"),
          mimeType: "image/jpeg",
        });
      } else {
        // 从磁盘加载预压缩的默认参考图
        const ref = loadRefFromDisk(filename);
        if (ref) referenceImages.push(ref);
      }
    }

    // 并发生成指定数量的图片
    const generations = Array.from({ length: Math.min(count, 1) }, () =>
      generateImage({
        model: model,
        prompt,
        referenceImages: referenceImages.length ? referenceImages : undefined,
        aspectRatio: "16:9",
        imageSize: "2K",
      }),
    );

    const results = await Promise.all(generations);

    // 压缩为 WebP 后返回，大幅减少传输体积
    const images = await Promise.all(
      results.map((r) => compressToWebP(r.imageBase64)),
    );

    return Response.json({
      status: "completed",
      images,
      model: model,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "图片生成失败";
    return Response.json({ error: message }, { status: 500 });
  }
}