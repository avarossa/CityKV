import { generateImage } from "../../gemini";

export const dynamic = "force-dynamic";

/**
 * POST /api/landmarks/generate
 *
 * 接收 FormData（city + landmarks + prompt + model + file），
 * 使用 Gemini 图片模型基于参考图生成新的地标元素图片。
 * 同步返回 base64 图片数据。
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const formData = await request.formData();
    const city = formData.get("city")?.toString();
    const landmarks = formData.get("landmarks")?.toString();
    const prompt = formData.get("prompt")?.toString();
    const file = formData.get("file");

    if (!city || !prompt) {
      return Response.json(
        { error: "缺少必要参数" },
        { status: 400 },
      );
    }

    const geminiModel = "gemini-3-pro-image";

    // 编码参考图
    let referenceImages: Array<{ data: string; mimeType: string }> = [];
    if (file instanceof File) {
      const buffer = await file.arrayBuffer();
      const base64 = Buffer.from(buffer).toString("base64");
      referenceImages.push({
        data: base64,
        mimeType: file.type || "image/png",
      });
    }

    const fullPrompt = `城市：${city}\n地标元素：${landmarks || ""}\n\n${prompt}`;

    const result = await generateImage({
      model: geminiModel,
      prompt: fullPrompt,
      referenceImages: referenceImages.length ? referenceImages : undefined,
      aspectRatio: "1:1",
      imageSize: "1K",
    });

    return Response.json({
      status: "completed",
      image: {
        mimeType: result.mimeType,
        data: `data:${result.mimeType};base64,${result.imageBase64}`,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "地标图片生成失败";
    return Response.json({ error: message }, { status: 500 });
  }
}