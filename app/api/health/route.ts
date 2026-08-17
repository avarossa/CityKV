import { checkGeminiHealth } from "../gemini";

export const dynamic = "force-dynamic";

/**
 * GET /api/health
 *
 * 检查 Gemini API 连接状态。
 * 返回 { ok: true } 表示 API Key 有效且可正常连接。
 */
export async function GET(): Promise<Response> {
  try {
    const healthy = await checkGeminiHealth();
    if (healthy) {
      return Response.json({
        ok: true,
        service: "Gemini API",
        model: "gemini-3-pro-image",
        status: "online",
      });
    }
    return Response.json(
      { ok: false, error: "Gemini API 连接失败，请检查 API Key 和网络" },
      { status: 503 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Gemini API 不可用";
    return Response.json({ ok: false, error: message }, { status: 503 });
  }
}