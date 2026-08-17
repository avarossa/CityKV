import { generateText } from "../../gemini";

export const dynamic = "force-dynamic";

/**
 * POST /api/landmarks/suggest
 *
 * 接收 { city, prompt } JSON，
 * 使用 Gemini 文本模型分析并推荐城市标志元素。
 * 同步返回结果文本（不再需要轮询）。
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json();
    const city = body.city?.toString();
    const prompt = body.prompt?.toString();

    if (!city || !prompt) {
      return Response.json(
        { error: "缺少 city 或 prompt 参数" },
        { status: 400 },
      );
    }

    const result = await generateText({
      model: "gemini-2.5-flash",
      prompt,
      systemInstruction:
        "你是一个专业的城市地理和旅游专家。请根据用户提供的城市名称，推荐该城市最具代表性的9个标志性建筑、景点或元素。每个元素一行，格式为：序号. 元素名称。只返回列表，不要额外解释。",
    });

    return Response.json({
      status: "completed",
      resultText: result.text,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "地标推荐失败";
    return Response.json({ error: message }, { status: 500 });
  }
}