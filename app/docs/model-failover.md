# Google 主服務與 NVIDIA 備援驗證

日期：2026-11-19（Asia/Taipei）。

從 Supabase Edge Runtime 使用 Secrets 執行固定 JSON 小提示，未讀取或傳送個人資料。測試金鑰不回傳前端或日誌。

| 項目 | 結果 | 耗時 |
| --- | --- | --- |
| Google `gemini-4-hydrogen` | 有效 JSON | 1,811 ms |
| NVIDIA `nvidia/nemotron-3-ultra-550b-a55b` | 有效 JSON | 891 ms |
| Google 故意使用不存在的模型 → NVIDIA | 自動備援成功 | 1,506 ms |

本機路由測試涵蓋主服務成功、直接 NVIDIA、Google 503／403／429／404／逾時／無效 JSON／截斷輸出、切換後維持 NVIDIA、兩者失敗、內容拒絕不跨服務重試與整體等待上限。執行方式：`node app/scripts/test-model-routing.mjs`。

臨時診斷端點已關閉，固定回應 410，不再讀取模型金鑰或呼叫 API。以上小提示測試不等同所有自然語言問法或使用者個人資料的完整驗證。
