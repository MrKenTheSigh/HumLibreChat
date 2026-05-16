# Gemma / Ollama 後續工作紀錄

## 目前採用方向

- 預設建議模型：`gemma4:e4b`
- 使用通道：既有 `Ollama` 通道
- Runtime endpoint：`ollama`
- Base URL：`http://localhost:11434/v1`

環境確認：

- 使用者在 `cv_2204` WSL 內直接執行 `curl http://localhost:11434/api/tags` 可讀到 `gemma4:e4b`、`llama3.1:latest` 等模型。
- 因此目前 HumLibreChat backend 若同樣跑在 `cv_2204`，Ollama 通道維持 `localhost:11434/v1` 是正確設定。
- Codex sandbox 內直接 `curl localhost:11434` 失敗，判定為 Codex 執行環境限制或網路命名空間差異，不應作為修改通道 baseURL 的依據。

選擇 `gemma4:e4b` 的原因：

- Ollama 上 `gemma4:latest` 對應 E4B，大小約 9.6GB，適合先作為本機測試主力。
- Gemma 4 相較 Gemma 3 更偏向 reasoning、agentic workflows、coding、multimodal understanding。
- Gemma 4 在 Ollama 頁面標示支援 vision / tools / thinking / audio 等能力，但本系統是否能完整使用，仍取決於目前 OpenAI-compatible custom endpoint 路徑是否支援對應 payload。

## MTP

Google 已釋出 Gemma 4 的 Multi-Token Prediction drafters，方向是透過 speculative decoding 降低延遲。這不是只在本系統設定一個 model 名稱就能啟用的功能，需要 runtime 支援。

目前本系統的 Ollama 通道是走 OpenAI-compatible `/v1` custom endpoint。若 Ollama 沒有透過 OpenAI-compatible API 暴露 MTP/speculative decoding 參數，本系統暫時無法直接控制 MTP。

後續需要確認：

- Ollama 當前版本是否支援 Gemma 4 MTP。
- 支援時，是透過模型 manifest 自動啟用，還是需要 API options。
- 若需要 API options，本系統通道 schema 需新增可控的 runtime options，例如 speculative / mtp 相關參數。
- 若只支援 llama.cpp 或 vLLM，需評估是否另開通道 provider，而不是走 Ollama。

## 待驗證能力

- 一般聊天：應可透過 Ollama OpenAI-compatible endpoint 運作。
- 記憶：本系統既有機制處理，與模型無強耦合。
- 圖片：Gemma 4 模型支援 vision，但本系統 custom/OpenAI-compatible 路徑是否能把附件轉成 Ollama 可接受格式需要實測。
- 網路搜尋：要確認本系統工具流程是否能對 custom endpoint 生效，以及 Gemma 4/Ollama 是否能正確遵守 tool call 格式。
- 檔案：要分開確認「檔案內容進上下文」與「file search / tools」兩條路徑。

## 參考

- Google Gemma 4: https://blog.google/innovation-and-ai/technology/developers-tools/gemma-4/
- Google Gemma 4 MTP: https://blog.google/innovation-and-ai/technology/developers-tools/multi-token-prediction-gemma-4/
- Ollama Gemma 4: https://ollama.com/library/gemma4
- Ollama Gemma 3: https://ollama.com/library/gemma3
