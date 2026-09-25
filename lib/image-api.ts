import { NextResponse } from "next/server";

const MAX_OUTPUT_BYTES = 25 * 1024 * 1024;

export function getUpstreamConfig() {
  const rawBase = process.env.IMAGE_API_BASE_URL?.trim();
  const apiKey = process.env.IMAGE_API_KEY?.trim();
  if (!rawBase || !apiKey) {
    throw new Error("IMAGE_API_BASE_URL と IMAGE_API_KEY をサーバーに設定してください。");
  }

  const base = new URL(rawBase);
  if (base.protocol !== "http:" && base.protocol !== "https:") {
    throw new Error("IMAGE_API_BASE_URL は http または https の URL を指定してください。");
  }
  if (base.username || base.password || base.search || base.hash) {
    throw new Error("IMAGE_API_BASE_URL に認証情報、query、fragment は含められません。");
  }

  return {
    apiKey,
    endpoint(path: "generations" | "edits") {
      const root = rawBase.replace(/\/+$/, "");
      return `${root}/images/${path}`;
    },
  };
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

async function inlineUrlImage(item: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  if (typeof item.url !== "string") return item;
  try {
    const url = new URL(item.url);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password) return null;

    const response = await fetch(url, { cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(30_000) });
    if (!response.ok || response.status >= 300) return null;
    const contentType = response.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
    if (!contentType.startsWith("image/")) return null;
    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (contentLength > MAX_OUTPUT_BYTES) return null;

    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_OUTPUT_BYTES) return null;
    return {
      ...item,
      b64_json: bytes.toString("base64"),
      mime_type: contentType,
      url: undefined,
    };
  } catch {
    return null;
  }
}

export async function forwardImageResponse(upstream: Response) {
  const contentType = upstream.headers.get("content-type") ?? "";
  if (!contentType.includes("json")) {
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type": contentType || "application/octet-stream",
        "Cache-Control": "no-store",
      },
    });
  }

  let payload: unknown;
  try {
    payload = await upstream.json();
  } catch {
    return jsonError("画像 API から JSON を読み取れませんでした。", 502);
  }

  if (upstream.ok && payload && typeof payload === "object" && Array.isArray((payload as { data?: unknown }).data)) {
    const result = payload as { data: unknown[]; [key: string]: unknown };
    const normalized = await Promise.all(
      result.data.map((entry) =>
        entry && typeof entry === "object" ? inlineUrlImage(entry as Record<string, unknown>) : entry,
      ),
    );
    if (normalized.some((entry) => entry === null)) {
      return jsonError("上流 API の画像 URL をサーバーから取得できませんでした。b64_json 形式を返す API を指定してください。", 502);
    }
    result.data = normalized;
  }

  return NextResponse.json(payload, {
    status: upstream.status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function callUpstream(url: string, apiKey: string, init: RequestInit) {
  try {
    return await fetch(url, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "upstream request failed";
    return jsonError(`画像 API に接続できませんでした: ${message}`, 502);
  }
}
