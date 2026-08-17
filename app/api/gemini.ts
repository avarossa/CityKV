/**
 * Gemini API 客户端工具模块
 *
 * 所有 Gemini API 调用均通过服务端 API Route 进行，
 * API Key 仅存储在服务端环境变量中，绝不暴露到浏览器。
 */

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY 环境变量未配置");
  }
  return key;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableError(status: number, body: string): boolean {
  // 500 服务端错误 + 高负载/限流 / 429 配额超限
  if (status >= 500) return true;
  if (status === 429) return true;
  // 高负载提示
  if (body.includes("high demand") || body.includes("api_error")) return true;
  return false;
}

function parseRetrySeconds(body: string): number | null {
  // 解析 "Please retry in 23.058236578s" 中的秒数
  const match = body.match(/retry in ([\d.]+)s/);
  if (match) return Math.ceil(parseFloat(match[1]));
  return null;
}

// ---- 图片生成（Interactions API） ----

export interface ImageGenerationInput {
  model: string;
  prompt: string;
  referenceImages?: Array<{ data: string; mimeType: string }>;
  aspectRatio?: string;
  imageSize?: string;
}

export interface ImageGenerationResult {
  imageBase64: string;
  mimeType: string;
}

/**
 * 使用 Interactions API 生成一张图片。
 * 支持文本 Prompt + 多张参考图输入。
 */
export async function generateImage(
  input: ImageGenerationInput,
): Promise<ImageGenerationResult> {
  const apiKey = getApiKey();
  const parts: Array<Record<string, unknown>> = [
    { type: "text", text: input.prompt },
  ];

  if (input.referenceImages?.length) {
    for (const ref of input.referenceImages) {
      parts.push({
        type: "image",
        data: ref.data,
        mime_type: ref.mimeType,
      });
    }
  }

  const body: Record<string, unknown> = {
    model: input.model,
    input: parts,
    response_format: {
      type: "image",
      mime_type: "image/jpeg",
      aspect_ratio: input.aspectRatio || "16:9",
      image_size: input.imageSize || "2K",
    },
  };

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetch(`${GEMINI_API_BASE}/interactions`, {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (response.ok) {
      const result = await response.json();

      // 解析 Interactions API 的 steps 响应结构
      let imageData: string | undefined;
      let mimeType = "image/jpeg";

      const steps = result.steps;
      if (steps && Array.isArray(steps)) {
        for (const step of steps) {
          if (step.type === "model_output" && step.content) {
            for (const block of step.content) {
              if (block.type === "image" && block.data) {
                imageData = block.data;
                mimeType = block.mime_type || "image/jpeg";
                break;
              }
            }
          }
          if (imageData) break;
        }
      }

      if (!imageData) {
        throw new Error("Gemini API 未返回图片数据，响应结构: " + JSON.stringify(result).slice(0, 300));
      }

      return {
        imageBase64: imageData,
        mimeType,
      };
    }

    const errorText = await response.text();
    lastError = new Error(
      `Gemini API 错误 (${response.status}): ${errorText.slice(0, 500)}`,
    );

    if (!isRetryableError(response.status, errorText)) {
      throw lastError;
    }

    // 429 配额超限时使用 API 返回的建议等待时间，否则指数退避
    const retrySeconds = parseRetrySeconds(errorText);
    const delay = retrySeconds
      ? retrySeconds * 1000
      : RETRY_DELAY_MS * Math.pow(2, attempt);
    await sleep(delay);
  }

  throw lastError!;
}

// ---- 文本生成（generateContent API） ----

export interface TextGenerationInput {
  model: string;
  prompt: string;
  systemInstruction?: string;
}

export interface TextGenerationResult {
  text: string;
}

/**
 * 使用 generateContent API 进行文本生成。
 * 用于地标推荐等纯文本任务。
 */
export async function generateText(
  input: TextGenerationInput,
): Promise<TextGenerationResult> {
  const apiKey = getApiKey();
  const body: Record<string, unknown> = {
    contents: [
      {
        parts: [{ text: input.prompt }],
      },
    ],
  };

  if (input.systemInstruction) {
    body.system_instruction = {
      parts: [{ text: input.systemInstruction }],
    };
  }

  const response = await fetch(
    `${GEMINI_API_BASE}/models/${input.model}:generateContent`,
    {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Gemini API 错误 (${response.status}): ${errorText.slice(0, 500)}`,
    );
  }

  const result = await response.json();
  const text = result.candidates?.[0]?.content?.parts
    ?.map((p: { text?: string }) => p.text || "")
    .join("")
    .trim();

  if (!text) {
    throw new Error("Gemini API 未返回文本内容");
  }

  return { text };
}

// ---- 健康检查 ----

export async function checkGeminiHealth(): Promise<boolean> {
  try {
    const apiKey = getApiKey();
    // 简单验证：列出可用模型
    const response = await fetch(
      `${GEMINI_API_BASE}/models?key=${apiKey}`,
      { method: "GET" },
    );
    return response.ok;
  } catch {
    return false;
  }
}