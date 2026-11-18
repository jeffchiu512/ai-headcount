# Google AI API 獨立診斷

測試完成時間：2026-11-18 23:57:34（Asia/Taipei）。

從 Supabase Edge Runtime 直接呼叫 Google REST API，不經過 SQL 產生、資料庫查詢或圖表規劃。金鑰只在 Secrets 中讀取，測試結果不包含金鑰。

模型列表 API：HTTP 200，111 毫秒。兩個設定中的 Gemma 4 模型均存在於列表。

使用提示 `Reply exactly OK.`，輸出上限 128 tokens，不自動重試，單次等待 55 秒；兩個模型並行測試。

| 模型 | HTTP | 耗時 | 回應 |
| --- | --- | --- | --- |
| gemma-4-31b-it | 200 | 47,726 毫秒 | OK，finishReason=STOP |
| gemma-4-26b-a4b-it | 503 | 828 毫秒 | UNAVAILABLE：目前需求量過高 |

主模型回傳 promptTokenCount=5、candidatesTokenCount=1、thoughtsTokenCount=50。

結論：本次 API Key 與主模型可用，但延遲超過原本每次呼叫 20 秒的限制。備援模型在本次測試不可用。這次小提示的成功不代表大型 SQL 提示必定成功，也無法將 47.7 秒完全歸因於排隊或模型推論。

已將應用模型呼叫的單次上限改為 60 秒，整體預算改為 110 秒，以容納資料庫與回應處理時間。圖表規劃在預算不足或模型不可用時採預設呈現。

臨時診斷函式完成後關閉，停止讀取金鑰與呼叫模型。
