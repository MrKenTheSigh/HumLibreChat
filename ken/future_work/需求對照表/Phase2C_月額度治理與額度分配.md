# Phase 2C 月額度治理與額度分配

## 目標

建立公司、部門、子部門與個人層級的當期額度治理，讓既有模型費率換算後的用量不只被事後查詢，也能被當期監控、阻擋、提醒、分配、追加與審核。

這個 phase 不是取代既有個人 plan / starting credits，而是把它提升成企業治理模型：

- 公司有每期總額度。
- 公司額度可分配給第一層部門。
- 部門可把自己的額度分配給子部門或個別員工。
- 每個層級用完就停，但可依權限提出或核准當期額外授予。
- 主管審核從「看已發生用量」調整為「審核額度使用、異常、超額與追加授予」。
- 操作紀錄需涵蓋額度設定、分配、追加、阻擋、提醒與審核結果，作為未來稽核流程資料來源。

## 已確認產品規則

- 額度單位沿用目前系統的 credit / token value：模型 API 回報 token 後，依系統設定費率換算成消耗額度。
- 現有個人額度用完會直接阻擋；本 phase 保留阻擋規則，並新增接近用完時的提醒。
- 部門或個人用完所屬額度後不可自動借用兄弟部門額度，也不視為向公司借用。
- 額外額度必須寫明理由，並由有權限的上級主管或管理者授予。
- 最高管理者可設定公司整體額度，並分配給下一層部門。
- 部門主管可在自己部門額度內分配給子部門或個人。
- 不管是原始分配或額外授予，額度都只對當期有效。
- 當期目前以本系統所在時區計算，但要保留公司結算起始日可配置的彈性。
- Plan 仍可決定可用 model 與個人基礎額度；未來可以配合新額度模型大改，但需保留既有資料遷移路徑。

## 需要建立的領域模型

### `QuotaPeriod`

代表一個公司額度期間。

建議欄位：

- `periodKey`：例如 `2026-04` 或依公司結算日產生的穩定 key。
- `timezone`：預設使用系統時區。
- `periodStart` / `periodEnd`。
- `status`：`draft`、`active`、`closed`。
- `closePolicy`：保留公司結算日與未來封帳規則。

設計重點：

- 所有額度帳戶與用量都要掛到明確期間，不從當下日期臨時計算。
- 期間關閉後不可再任意修改分配，只允許修正型調整並留下操作紀錄。

### `QuotaAccount`

代表公司、部門或使用者在特定期間的額度帳戶。

建議欄位：

- `periodId`
- `scopeType`：`company`、`department`、`user`
- `scopeId`：department id 或 user id；公司層級可為固定值。
- `parentAccountId`：部門或使用者額度的上層帳戶。
- `baseAllocatedCredits`
- `extraGrantedCredits`
- `usedCredits`
- `reservedCredits`
- `remainingCredits`
- `warningThresholds`：例如 80%、90%、100%。
- `hardLimitEnabled`：第一版預設 true。
- `bufferCredits`：可配置緩衝額度，仍需明確授權。

設計重點：

- `remainingCredits` 可由 ledger 彙總而來，也可做快照欄位；若做快照，ledger 仍是權威來源。
- 公司、部門、使用者都用同一套 account 概念，避免三套額度邏輯。

### `QuotaLedgerEntry`

不可變流水帳，記錄額度變動。

建議欄位：

- `periodId`
- `accountId`
- `entryType`：`allocation`、`grant`、`usage`、`refund`、`adjustment`、`warning`、`block`
- `amount`
- `balanceAfter`
- `sourceType`：`transaction`、`admin_action`、`manager_action`、`system`
- `sourceId`
- `reason`
- `actorUserId`
- `createdAt`

設計重點：

- 用量扣抵、額外授予、手動調整與阻擋都要能追溯。
- `Transaction` 仍保留原始用量資料；`QuotaLedgerEntry` 是額度治理帳。

### `QuotaAllocation`

記錄上層帳戶分配給下層帳戶的額度。

建議欄位：

