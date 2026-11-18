# AI Headcount 員額分析工作台

React + Vite + TypeScript、Chart.js、Supabase Postgres/Auth、Edge Functions，以及 NVIDIA NIM／Google 模型 API。

## 開啟本機工作台

```sh
cd app
npm run dev
```

開啟 http://localhost:3000。未登入可瀏覽本機假資料；登入後改用 Supabase 資料，並開放智慧查詢與資料匯入。

Supabase 開發專案：`ai-headcount`，Project Ref：`jdiocqhgeefbgbksparr`。前端僅使用 publishable key，設定在忽略版本控制的 `.env.local`。其他電腦可複製 `.env.example` 後填入自己的 publishable key。

首次使用可在登入視窗建立電子郵件／密碼帳號。若專案要求信箱驗證，先完成驗證再登入。Supabase Dashboard → Authentication → URL Configuration 的 Site URL 建議設為 `http://localhost:3000`，Redirect URLs 加入 `http://localhost:3000/**`；若使用 `127.0.0.1` 也需加入對應網址。正式網站部署後再加入正式網址。

## 已完成的功能

- 整合統計表：同年度現員統計、機關搜尋、職員／聘僱／工友分類、主管含所屬、機關歷年明細。
- 缺額分析：缺額率／缺額數排序、門檻篩選、圖表與表格。
- 核增情形：近 1–10 年、四種人力核增比較與年度趨勢。
- 智慧查詢：模型生成 SQL、語法樹檢查、受限資料庫執行、圖表規格推薦、查詢口徑、SQL 展開與歷史結果。
- 資料匯入：Excel／CSV、UTF-8／Big5、必要欄位及重複資料檢查、基準日、預覽確認、每次保留快照。
- Excel 匯出：查詢結果、口徑、SQL 與來源資訊。

## 假資料

`public/samples` 有四份 `.xlsx` 與 `.csv`。每種來源各一份檔案，第一列即為匯入欄名。

| 來源 | 原始資料列 | 正規化資料筆數 |
| --- | ---: | ---: |
| WebHR | 18 | 18 |
| D5 現員 | 180 | 540 |
| D5 增額 | 180 | 540 |
| D7 約用 | 180 | 180 |

共 6 個虛構主管機關、12 個所屬機關，年度為民國 106–115 年。WebHR 是單一現況編制。每個機關的數字均不包含所屬；機關階層沿用 `001`、`001-01` 代碼慣例。所有數值為程式產生，不是政府實際資料。D5 增額在本版暫定為「核定增加」，未包含核減、移撥，正式資料欄位語意仍須確認。

假資料已寫入 Supabase，共 1,278 筆。所有登入者可讀取共用假資料；個人匯入資料依使用者隔離。同來源有個人匯入時，採個人最新批次替代該來源示範批次。舊批次保留於資料庫，目前 UI 未提供切換或刪除舊批次。

重建 CSV 與 seed SQL：`npm run generate:data`。該命令不會自動寫入遠端資料庫；seed SQL 會略過已有示範來源。

## 模型與 Edge Function

目前支援 NVIDIA NIM（Chat Completions）與 Google。當 `NVIDIA_API_KEY` 已設定時，預設使用 NVIDIA；如需明確指定，可設定 `LLM_PROVIDER=nvidia` 或 `google`。不會跨供應商自動備援。

NVIDIA 設定：

- `NVIDIA_API_KEY`：NVIDIA API Catalog 金鑰。
- `NVIDIA_MODEL`：完整模型 ID；目前已驗證 `nvidia/nemotron-3-ultra-550b-a55b`。
- `NVIDIA_FALLBACK_MODEL`：選用，預設不跨模型備援。

NVIDIA 請求送到固定的 `https://integrate.api.nvidia.com/v1/chat/completions`，以 Bearer Key 驗證；模型金鑰只留在 Edge Function。Google 的 Secrets 可以保留，NVIDIA 模式不會讀取或使用 Google 金鑰。

以下為原 Google 設定（選用）：

已部署 `headcount-query`，開啟 `verify_jwt` 並在函式內驗證使用者。Google 模式預設模型為 `gemma-4-31b-it`；NVIDIA 模式採用 `NVIDIA_MODEL`。

