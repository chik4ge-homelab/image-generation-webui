"use client";

import { useEffect, useMemo, useState, type ChangeEvent, type DragEvent } from "react";

type Mode = "generate" | "edit";
type ResultImage = { id: string; src: string; mimeType: string; revisedPrompt?: string };
type ApiConfig = { configured: boolean };

const sizes = [
  { value: "1024x1024", label: "正方形", ratio: "1:1" },
  { value: "1536x1024", label: "横長", ratio: "3:2" },
  { value: "1024x1536", label: "縦長", ratio: "2:3" },
];

function imageSource(entry: Record<string, unknown>): Pick<ResultImage, "src" | "mimeType"> | null {
  if (typeof entry.b64_json === "string") {
    const mimeType = typeof entry.mime_type === "string" ? entry.mime_type : "image/png";
    return { src: `data:${mimeType};base64,${entry.b64_json}`, mimeType };
  }
  if (typeof entry.url === "string") return { src: entry.url, mimeType: "image/png" };
  return null;
}

function getErrorMessage(payload: unknown, status: number) {
  if (payload && typeof payload === "object") {
    const error = (payload as { error?: unknown }).error;
    if (typeof error === "string" && error) return error;
    if (error && typeof error === "object" && typeof (error as { message?: unknown }).message === "string") {
      return String((error as { message: string }).message);
    }
  }
  return `リクエストに失敗しました (${status})`;
}

