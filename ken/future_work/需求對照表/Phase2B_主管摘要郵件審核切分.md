# Phase 2B 主管摘要與郵件審核流程切分

## 目標

建立主管摘要審核的資料基礎，讓系統可以先產生可追蹤的審核批次，再逐步接上寄信、回覆解析、提醒與後續處理。

## 切分

### Slice 1：審核批次資料模型與產生 API

- 新增 `ManagerReviewBatch` 與 `ManagerReviewItem`。
- 以指定主管、部門與期間建立摘要批次。
- 從既有 `Transaction` 聚合出成員與 conversation 層級的審核項目。
- 產生不可猜測的 reply token hash，原始 token 不存入 DB。
- 同一主管、部門、週期與期間避免重複產生批次。

### Slice 2：寄送 adapter 與信件 template

- 建立 email sender 介面。
- 先支援 dry-run / disabled 模式，避免本機或測試環境誤寄。
- template 需包含批次摘要、項目摘要、通過 / 備查回覆方式與 Portal 詳細連結。

### Slice 3：回覆解析與狀態回寫

- 用 reply token 對應 batch 或 item。
- 解析通過 / 備查，寫回 batch/item 狀態。
- 備查先導向 Portal 詳細查詢，完整改善與結案流程留到稽核工作流。

### Slice 4：逾期提醒與追蹤

- 找出逾期未回覆 batch。
- 產生提醒紀錄與 admin notification event。
- 公司行事曆與上班日判斷暫不納入。

## 本次執行範圍

目前 2B 的直接審核、公開連結審核、寄送 adapter、手動提醒與狀態防呆已完成到可驗證階段：

- 新增 `POST /api/admin/manager-reviews/batches/:batchId/email/preview`。
- 新增 `POST /api/admin/manager-reviews/batches/:batchId/email/send`。
- 新增 `POST /api/admin/manager-reviews/batches/:batchId/response`，供測試介面模擬主管通過 / 備查回應。
- 新增 `POST /api/admin/manager-reviews/batches/overdue/scan`，手動掃描並標記逾期批次。
- 郵件預覽 API 保留在後端，前端主要操作改為直接審核與寄送郵件。
- 前端主管審核頁每個 batch 可按「寄送郵件」；預設 disabled，不會誤寄。
- 寄送 adapter 使用 `MANAGER_REVIEW_EMAIL_MODE=smtp` 作為實際寄送開關，搭配既有 `EMAIL_*` SMTP 設定；未啟用或設定不完整時只回傳未寄送原因，不修改 batch status。
- 實際寄送成功後會把 batch 標為 `sent`，並寫入 `sentAt` 與 `ActivityLog`。
- `MANAGER_REVIEW_EMAIL_MODE=smtp` 且寄送成功時，系統會在寄送前產生新的 review token，信件內放入帶 token 的主管審核連結，DB 只保存 token hash。
- 直接審核介面會顯示批次摘要，並提供通過 / 備查與備註欄位，供已登入系統的主管直接回應。
- 直接審核回應會把 batch 標為 `reviewed`，並把仍是 `pending` 的 item 更新成 `ok` 或 `not_ok`，同時寫入 `ActivityLog`。
- 新增公開 token API：
  - `GET /api/manager-reviews/batches/:batchId?token=...`：驗證 token 後回傳該批次摘要。
  - `GET /api/manager-reviews/batches/:batchId/items?token=...`：驗證 token 後回傳該批次審核項目明細。
  - `POST /api/manager-reviews/batches/:batchId/response?token=...`：驗證 token 後送出主管通過 / 備查與備註。
