import { callUpstream, forwardImageResponse, getUpstreamConfig, jsonError } from "@/lib/image-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sizes = new Set(["1024x1024", "1536x1024", "1024x1536"]);

export async function POST(request: Request) {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return jsonError("リクエストの形式が正しくありません。");
  }
  if (!input || typeof input !== "object") return jsonError("リクエストの形式が正しくありません。");

  const body = input as Record<string, unknown>;
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const size = typeof body.size === "string" && sizes.has(body.size) ? body.size : "1024x1024";
  const count = Number.isInteger(body.n) ? Math.min(4, Math.max(1, Number(body.n))) : 1;

  if (!prompt) return jsonError("プロンプトを入力してください。");
  if (prompt.length > 20_000) return jsonError("プロンプトは20,000文字以内で入力してください。");

  let config;
  try {
    config = getUpstreamConfig();
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "API 設定を確認してください。", 503);
  }

  const upstream = await callUpstream(config.endpoint("generations"), config.apiKey, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      n: count,
      size,
      output_format: "png",
      response_format: "b64_json",
    }),
    signal: request.signal,
  });

  return forwardImageResponse(upstream);
}