export default function Home() {
  const [mode, setMode] = useState<Mode>("generate");
  const [prompt, setPrompt] = useState("");
  const [size, setSize] = useState(sizes[0].value);
  const [quality, setQuality] = useState("auto");
  const [count, setCount] = useState(1);
  const [references, setReferences] = useState<File[]>([]);
  const [results, setResults] = useState<ResultImage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [config, setConfig] = useState<ApiConfig | null>(null);
  const [previews, setPreviews] = useState<Array<{ name: string; src: string }>>([]);

  useEffect(() => {
    fetch("/api/config", { cache: "no-store" })
      .then((response) => response.json())
      .then((value: ApiConfig) => {
        setConfig(value);
      })
      .catch(() => setConfig({ configured: false }));
  }, []);

  useEffect(() => {
    const next = references.map((file) => ({ name: file.name, src: URL.createObjectURL(file) }));
    setPreviews(next);
    return () => next.forEach((preview) => URL.revokeObjectURL(preview.src));
  }, [references]);

  const statusReady = Boolean(config?.configured);
  const canSubmit = useMemo(() => {
    return Boolean(prompt.trim() && !busy && (mode === "generate" || references.length > 0));
  }, [busy, mode, prompt, references.length]);

  function addReferences(files: FileList | File[]) {
    const selected = Array.from(files).filter((file) => file.type.startsWith("image/"));
    setReferences((current) => [...current, ...selected].slice(0, 4));
    setError("");
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) addReferences(event.target.files);
    event.target.value = "";
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    if (event.dataTransfer.files) addReferences(event.dataTransfer.files);
  }

  function removeReference(index: number) {
    setReferences((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }

  async function generate() {
    if (!canSubmit) return;
    setBusy(true);
    setError("");
    try {
      let response: Response;
      if (mode === "generate") {
        response = await fetch("/api/images/generations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: prompt.trim(), n: count, size, quality }),
        });
      } else {
        const form = new FormData();
        form.set("prompt", prompt.trim());
        form.set("n", String(count));
        form.set("size", size);
        form.set("quality", quality);
        references.forEach((file) => form.append("image", file, file.name));
        response = await fetch("/api/images/edits", { method: "POST", body: form });
      }

      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(getErrorMessage(payload, response.status));
      const data = payload && typeof payload === "object" ? (payload as { data?: unknown }).data : null;
      if (!Array.isArray(data)) throw new Error("API の応答に画像がありませんでした。");
      const images = data.flatMap((entry, index) => {
        if (!entry || typeof entry !== "object") return [];
        const source = imageSource(entry as Record<string, unknown>);
        if (!source) return [];
        return [{
          id: `${Date.now()}-${index}`,
          ...source,
          revisedPrompt: typeof (entry as { revised_prompt?: unknown }).revised_prompt === "string"
            ? String((entry as { revised_prompt: string }).revised_prompt)
            : undefined,
        }];
      });
      if (images.length === 0) throw new Error("表示できる画像が応答に含まれていませんでした。");
      setResults(images);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "画像生成に失敗しました。");
    } finally {
      setBusy(false);
    }
  }

  async function saveImage(image: ResultImage, index: number) {
    try {
      let href = image.src;
      let revoke = false;
      if (href.startsWith("data:")) {
        const blob = await (await fetch(href)).blob();
        href = URL.createObjectURL(blob);
        revoke = true;
      }
      const link = document.createElement("a");
      link.href = href;
      link.download = `image-${String(index + 1).padStart(2, "0")}.png`;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.click();
      if (revoke) window.setTimeout(() => URL.revokeObjectURL(href), 1000);
    } catch {
      setError("画像をダウンロードできませんでした。");
    }
  }

  async function editResult(image: ResultImage, index: number) {
    try {
      const response = await fetch(image.src);
      const blob = await response.blob();
      const file = new File([blob], `image-${index + 1}.png`, { type: image.mimeType || blob.type || "image/png" });
      setReferences([file]);
      setMode("edit");
      setError("");
    } catch {
      setError("この画像を編集用の参照画像として読み込めませんでした。");
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Image Studio home">
          <span className="brand-mark"><span /></span>
          <span className="brand-copy"><strong>IMAGE STUDIO</strong><small>OPENAI-COMPATIBLE CANVAS</small></span>
        </a>
        <div className={`connection ${statusReady ? "is-ready" : "is-offline"}`}>
          <span className="status-dot" />
          <span>{statusReady ? "API 設定済み" : "サーバー設定を確認"}</span>
        </div>
      </header>

      <div className="workspace">
        <aside className="composer-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">CREATE</p>
              <h1>画像をつくる</h1>
            </div>
            <span className="sparkle-mark">✳</span>
          </div>

          <div className="mode-switch" role="tablist" aria-label="作成モード">
            <button className={mode === "generate" ? "active" : ""} onClick={() => setMode("generate")} role="tab" aria-selected={mode === "generate"}>
              <span className="mode-icon">✦</span> 新規生成
            </button>
            <button className={mode === "edit" ? "active" : ""} onClick={() => setMode("edit")} role="tab" aria-selected={mode === "edit"}>
              <span className="mode-icon">◌</span> 画像を編集
            </button>
          </div>

          {mode === "edit" && (
            <section className="reference-section">
              <div className="section-label-row">
                <label className="field-label">参照画像</label>
                <span className="muted-count">{references.length}/4</span>
              </div>
              {previews.length > 0 && (
                <div className="reference-grid">
                  {previews.map((preview, index) => (
                    <div className="reference-thumb" key={`${preview.name}-${index}`}>
                      <img src={preview.src} alt={preview.name} />
                      <button type="button" aria-label={`${preview.name} を削除`} onClick={() => removeReference(index)}>×</button>
                    </div>
                  ))}
                </div>
              )}
              {references.length < 4 && (
                <label className="dropzone" onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
                  <input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={onFileChange} />
                  <span className="upload-icon">↑</span>
                  <span><strong>画像を追加</strong><small>ドラッグ＆ドロップもできます</small></span>
                </label>
              )}
            </section>
          )}

          <section className="prompt-section">
            <div className="section-label-row">
              <label htmlFor="prompt" className="field-label">{mode === "edit" ? "どこをどう変えますか？" : "どんな画像をつくりますか？"}</label>
              <span className="muted-count">{prompt.length.toLocaleString()}</span>
            </div>
            <textarea
              id="prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={mode === "edit" ? "例：背景を夕暮れの海辺に変えて、人物はそのままにしてください。" : "例：雨上がりの京都の路地。濡れた石畳に提灯の光が映る、静かな映画のワンシーン。"}
              maxLength={20_000}
              rows={6}
            />
            <div className="prompt-hint"><span>↵</span> 自由な言葉で指示できます</div>
          </section>

          <section className="settings-section">
            <div className="section-label-row"><span className="field-label">生成設定</span><span className="optional-label">お好みで調整</span></div>
            <div className="setting-row">
              <label htmlFor="size">比率</label>
              <select id="size" value={size} onChange={(event) => setSize(event.target.value)}>
                {sizes.map((item) => <option key={item.value} value={item.value}>{item.label}　{item.ratio}</option>)}
              </select>
            </div>
            <div className="setting-columns">
              <div className="setting-row">
                <label htmlFor="quality">品質</label>
                <select id="quality" value={quality} onChange={(event) => setQuality(event.target.value)}>
                  <option value="auto">自動</option><option value="low">低</option><option value="medium">標準</option><option value="high">高</option>
                </select>
              </div>
              <div className="setting-row">
                <label htmlFor="count">枚数</label>
                <select id="count" value={count} onChange={(event) => setCount(Number(event.target.value))}>
                  {[1, 2, 3, 4].map((value) => <option key={value} value={value}>{value} 枚</option>)}
                </select>
              </div>
            </div>
          </section>

          {error && <div className="error-message" role="alert"><span>!</span>{error}</div>}
          {!statusReady && config && <div className="setup-message">サーバーに IMAGE_API_BASE_URL と IMAGE_API_KEY を設定してください。</div>}

          <button className="generate-button" type="button" disabled={!canSubmit || !statusReady} onClick={generate}>
            {busy ? <><span className="button-spinner" /> 生成しています…</> : <><span>{mode === "edit" ? "✧" : "✦"}</span> {mode === "edit" ? "編集画像を生成" : "画像を生成"}<kbd>↵</kbd></>}
          </button>
          <p className="privacy-note"><span>◌</span> 生成結果はこの画面に一時表示されます。保存ボタンを押すまでダウンロードしません。</p>
        </aside>

        <section className="results-panel" aria-live="polite">
          <div className="results-header">
            <div>
              <p className="eyebrow">YOUR CANVAS</p>
              <h2>生成結果{results.length > 0 && <span className="result-count">{String(results.length).padStart(2, "0")}</span>}</h2>
            </div>
            {results.length > 0 && <button className="clear-button" onClick={() => setResults([])}>表示をクリア <span>×</span></button>}
          </div>

          {results.length === 0 && !busy && (
            <div className="empty-state">
              <div className="art-stack" aria-hidden="true"><span className="art-sheet sheet-back" /><span className="art-sheet sheet-mid" /><span className="art-sheet sheet-front"><i>✳</i></span><span className="art-orbit orbit-one" /><span className="art-orbit orbit-two" /></div>
              <div className="empty-copy"><h3>アイデアをかたちに</h3><p>プロンプトを入力して生成すると、<br />ここに画像が表示されます。</p></div>
              <div className="empty-footer"><span>01</span><i /> <span>GENERATE</span><i /> <span>REVIEW</span><i /> <span>REFINE</span></div>
            </div>
          )}

          {busy && (
            <div className="loading-state"><span className="loading-orbit"><i /><i /><i /></span><strong>画像をつくっています</strong><span>生成が完了すると、ここに表示されます。</span></div>
          )}

          {results.length > 0 && (
            <div className={`result-grid ${results.length === 1 ? "single-result" : ""}`}>
              {results.map((image, index) => (
                <article className="result-card" key={image.id}>
                  <div className="result-image-wrap"><img src={image.src} alt={`生成画像 ${index + 1}`} /></div>
                  <div className="result-card-footer">
                    <div><span className="result-index">{String(index + 1).padStart(2, "0")}</span><span className="result-format">PNG · {size}</span></div>
                    <div className="result-actions">
                      <button onClick={() => editResult(image, index)} className="edit-result-button">この画像を編集</button>
                      <button onClick={() => saveImage(image, index)} className="save-button"><span>↓</span> 保存</button>
                    </div>
                  </div>
                  {image.revisedPrompt && <p className="revised-prompt">{image.revisedPrompt}</p>}
                </article>
              ))}
            </div>
          )}

          <div className="canvas-footer"><span>IMAGE STUDIO</span><span>結果はこのタブを閉じると消去されます</span><span>NO AUTO-SAVE</span></div>
        </section>
      </div>
    </main>
  );
}
