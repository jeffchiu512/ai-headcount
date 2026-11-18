# AI Headcount｜員額分析工作台

中央機關員額資料整合、缺額與核增分析，以及自然語言查詢。

- 網站：https://jeffchiu512.github.io/ai-headcount/
- 前端：React、Vite、TypeScript、Chart.js。
- 後端：Supabase Postgres、Auth、Edge Functions。
- 模型：NVIDIA NIM，另保留 Google API 介接。

未登入可瀏覽虛構示範資料；智慧查詢及檔案匯入須登入。四種來源的同步燈號目前為 DEMO，實際來源 API 尚未串接。

## 本機開發

```sh
cd app
npm ci
cp .env.example .env.local
# 在 .env.local 填入 Supabase URL 與 publishable key
npm run dev
```

開啟 http://localhost:3000。

## GitHub Pages

推送至 `main` 會執行 `.github/workflows/deploy-pages.yml`，建置 `app/dist` 並發布網站。

建置使用兩個 GitHub Actions repository variables：

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

這兩項是前端公開設定。模型 API Key 與 Supabase 伺服器金鑰只保留在 Supabase Edge Function Secrets，不放入儲存庫或前端。

Supabase Auth 的正式網站設定請參閱 [部署說明](app/docs/deployment.md)。功能、資料口徑與後端設定請參閱 [應用說明](app/README.md)。

本儲存庫僅包含應用程式與程式產生的假資料，未包含工作目錄的原始員額檔案及 Office 文件。
