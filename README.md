# Image Generation WebUI

OpenAI-compatible Images API を使うためのセルフホスト UI です。テキストからの生成、参照画像を使った編集、生成結果のプレビューに対応します。

## 動作

- ブラウザはこの UI の同一オリジン `/api/*` にのみ接続します。上流の画像 API URL と API キーはサーバー環境変数に保持します。
- 生成・編集結果はサーバーのファイルやデータベースに保存しません。ブラウザの現在の画面にだけ保持し、ページを閉じるか「表示をクリア」を押すと消えます。
- 各画像の「保存」操作を押した場合だけ、画像を端末へダウンロードします。
- アプリ接続コードはブラウザのメモリにだけ保持します。再読み込みすると再入力が必要です。

## 設定

```sh
cp .env.example .env
```

| 変数 | 説明 |
| --- | --- |
| `IMAGE_API_BASE_URL` | OpenAI 互換 API のルート。例: `http://image-generation-api.llm-gateway.svc.cluster.local:8080/v1` |
| `IMAGE_API_KEY` | 上流 API の Bearer token。既存 Secret の `LLM_GATEWAY_API_KEY` を渡します。 |
| `IMAGE_MODEL` | 初期表示するモデル名。画面上でリクエストごとに変更できます。 |
| `APP_ACCESS_TOKEN` | UI の生成 API を使うための共有接続コード。`openssl rand -hex 32` で生成してください。 |

```sh
npm ci
npm run dev
```

ブラウザで `http://localhost:3000` を開きます。上流 API への通信は Next.js サーバーから行います。

## Docker

```sh
docker build -t image-generation-webui .
docker run --rm -p 3000:3000 \
  -e IMAGE_API_BASE_URL=http://image-generation-api.llm-gateway.svc.cluster.local:8080/v1 \
  -e IMAGE_API_KEY="$LLM_GATEWAY_API_KEY" \
  -e IMAGE_MODEL=gpt-image-1 \
  -e APP_ACCESS_TOKEN="$APP_ACCESS_TOKEN" \
  image-generation-webui
```

## 公開イメージ

GitHub Actions は `main` への push と `v*` tag で GHCR にイメージを公開します。現在の `latest` と `main` は認証なしで pull できます。

- `ghcr.io/chik4ge-homelab/image-generation-webui:latest`
- `ghcr.io/chik4ge-homelab/image-generation-webui:main`
- `ghcr.io/chik4ge-homelab/image-generation-webui:sha-<commit>`
- `ghcr.io/chik4ge-homelab/image-generation-webui:<version>` (version tag)

パッケージは Public です。GitHub の仕様上、Public 化後は Private に戻せません。