- 新增前端公開頁 `manager-review/:batchId?token=...`，供主管從信件連結開啟摘要與明細，並送出回應。
- token-based 回應會拒絕已取消或已審核的 batch，避免主管連結重複覆寫結果。
- 後端寄送審核郵件 API 會拒絕已取消或已審核的 batch，避免直接呼叫 API 造成狀態倒退或重發不合理通知。
- 前端主管審核頁新增「檢查逾期」按鈕，會將 `generated` / `sent` 且 `dueAt < now` 的批次標記為 `overdue`，並以 modal 顯示結果。
- 逾期掃描會寫入 `ActivityLog`，記錄 matched / modified 數量與掃描時間。
- 列表已顯示 `dueAt`，讓管理者能直接判斷批次到期時間。
- 新增 `POST /api/admin/manager-reviews/batches/:batchId/reminder/email/send`，可對 `overdue` 批次手動寄送提醒郵件。
- 提醒郵件沿用 `MANAGER_REVIEW_EMAIL_MODE=smtp` 與既有 SMTP 設定；未啟用時只回傳未寄送原因，不修改批次。
- 提醒郵件寄送成功後會寫入 `reminderSentAt`，並更新 review token hash，讓信件連結仍可直接進入主管審核頁。
- 前端主管審核頁在逾期批次上提供「寄送提醒」按鈕，操作結果統一用 modal 顯示，列表會顯示提醒寄送時間。
- 新增 `GET /api/admin/manager-reviews/batches/:batchId/items`，以 cursor 分頁查詢批次底下的 `ManagerReviewItem` 明細。
- 直接審核視窗與公開主管審核頁新增審核項目明細表，顯示使用者、conversation、交易數、token value、input/write/read tokens、風險與項目狀態。
- 明細表支援分頁與重新整理，避免未來審核項目增加時一次載入過多資料。
- 前端操作結果與防呆提示使用 modal，不再把寄送、提醒、送出結果插在頁面區塊內顯示。
- 管理端建立批次已改為「建立」按鈕開啟 modal；列表上方區域只保留篩選與搜尋條件。
- 主管審核列表已支援部門、主管、狀態、週期、主管回應、審核期間交集查詢與清除條件。
- 重複建立相同部門、主管、週期與審核期間的批次時，前端會以可讀文案提示既有批次，不再只顯示 HTTP 409。
- 手動檢查逾期若找到逾期批次，前端會切到逾期篩選，方便管理者直接查看已逾期資料。
- 列表卡片補上部門、主管、週期與主管回應狀態，方便對照目前搜尋條件。

## 狀態規則

- `generated`：已產生審核批次，可寄送審核郵件，可直接審核；若有 `dueAt` 且已逾期，掃描後可轉為 `overdue`。
- `sent`：已寄送審核郵件，可再次寄送審核郵件，可由公開連結或直接審核送出回應；若有 `dueAt` 且已逾期，掃描後可轉為 `overdue`。
- `overdue`：已逾期未審核，可寄送提醒郵件，也仍可由公開連結或直接審核送出回應。
- `reviewed`：已送出主管回應，不可再寄送審核郵件、提醒郵件或覆寫回應；畫面只保留結果與備註檢視。
- `cancelled`：已取消，不可寄送審核郵件、提醒郵件或送出回應。

## 2B 收尾判斷

就目前系統目標而言，2B 可視為完成主要閉環：

- 管理者可建立批次。
- 主管可在系統內直接審核。
- 主管可透過公開 token 連結查看摘要與明細並送出回應。
- 管理者可寄送審核郵件與手動提醒。
- 系統可手動掃描逾期批次。
- 管理者可依部門、主管、狀態、週期、主管回應與審核期間搜尋批次。
- 回應結果、備註、寄送時間、提醒時間與操作紀錄均可追蹤。

以下項目保留為後續 phase，不阻擋 2B 關閉：

- 郵件收件回覆解析。
- 自動排程產生審核批次。
- 自動排程提醒。
- 通知中心與 admin notification event。
- 公司行事曆、上班日與假日判斷。
- 備查後續案件、指派、複核與簽核結案流程。

## 用詞與後續處理備註

- 目前資料狀態仍使用 `ok` / `not_ok`，前端顯示為「通過」/「備查」，避免此階段修改 DB enum 與 API payload。
- 「備查」目前只代表主管要求留下備註供後續查看，尚未觸發處理案件、指派、複核或簽核。
- 未來需要針對「備查」建立後續處理流程，例如建立待處理案件、指派承辦、追蹤處理狀態、複核與簽核結案；目前先維持「備查」用詞與現有狀態行為。
- 若產品語意要表達「需要有人處理」，建議後續評估改用「待查」或「需追蹤」；「備查」較偏向留存供查閱，不一定表示異常。
