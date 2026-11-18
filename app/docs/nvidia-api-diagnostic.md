# NVIDIA NIM 切換與驗證

日期：2026-11-19（Asia/Taipei）。使用模型 `nvidia/nemotron-3-ultra-550b-a55b`。

## 獨立 API 測試

從 Supabase Edge Runtime 讀取 NVIDIA_API_KEY 與 NVIDIA_MODEL，直接呼叫固定的 NVIDIA Chat Completions 端點。金鑰僅在 Edge 環境讀取並用於 NVIDIA 驗證，不回傳至前端、日誌或測試結果。

- 短提示回覆 OK：HTTP 200，1,001 毫秒。
- JSON 提示：HTTP 200，3,422 毫秒，輸出有效 JSON。

## 查詢流程驗證

使用實際應用的 ModelClient、查詢語意提示與 SQL 驗證器，針對共用虛構資料測試「目前合計人力缺額率最高前五個機關」。

最後一輪耗時 26,866 毫秒，包含模型 SQL 產生、AST 驗證、唯讀查詢、基準 SQL 比對與圖表規格產生。

- 回傳 5 個機關。
- 機關排序與缺額率均與獨立 SQL 基準一致。
- 圖表 JSON 為水平長條圖，引用 agency_name 與 vacancy_rate，通過欄位檢查。
- 測試未讀取個人匯入資料，未驗證所有問法、使用者登入或瀏覽器匯出流程。

## 本次相容性修正

- 接受一個 SQL 結尾分號；內部多重指令仍被禁止。
- 提示明確禁止 CROSS JOIN，保留原來唯讀限制。
- 對可辨識的「前 K 名／個／大／筆」排名需求，以 AST 設定最外層 LIMIT，避免模型回傳 500 筆取代指定筆數。
- 前端顯示實際模型名稱，提示文字改為供應商中立。

供應商設定為 NVIDIA_API_KEY 存在時預設採 NVIDIA，可用 LLM_PROVIDER=nvidia 明確指定；NVIDIA 模式不自動向 Google 備援。

臨時診斷端點完成後關閉；無需再呼叫模型即可回傳 410。