- `periodId`
- `fromAccountId`
- `toAccountId`
- `amount`
- `status`：`active`、`replaced`、`cancelled`
- `reason`
- `actorUserId`

設計重點：

- 公司分配給部門、部門分配給子部門、部門分配給使用者，都走同一張表。
- 修改分配不應覆寫舊值，應產生新的 ledger 與 allocation 記錄。

### `QuotaGrant`

記錄額外授予額度。

建議欄位：

- `periodId`
- `targetAccountId`
- `requestedByUserId`
- `approvedByUserId`
- `amount`
- `reason`
- `status`：`requested`、`approved`、`rejected`、`cancelled`
- `expiresAt`：預設等於當期結束。

設計重點：

- 第一版可先做管理者直接授予，不必先做完整申請簽核。
- 但資料模型要保留 request / approve 狀態，避免後續重做。

## 額度判斷流程

### 對話送出前

第一版可先維持既有個人額度阻擋，新增部門 / 公司剩餘額度檢查。

建議流程：

1. 解析使用者。
2. 解析目前 `QuotaPeriod`。
3. 解析使用者帳戶與所屬部門 ancestry 帳戶。
4. 若任一硬限制帳戶已無可用額度，阻擋請求。
5. 若達提醒門檻，回傳可顯示提醒的 quota summary。

注意：送出前只能做預估或已知餘額檢查，實際扣抵仍以模型回傳 token 後的換算結果為準。

### 用量寫入後

目前用量會寫入 `Transaction`，本 phase 應在 transaction 成功後同步寫入 quota ledger。

建議流程：

1. 依 transaction 的 credit / token value 建立使用者 `usage` ledger。
2. 同步扣抵使用者帳戶。
3. 向上扣抵直屬部門、父部門直到公司帳戶。
4. 若扣抵後超過提醒門檻，寫入 warning 類型 ledger 或通知。
5. 若超過硬限制，記錄 block 或 overage 狀態，供管理者追蹤。

### 併發處理

額度扣抵必須避免多個請求同時通過造成超用。

建議：

- 使用 MongoDB transaction 或原子條件更新。
- 扣抵時以 `remainingCredits >= amount` 作為條件。
- 若扣抵失敗，回滾或標記 pending correction。
- 第一版若無法精準預估 completion 用量，至少要保證 transaction 寫入後的帳務修正可追蹤。

## 權限與範圍

### 最高管理者

可操作：

- 建立 / 啟用當期公司額度。
- 設定公司總額度。
- 分配公司額度給第一層部門。
- 查全公司用量、分配、追加、阻擋與提醒紀錄。
- 對任何部門或使用者授予當期額外額度。

### 部門主管

可操作：

- 查自己部門與可管理子部門的額度。
- 在自己部門剩餘額度內分配給子部門或個人。
- 對自己管理範圍內的帳戶授予額外額度，但授予來源仍扣自己的部門額度。
- 查看自己範圍內的用量、提醒、阻擋與主管審核批次。

待確認延伸：

- 主管範圍是否包含所有 descendant departments，這會影響 Usage、Manager Review 與 Quota API 的 scope helper。
- 第一版可以明確設定為「包含子部門」或「只限直屬部門」，但後端 policy 必須一致。

### 一般使用者

可操作：

- 查看自己的當期可用額度、已用額度、剩餘額度與重置時間。
- 接近用完時看到提醒。
- 超額時看到阻擋原因與可申請額外額度的入口。

## 對現有 Plan / 使用者點數的影響

目前 plan 已經包含：

- 可用 model / entitlement。
- 指派給使用者的基礎點數。
- 管理者可直接為使用者增加點數。

建議調整方向：

- Plan 保留為「權益模板」：決定 model access 與個人基礎額度。
- `QuotaAccount` 成為當期額度的實際執行來源。
- 指派 plan 時，不直接只加到 user balance，而是產生當期 user quota allocation 或 grant。
- 管理者直接加點數的操作改為 `QuotaGrant`，並保留理由、授予者、期間與操作紀錄。

遷移策略：

