# 對話上下文與額度計算

本文記錄目前 HumLibreChat 在聊天時如何組成 payload、如何計算 token，以及如何換算成 credits。重點以目前測試中的 Ollama / Gemma (`gemma4:e4b`) 為主。

## 1. Payload 會包含哪些內容

每次送出訊息時，後端不是只把使用者最新輸入的一句話送給模型，而是會先組出「本輪模型實際要看到的上下文」。

可能包含：

- system / developer 指示
- 目前使用者訊息
- 最近的歷史對話
- 工具呼叫與工具結果
- 網路搜尋結果
- 檔案抽取出的文字
- OCR PDF 轉出的文字
- 圖片內容或圖片引用資料，視 endpoint 與模型格式而定

因此同一段對話越長，payload 通常會越大。若前面有網路搜尋結果或長 PDF 文字，payload 增長會更明顯。

## 2. 上下文上限

目前程式內對 `gemma4:e4b` 的模型 context window 對照值是：

```text
gemma4:e4b = 131,072 tokens
```

來源是 `packages/api/src/utils/tokens.ts` 的 Gemma model token map。

但這不是每輪一定會完整用滿的實際裁切預算。Agent 初始化時會依下列順序決定 `maxContextTokens`：

1. 如果 agent / model parameters 有明確設定 `maxContextTokens`，使用該設定值。
2. 否則使用模型對照表的 context window。
3. 若找不到模型對照值，fallback 到 `18,000`。

在沒有手動設定 `maxContextTokens` 時，初始化還會保留輸出空間，實際寫入 agent 的預算是：

```text
Math.round((modelContextWindow - maxOutputTokens) * 0.9)
```

以目前 `gemma4:e4b` 且未設定 `maxOutputTokens` 來看：

```text
Math.round((131,072 - 0) * 0.9) = 117,965 tokens
```

所以目前可以視為：

- 模型對照上限：`131,072 tokens`
- HumLibreChat 預設實際上下文裁切預算：約 `117,965 tokens`

若之後在 agent、preset、通道或 model parameters 設定了 `maxContextTokens`，會覆蓋這個預設計算結果。

另外，Ollama 本身也可能受到模型 runtime 參數影響，例如 `num_ctx`。本文件描述的是 HumLibreChat 在送出前的上下文裁切與計費邏輯；若 Ollama 實際 `num_ctx` 更小，仍可能由 Ollama 端限制。

## 3. 超過上限時會怎麼處理

後端會從最新訊息往前收集能放進 context window 的訊息。

簡化後的規則是：

1. 優先保留最新訊息。
2. 能放入上限內的歷史訊息會被保留。
3. 超過上限的較舊訊息會被移出本輪 payload。
4. 如果有摘要策略，可能用 summary 取代較舊內容。
5. Agents 流程會額外嘗試截短 tool output，避免工具結果占滿上下文。

被裁掉的舊訊息不會出現在本輪 payload，也不會在本輪被計入 input tokens。

## 4. 額度計算的主要公式

目前額度消耗的核心是：

```text
本輪 spentCredits
= input_tokens * promptRate
+ output_tokens * completionRate
+ cache tokens 對應費率
```

其中：

- `input_tokens`：本輪實際送進模型的 payload token 數。
- `output_tokens`：模型本輪輸出的 token 數。
- `promptRate`：該模型輸入 token 的換算率。
- `completionRate`：該模型輸出 token 的換算率。

交易紀錄會拆成至少兩類：

- `prompt`：輸入成本
- `completion`：輸出成本

在交易資料中，消耗會以負數 `tokenValue` 紀錄。前端顯示的 spent credits 則是把同一則 assistant message 的 prompt / completion transaction 加總後取正值。

## 5. Gemma 目前的 credits 換算

目前內建費率中，Gemma 相關基本設定包含：

```text
gemma  prompt: 0.02, completion: 0.04
gemma3 prompt: 0.02, completion: 0.04
gemma4 prompt: 0.02, completion: 0.04
```

`gemma4:e4b` 會命中 `gemma4` 這個 pattern，因此若通道沒有提供更細的 endpoint token config，計算可視為：

```text
inputCost  = input_tokens  * 0.02
outputCost = output_tokens * 0.04
spentCredits = inputCost + outputCost
```

例：

```text
input_tokens  = 10,000
output_tokens = 500

inputCost  = 10,000 * 0.02 = 200
outputCost = 500 * 0.04 = 20

spentCredits = 220
```

如果通道設定中有針對該 model 的 `prompt` / `completion` 費率，會優先使用通道設定，而不是內建 `gemma4` 費率。

## 6. Payload 變大時是否會重複計費

會。計費依據是「本輪實際送進模型的 payload」。

假設對話逐步變長：

```text
第 1 輪：payload 約 1,000 input tokens
第 2 輪：payload 約 2,000 input tokens
第 3 輪：payload 約 5,000 input tokens
```

每一輪都會依當輪 payload 重新計算 input tokens。不是只計算使用者最新輸入的那一句。

所以：

- 同一對話越長，通常每輪 input cost 越高。
- 網路搜尋結果會增加後續 payload 大小。
- OCR PDF 文字會增加後續 payload 大小。
- 如果舊內容被裁掉，該舊內容不再計入本輪 input cost。

## 7. OCR PDF 與網路搜尋的特殊情況

網路搜尋本身不是 LLM token 消耗，但搜尋結果放進模型 payload 後，會成為 input tokens。

OCR PDF 的處理分兩段：

1. PDF 上傳時，如果一般文件 parser 抽不到文字，會用 Ollama vision OCR 嘗試讀取頁面。
2. OCR 得到的文字被當成檔案文字內容，後續送進模型時會算 input tokens。

目前 OCR 那次「讓 Gemma 看 PDF 頁面圖片抽文字」是檔案處理流程，不是一般聊天訊息的 transaction 記帳；但 OCR 結果一旦進入聊天上下文，就會依一般 input token 規則消耗 credits。

## 8. 前端訊息上的 credits 來源

前端每則 assistant message 旁邊顯示的 credits 來自該訊息的 `creditUsage.spentCredits`。

後端來源有兩種：

1. 回應流程中已經拿到 usage preview，直接附在 response message。
2. 若 response message 當下沒有 credit usage，後端會從 Transaction 聚合該 `messageId` 的 `prompt` / `completion` transaction，補寫回 message。

聚合邏輯是：

```text
spentCredits = Math.max(-sum(transaction.tokenValue), 0)
```

前端顯示時會做 compact 格式化：

- 小於 1000：四捨五入成整數，例如 `220 credits`
- 大於等於 1000：用 compact notation，例如 `1.2K credits`

滑過 credits badge 時，會再載入該訊息的使用明細，列出 prompt / completion 等交易項目、model、token 數與實際 tokenValue。

## 9. 目前需要注意的限制

- Gemma / Ollama 的實際 usage 取決於 provider 回傳與 LangChain callback 是否完整。若 usage metadata 不完整，系統可能退回本地 token 估算。
- 圖片與 vision 的 token 成本不一定和雲端模型 API 完全一致。
- 若 Ollama runtime 的 `num_ctx` 小於 HumLibreChat 的上下文預算，可能出現 Ollama 端先限制的情況。
- 長 PDF、長工具結果、連續網路搜尋會讓 input tokens 明顯增加，進而提高每輪 credits。

