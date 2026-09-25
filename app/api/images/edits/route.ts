import { callUpstream, forwardImageResponse, getUpstreamConfig, jsonError } from "@/lib/image-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowedTypes = new Set(["image/png", "image/jpeg", "image/webp"]);
const sizes = new Set(["1024x1024", "1536x1024", "1024x1536"]);
const MAX_FILES = 4;
const MAX_FILE_BYTES = 12 * 1024 * 1024;

export async function POST(request: Request) {
  let incoming: FormData;
  try {
    incoming = await request.formData();
  } catch {
    return jsonError("編集リクエストの形式が正しくありません。");
  }

  const prompt = String(incoming.get("prompt") ?? "").trim();
  const requestedSize = String(incoming.get("size") ?? "1024x1024");
  const requestedCount = Number(incoming.get("n") ?? 1);
  const preferredImages = incoming.getAll("image[]").filter((entry): entry is File => entry instanceof File);
  const images = preferredImages.length > 0
    ? preferredImages
    : incoming.getAll("image").filter((entry): entry is File => entry instanceof File);

  if (!prompt) return jsonError("編集内容を入力してください。");
  if (prompt.length > 20_000) return jsonError("プロンプトは20,000文字以内で入力してください。");
  if (images.length === 0) return jsonError("参照画像を1枚以上追加してください。");
  if (images.length > MAX_FILES) return jsonError(`参照画像は${MAX_FILES}枚までです。`);
  if (images.some((image) => !allowedTypes.has(image.type))) return jsonError("PNG、JPEG、WebP の画像を指定してください。");
  if (images.some((image) => image.size > MAX_FILE_BYTES)) return jsonError("参照画像は1枚あたり12MB以下にしてください。");

  let config;
  try {
    config = getUpstreamConfig();
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "API 設定を確認してください。", 503);
  }

  const outgoing = new FormData();
  outgoing.set("prompt", prompt);
  outgoing.set("n", String(Number.isInteger(requestedCount) ? Math.min(4, Math.max(1, requestedCount)) : 1));
  outgoing.set("size", sizes.has(requestedSize) ? requestedSize : "1024x1024");
  outgoing.set("output_format", "png");
  outgoing.set("response_format", "b64_json");
  for (const image of images) outgoing.append("image[]", image, image.name || "reference.png");

  const upstream = await callUpstream(config.endpoint("edits"), config.apiKey, {
    method: "POST",
    body: outgoing,
    signal: request.signal,
  });

  return forwardImageResponse(upstream);
}