- 第一階段先把既有個人 balance 顯示成 user-level quota summary。
- 第二階段新增 department / company quota account，但不立即阻擋。
- 第三階段啟用 department / company hard limit。
- 第四階段把直接加點數功能導向 `QuotaGrant`。

## 對主管審核的影響

目前 `ManagerReviewBatch` 是針對指定期間的 transaction 摘要，主管只能事後看用量並送出通過 / 備查。

導入月額度治理後，主管審核應改為審核以下內容：

- 部門或使用者是否接近額度上限。
- 是否發生額度阻擋。
- 是否有額外授予。
- 是否有異常高用量或不合理模型使用。
- 備查是否需要後續追蹤、調整額度、限制使用或建立稽核案件。

建議調整：

- `ManagerReviewBatch` 增加 quota context snapshot：
  - `periodId`
  - `quotaAccountId`
  - `allocatedCredits`
  - `usedCredits`
  - `remainingCredits`
  - `grantCount`
  - `blockedCount`
  - `warningCount`
- `ManagerReviewItem` 增加 quota signal：
  - 個人分配額度。
  - 個人已用額度。
  - 是否接近上限。
  - 是否曾被阻擋。
  - 是否有額外授予。
- 批次產生不應再任意選時間區間，應以已關閉或已穩定的 `QuotaPeriod` / 子週期為基礎。
- 「備查」後續應能建立處理項目，連到未來稽核 / 異常處理流程。

## 對操作紀錄與未來稽核的影響

ActivityLog 需要新增或覆蓋以下 resource / action：

- `quota_period.create`
- `quota_period.activate`
- `quota_period.close`
- `quota_account.create`
- `quota_allocation.create`
- `quota_allocation.replace`
- `quota_grant.request`
- `quota_grant.approve`
- `quota_grant.reject`
- `quota_usage.warning`
- `quota_usage.block`
- `manager_review.quota_review`
- `manager_review.noted_for_follow_up`

操作紀錄只記錄發生了什麼；真正的稽核或後續處置仍應放在未來 Audit Case / Review Workflow。

## API 規劃

### 管理端

- `GET /api/admin/quota/periods`
- `POST /api/admin/quota/periods`
- `POST /api/admin/quota/periods/:periodId/activate`
- `POST /api/admin/quota/periods/:periodId/close`
- `GET /api/admin/quota/accounts`
- `GET /api/admin/quota/accounts/:accountId`
- `POST /api/admin/quota/allocations`
- `POST /api/admin/quota/grants`
- `POST /api/admin/quota/grants/:grantId/approve`
- `POST /api/admin/quota/grants/:grantId/reject`
- `GET /api/admin/quota/ledger`
- `GET /api/admin/quota/summary`

### 使用者端

- `GET /api/balance` 擴充 quota summary。
- 或新增 `GET /api/quota/current`，避免把公司 / 部門治理資訊塞進既有 balance controller。

建議第一版仍讓 `/api/balance` 回傳使用者可見 summary，管理端細節走新的 quota API。

## 前端規劃

### 組織圖核心方向：Age of Graph

後續先以組織圖作為額度治理主入口，不再只把組織圖視為實驗輔助畫面。

核心原則：

- 公司、部門、子部門與使用者都在同一張組織圖上呈現。
- 額度分配、額度申請、申請審核與可用額度檢視都從圖上的節點進入。
- 後端必須依登入者權限決定可載入的節點範圍與可執行的操作，不能只靠前端隱藏按鈕。
- 組織圖需要區分「可檢視」、「可調整組織」、「可分配額度」、「可審核申請」等權限。

角色視角：

- `ADMIN`：可看全公司，可建立期間、分配公司額度、調整組織、審核或代處理所有申請。
- `MANAGER`：可看自己部門以下 subtree，可分配自己部門額度給直屬子部門或直屬使用者，可審核下層額度申請，也可向上申請額度。
- `USER`：可看自己的額度摘要、期間、上層部門與使用狀態，可向主管申請更多額度。
- `AUDITOR`：以檢視為主，不可分配、調整組織或審核，除非後續明確授權。

優先流程：

