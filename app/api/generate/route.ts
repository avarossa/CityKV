import sharp from "sharp";
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
 * POST /api/generate
 *
 * 接收 FormData（prompt + model + 参考图文件），
 * 调用 Gemini Interactions API 生成图片。
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

    // 提取所有参考图文件（base64 编码）
    const referenceImages: Array<{ data: string; mimeType: string }> = [];
    const fileFields = ["layout", "kv_ref_1", "heart", "city_landmark"];

    for (const field of fileFields) {
      const file = formData.get(field);
      if (file instanceof File) {
        const buffer = await file.arrayBuffer();
        const base64 = Buffer.from(buffer).toString("base64");
        referenceImages.push({
          data: base64,
          mimeType: file.type || "image/png",
        });
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