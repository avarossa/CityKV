import { generateImage } from "../gemini";

export const dynamic = "force-dynamic";

/**
 * POST /api/generate
 *
 * 接收 FormData（prompt + model + 参考图文件），
 * 调用 Gemini Interactions API 生成图片。
 *
 * 由于 Gemini API 每次生成 1 张图片，前端需要 3 个版本时，
 * 会并发 3 次请求，返回 3 张 base64 图片。
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const formData = await request.formData();
    const prompt = formData.get("prompt")?.toString();
    const model = formData.get("model")?.toString() || "gemini-3-pro-image";
    const count = parseInt(formData.get("count")?.toString() || "3", 10);

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
    const generations = Array.from({ length: Math.min(count, 3) }, () =>
      generateImage({
        model: model,
        prompt,
        referenceImages: referenceImages.length ? referenceImages : undefined,
        aspectRatio: "16:9",
        imageSize: "2K",
      }),
    );

    const results = await Promise.all(generations);

    // 返回 base64 图片数据，前端负责展示
    const images = results.map((r) => ({
      mimeType: r.mimeType,
      data: `data:${r.mimeType};base64,${r.imageBase64}`,
    }));

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