1. 主管管理自己部門底下的額度分配，並可向上級申請額度。
2. 使用者檢視自己的額度，並可向上申請額度。
3. 主管審核來自下層部門或使用者的額度申請。
4. 組織圖 API 依權限載入不同資料範圍與功能能力。
5. 額外授予額度降級為最高管理者的特殊修正工具；一般多要額度改走向上申請。

需要新增的主要 domain：

- `QuotaRequest`：額度申請，包含期間、申請者、目標帳戶、向哪個上層帳戶申請、數量、理由、狀態、審核者與審核備註。
- Scope resolver：回傳目前使用者在組織圖中可見節點、可分配來源、可分配目標、可審核申請與可調整組織範圍。

建議下一步 slice：

1. 建立 `QuotaRequest` 後端 model / API / ActivityLog。
2. 改組織圖 API 支援權限 scope。
3. 在組織圖節點上加入「申請額度」與「審核申請」入口。
4. 重新定位 `QuotaGrant`，保留但從主要 UI 隱藏，作為管理者修正工具。

### Admin Console

新增「額度」管理頁，包含：

- 當期公司總額度。
- 部門額度樹。
- 分配狀態。
- 已用 / 剩餘 / 警戒 / 阻擋。
- 額外授予紀錄。
- 操作紀錄入口。

### Department / Manager View

主管看到：

- 自己部門當期額度。
- 子部門與成員額度分配。
- 接近上限與已阻擋清單。
- 額外授予入口。
- 主管審核批次與備查追蹤。

### User View

使用者看到：

- 當期個人額度。
- 已用、剩餘、重置時間。
- 接近上限提醒。
- 阻擋時的原因與申請額外額度入口。

## 建議切分

### Slice 1：資料模型與期間基礎

- 新增 `QuotaPeriod`、`QuotaAccount`、`QuotaLedgerEntry`。
- 建立當期解析 helper。
- 支援公司結算日起始日與系統時區。
- 建立 model tests。

### Slice 2：公司與部門分配 API

- 建立 company / department quota account。
- 支援公司分配給第一層部門。
- 支援部門分配給子部門或個人。
- 所有異動寫入 ActivityLog。

### Slice 3：用量扣抵與提醒

- 在 transaction 寫入後建立 quota ledger。
- 扣抵 user、department ancestry、company account。
- 產生 80% / 90% / 100% 提醒。
- 保留既有個人阻擋，新增 department / company hard limit。

### Slice 4：前端額度管理

- Admin 額度頁。
- Manager 額度頁。
- User quota summary。
- 接近用完與阻擋提示。

### Slice 5：主管審核整合

- Manager review batch 改以 quota period / closed period 產生。
- 批次摘要加入 quota snapshot。
- 備查與額外授予、阻擋、異常用量連動。

### Slice 6：追加額度申請流程

- 使用者或主管可提出額外額度申請。
- 上級主管或管理者可核准 / 駁回。
- 當期有效，期末失效。
- 寫入 ActivityLog，並保留給未來 Audit Case。

## 驗收標準

- 管理者可建立當期公司總額度。
- 管理者可把公司額度分配給部門。
- 部門主管可把部門額度分配給子部門或個人。
- 使用者用量會扣抵個人、部門 ancestry 與公司額度。
- 任一硬限制帳戶無剩餘額度時，使用者請求會被阻擋。
- 接近額度上限時，使用者與主管可看到提醒。
- 額外授予需要理由，且只在當期有效。
- 額度設定、分配、追加、阻擋、提醒與主管審核結果都會產生 ActivityLog。
- 主管審核可以看到 quota context，而不是只看到 transaction 數量摘要。

## 暫不納入

- 兄弟部門借用額度。
- 跨期額度結轉。
- 複雜多公司 / 多 tenant 結算規則。
- 完整申請簽核 BPM。
- 不可竄改帳本或外部財務系統串接。

## 開工前待定

- 主管 scope 是否預設包含所有子部門。
- 部門額度的緩衝額度是否一開始就啟用，或先只保留欄位。
- 額度提醒門檻是否全公司共用，或可由部門自訂。
- 是否將「直接加點數」在第一版就改名為「額外授予額度」。
