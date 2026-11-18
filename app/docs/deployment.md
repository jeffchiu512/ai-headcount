# GitHub Pages 部署

網站：https://jeffchiu512.github.io/ai-headcount/

## 前端

GitHub Actions 以 `VITE_BASE_PATH=/ai-headcount/` 建置。Logo、示範 JSON、Excel 與 CSV 下載均透過 Vite BASE_URL 取得正確子路徑。本機開發維持根路徑。

GitHub Actions 的 repository variables 存放前端公開的 Supabase URL 與 publishable key。Google、NVIDIA、Supabase service role／secret key 不得放入 VITE_ 環境變數。

每次推送 main 自動建置及部署；可以在 GitHub Actions 手動執行 Deploy GitHub Pages。部署紀錄可在 Actions 與 github-pages environment 查看。

## Supabase Auth

前往 Authentication → URL Configuration：

- Site URL：`https://jeffchiu512.github.io/ai-headcount/`
- Redirect URLs：加入 `https://jeffchiu512.github.io/ai-headcount/**`
- 若需繼續本機開發，保留 `http://localhost:3000/**` 與 `http://127.0.0.1:3000/**`。

註冊驗證信的 emailRedirectTo 會使用目前網站的完整 base URL，包含 /ai-headcount/。若正式網址未加入 allowlist，Supabase 可能改用原本 Site URL，造成驗證後回到 localhost。

現有使用者的電子郵件／密碼登入不依賴郵件 redirect allowlist。網站發布後需確認新帳號的驗證信也導向正式網址。

## 後端

GitHub Pages 只發布靜態前端。資料庫、登入驗證、RLS、匯入 RPC 與 headcount-query 仍在 Supabase。此工作流程不會自動部署 Edge Function 或套用資料庫變更。