Secrets：

- `GOOGLE_AI_API_KEY`：Google AI Studio API Key。相容 `GEMINI_API_KEY`、`GOOGLE_API_KEY`。
- `GOOGLE_MODEL`：選用，用來切換模型。
- `GOOGLE_FALLBACK_MODEL`：選用，預設 `gemma-4-26b-a4b-it`。遇到暫時性錯誤時，最多嘗試兩次主要模型，再嘗試一次備援；設為空字串可停用跨模型備援。

模型暫時不可用、速率限制與金鑰權限錯誤會分別顯示。各模型呼叫採有限次退避重試，SQL 規劃、修正與圖表推薦共用 110 秒等待預算，單次模型呼叫上限 60 秒；圖表推薦失敗時保留資料表與預設圖表。503 重試仍失敗時需等待 Google 服務恢復，不代表 API Key 一定有問題。日誌僅記錄模型、HTTP 狀態與錯誤分類，不記錄金鑰、問題或資料內容。
- Supabase URL 與伺服器金鑰使用 Edge Runtime 提供的環境變數，不放進前端。

第一次模型呼叫取得查詢計畫與 SQL，必要時最多修正一次。第二階段取得圖表種類、欄位對應、分組；僅傳結果欄位與筆數，圖表數值由資料庫結果直接填入。模型不產生可執行前端程式碼，也不重新抄寫圖表數字。第二階段失敗可降級為預設圖表。第一版用口徑說明呈現分析背景，尚未增加獨立的模型敘事摘要。

## 查詢邊界

允許的分析檢視表為 `analytics.agencies`、`analytics.establishment`、`analytics.current_staff`、`analytics.additions`。模型無法使用任意表格或函式。SQL 須通過語法樹的節點、表格、函式與運算子白名單；資料庫 executor 使用無登入、無寫入、無 RLS bypass 的角色，受限成本與結果筆數。執行 RPC 僅允許後端 service role 呼叫。使用者 ID 來自驗證後的登入身分。

每位使用者限制每分鐘 8 次、每日 100 次自然語言查詢（每日依資料庫 UTC 換日），結果最多 500 筆。圖表分類太多、重複分類、不同單位或數列超過 8 組時改用表格，避免靜默省略或加總。缺漏值與零分開，零分母不產生缺額率。

僅用公開或虛構資料操作免費模型服務。提問、機關清單與欄位定義會送至目前設定的模型供應商；原始 Excel 與整份員額資料不直接傳給模型。正式內部資料的使用、權限及統計口徑需要另行確認。

## 實作與驗證狀態

已通過前端 TypeScript／正式建置與 Deno 型別檢查，並完成資料筆數與權限設定確認。沒有新增自動化功能測試。已開啟首頁確認呈現；實際登入、Google 模型呼叫、檔案匯入／匯出與業務答案，依本次要求由使用者手動驗證。

網站使用 GitHub Pages，後端維持 Supabase。部署與 Auth redirect 設定請參閱 `docs/deployment.md`，目前架構以本文件與 `docs/architecture.md` 為準。


## 2026-11-19 畫面調整

- 整合統計表還原三層表頭：當前員額（職員、聘僱、工友的預算／現員／缺額）與近十年四類核增，附來源標籤。機關欄固定，可橫向捲動；含所屬時分列機關、小計與合計。Excel 匯出同步採合併表頭。
- 橫條圖類別軸明確顯示機關名稱，數值軸依人數或百分比格式化。圖表、字體與操作控制放大。
- 「資料同步與備援」優先展示四種來源的同步燈號；目前全為示範綠燈，實際 API 尚未串接。手動匯入置於預設收合的備援區。
- 使用專案提供的 dgpa_logo_A.PNG，並恢復深藍與黃、綠、藍、橘的來源配色。

已通過前端建置、畫面表頭結構、類別篩選、所屬小計、同步燈號及備援入口檢查；Excel 匯出已在本機讀回確認合併表頭與數值。瀏覽器下載事件驗證未完成，未重複嘗試。
