# HumLibreChat 需求補齊 Phase 計畫

評估日期：2026-04-21

## 目的

本文件承接 `HumLibreChat_需求差異分析.md`，把 AI Portal 需求缺口轉成後續可執行的 phase。原則是先補資料模型與權限基礎，再做主管流程、稽核、模型治理與營運監控；避免先做零散 UI，導致後續缺少可稽核的資料來源。

## 執行原則

- 新 backend code 放在 `packages/api`，`api` 只做 thin route wrapper。
- shared schema/model 放在 `packages/data-schemas`。
- 前後端 shared type、endpoint、data-service 放在 `packages/data-provider`。
- 前台與管理 UI 放在 `client`，所有顯示文字補 English locale key。
- 每個 phase 都需要最小可驗證測試，不把「有畫面」視為完成。
- 若同一需求會跨 phase，先建立資料契約與寫入點，再逐步補查詢與 UI。

## Phase 總覽

| Phase | 目標 | 主要需求 | 交付定位 |
|---|---|---|---|
| 1A | 組織、部門、主管基礎 | R01-R04、R20-R23、R60-R61 | 讓主管權限與部門報表有資料基礎 |
| 1B | 管理角色與範圍授權 | R01-R06、R60-R63、R68、R90-R92 | 把現有 RBAC 擴到企業角色與 scope |
| 1C | 操作紀錄基礎 | R26-R29、R58-R59、R66、R92 | 建立 ActivityLog 寫入與查詢 |
| 2A | 部門用量與主管 dashboard | R20-R23、R56-R57 | 先做可查詢、可下載的部門用量 |
| 2B | 主管摘要與郵件審核流程 | R14-R19、R75 | 建立排程、寄送、回覆解析、提醒 |
| 2C | 月額度治理與額度分配 | R20-R23、R56-R57、R75、R90-R92 | 建立公司、部門、子部門與個人的當期額度治理 |
| 3A | 敏感資料與告警規則 | R12、R25、R27、R63、R72、R89-R92 | 建立敏感規則、告警事件與處置追蹤 |
| 3B | 稽核中心 | R26-R29、R58-R59、R66 | 整合告警、對話、附件、使用者與處置狀態 |
| 4A | 模型治理 | R34、R39-R49 | 模型主檔、版本、風險、fallback、灰度 |
| 4B | 設定治理 | R31-R38、R73、R81 | 設定草稿、送審、核准、生效、回滾 |
| 5A | 健康監控與營運報表 | R50-R57、R64-R65、R74-R75 | 健康儀表板、趨勢、排程通知 |
| 5B | 維運治理與驗收文件 | R69-R70、R76-R88 | 權限盤點、DR、備份、文件與驗收包 |

## Phase 1A：組織、部門、主管基礎

### 目前進度

狀態：已完成第一版實作。

- 已新增 `Department` schema/model/type，並擴充 `User` 的 `departmentId`、`departmentAssignedAt`。
- 已新增 admin departments API：列表、明細、建立、更新、停用。
- 已新增 user department assignment API：指派與清除使用者部門。
- 已補 data-provider types、endpoints、data-service、QueryKeys、React Query hooks。
- 已補 Client admin UI：Departments 頁、Department form、User detail 的部門指派卡片。

已執行驗證：

- `packages/data-schemas`: `npx jest src/models/department.spec.ts --runInBand`
- `packages/data-schemas`: `npm run build`
- `packages/api`: `npx jest src/admin/departments.spec.ts src/admin/users.spec.ts --runInBand`
- `packages/api`: `npm run build`
- `api`: `npx jest server/routes/__tests__/admin-departments.spec.js server/routes/__tests__/admin-users.spec.js --runInBand`
- `api`: `node --check` routes/server touched JS files
- repo root: `npm run build:data-provider`
- repo root: `git diff --check`

注意：`client` 的 `npm run typecheck` 目前會因既有全專案型別問題失敗；本次輸出中沒有指向新增 Departments UI 或使用者部門指派元件的錯誤。

### 目標

先建立部門與主管關係，讓後續主管檢視、部門報表、ABAC 條件與操作紀錄可以引用同一套資料。

### 建議範圍

- `Department` schema：部門代碼、名稱、狀態、父部門、主管 user id、排序、建立/更新時間。
- `User` 擴充：department id、job title / rank 可先預留欄位，但第一版只實作 department。
- Admin API：部門列表、建立、更新、停用、指派主管。
- User 管理 API：支援指派/清除使用者部門。
- Data provider：types、endpoints、data-service、React Query hooks。
- Client admin UI：新增 Departments 頁，並在 User detail 顯示/更新部門。

### 不納入

- 複雜組織樹權限繼承。
- 多主管、多部門兼任。
- AD/HR 系統同步。
- 主管 dashboard 與報表。

### 驗收標準

- Admin 可建立部門並指派主管。
- Admin 可把使用者指派到部門。
- API 回傳資料使用穩定 id，不依賴部門名稱做授權。
- 停用部門後不可再新指派，但既有使用者資料保留以供稽核。

## Phase 1B：管理角色與範圍授權

### 目前進度

狀態：已完成第一版角色與部門 scope 基礎。

- 已新增 `SystemRoles.MANAGER` 與 `SystemRoles.AUDITOR`，並納入內建 non-deletable role defaults。
- 已補齊 system role 初始化與 admin roles fallback：
  - `initializeRoles()` 會初始化所有 `SystemRoles`，不再只建立 `ADMIN` / `USER`。
  - Admin roles API 會把尚未寫入 DB 的內建角色以 default role 顯示，避免既有環境啟動前看不到 `MANAGER` / `AUDITOR`。
  - 使用者角色指派允許內建 system role default，避免 DB 尚未完成 seed 時無法指派。
- 已新增 `requireAdminDataAccess` middleware，讓讀取型管理資料可開放給 `ADMIN`、`AUDITOR`、`MANAGER`。
- 已新增 admin data scope helper：
  - `ADMIN` / `AUDITOR` 可查全域 conversation / usage 資料。
  - `MANAGER` 必須有 `departmentId`，且 conversation / usage 查詢會被限制在同部門使用者。
  - `MANAGER` 開啟非本部門 conversation detail/messages 時回傳 404，避免洩漏資源存在性。
- `/api/admin/conversations` 與 `/api/admin/usage` 已改用讀取型 admin-data access。
- Client admin console 已允許 `MANAGER` / `AUDITOR` 進入，但只顯示 Audit 群組（Conversations / Usage）；其他管理功能仍由 backend 保持 `ADMIN` only。

已執行驗證：

- `packages/data-provider`: `npm run build`
- `packages/data-provider`: `npx jest src/roles.spec.ts --runInBand`
- `packages/data-schemas`: `npm run build`
- `packages/api`: `npx jest src/admin/conversations.spec.ts src/admin/usage.spec.ts src/middleware/admin.spec.ts --runInBand`
- `packages/api`: `npx jest src/admin/roles.spec.ts src/admin/users.spec.ts --runInBand`
- `packages/api`: `npm run build`
- `api`: `npx jest server/routes/__tests__/admin-conversations.spec.js server/routes/__tests__/admin-usage.spec.js --runInBand`
- `api`: `node --check api/server/routes/admin/conversations.js`
- `api`: `node --check api/server/routes/admin/usage.js`
- repo root: `git diff --check`

注意：目前第一版只把部門 scope 套到 conversation / usage 讀取面，且 `MANAGER` 只看自己的 `departmentId` 同部門使用者，不包含子部門；roles UI 的可視化說明、Manager dashboard、department filter、多層部門繼承 scope 與完整 ABAC policy engine 仍留在後續 phase。

### 目標

把現有 `ADMIN` / `USER` 與自訂 role 擴成符合企業需求的角色語意，並先完成主管「本部門」資料範圍限制。

### 建議範圍

- 預設角色：`USER`、`MANAGER`、`AUDITOR`、`ADMIN`。
- Role seed / migration：避免破壞既有自訂 role。
- Scope helper：依使用者 role 與 department 計算可查詢 user ids / department ids。
- Admin conversation / usage API 增加 department filter。
- Manager route guard：主管只可查本部門或直屬範圍資料。
- 初版權限矩陣文件。

### 不納入

- 完整 ABAC policy engine。
- 例外授權申請與審批。
- 跨專案、事件期間、資料分類授權。

### 驗收標準

- `MANAGER` 無法查非本部門使用者對話與用量。
- `AUDITOR` 可查平台稽核資料，但不可修改平台設定。
- `ADMIN` 保留完整管理權限。
- 所有新增 API 權限檢查在 backend 強制執行，不只依賴 UI 隱藏。

## Phase 1C：操作紀錄基礎

### 第一版實作分析

狀態：已完成第一版 ActivityLog 基礎。

第一版先建立可落地的 ActivityLog domain，不先追求不可竄改儲存或完整事件覆蓋。優先順序如下：

- 資料層：新增 `ActivityLog` schema/model/type，欄位涵蓋 actor、role、department、resource、action、result、metadata、request ip/user agent 與時間索引。
- Backend helper：新增集中 writer，讓 route 不直接組 collection payload；writer 不應阻斷原本管理操作，寫入失敗只記錄 server log。
- Admin 查詢 API：提供 cursor pagination 與基本 filter，先讓 `ADMIN` / `AUDITOR` 能查 ActivityLog。
- 第一批接入點：先接入高價值且變更面可控的管理操作，例如 role、department、user role/department assignment、admin conversation read。
- 延後項目：hash chain / WORM、SIEM adapter、完整前端稽核中心、所有使用者事件接入。

目前已完成：

- 已新增 `ActivityLog` schema/model/type，並掛入 `createModels()`。
- 已新增集中 activity-log writer：可從 Express request 帶入 actor、role、department、request ip、user agent，寫入失敗只記錄 server log，不阻斷原管理操作。
- 已新增 Admin activity-log list API：`GET /api/admin/activity-logs`，支援 cursor pagination 與 actor、resource、action、result、createdAt filter。
- 已補 data-provider endpoint/type/data-service/query key。
- 已新增 Client admin Activity Logs 頁：
  - 操作群組新增 `Activity Logs` / `操作紀錄`。
  - 只對 `ADMIN` / `AUDITOR` 顯示；`MANAGER` 仍只看到 Conversations / Usage。
  - 支援 actor、resource type/id、action、result、createdAt filter 與 cursor pagination。
- 已明確保留未來工作：
  - 真正的稽核動作、異常處理、複核與簽核流程，不納入目前 `ActivityLog`；後續需以獨立 audit case / review workflow domain 實作。
- 已接入第一批管理操作：
  - role create / update / delete。
  - department create / update / disable。
  - user role assignment。
  - user department assignment。

已執行驗證：

- `packages/data-schemas`: `npm run build`
- `packages/data-schemas`: `npx jest src/models/activityLog.spec.ts --runInBand`
- repo root: `npm run build:data-provider`
- `client`: locale JSON parse validation
- `client`: `npm run typecheck` 已執行，但目前仍因既有全專案型別問題失敗；輸出未指向新增的 Activity Logs 頁或 admin activity-log query hook。
- `packages/api`: `npx jest src/admin/activityLogs.spec.ts src/admin/roles.spec.ts src/admin/departments.spec.ts src/admin/users.spec.ts --runInBand`
- `packages/api`: `npm run build`
- `api`: `npx jest server/routes/__tests__/admin-activity-logs.spec.js --runInBand`
- `api`: `node --check api/server/routes/admin/activity-logs.js`
- `api`: `node --check api/server/routes/index.js`
- `api`: `node --check api/server/index.js`

### 目標

建立統一 ActivityLog domain，先把關鍵操作寫入結構化資料，為後續稽核中心、告警、不可竄改策略與驗收樣本做準備。

### 建議範圍

- `ActivityLog` schema：event id、type、actor、role、department、resource type/id、action、result、timestamp、metadata、request ip/user agent。
- Writer helper：集中寫入，避免各 route 自行組字串。
- 先接入管理操作：user、role、department、plan、channel、balance、conversation admin read。
- 先接入使用者事件：登入、提問、附件上傳、分享、刪除。
- Admin activity-log list API：時間、actor、event type、resource type、result filter。

### 不納入

- hash chain / WORM / SIEM。
- 告警規則引擎。
- 稽核處置 workflow。
- 異常處理與簽核流程。

### 驗收標準

- 每次敏感管理操作會產生 ActivityLog。
- 失敗操作也能記錄 result 與原因摘要。
- ActivityLog list 可用 cursor pagination 查詢。
- 測試覆蓋至少一個成功與一個失敗的 activity-log write path。

## Phase 2A：部門用量與主管 Dashboard

### 目前進度

狀態：已完成第一版部門用量篩選、成員排行與 CSV 匯出基礎。

- `/api/admin/usage/transactions` 與 `/api/admin/usage/summary` 已支援 `departmentId` filter。
- `ADMIN` 可在 Usage 頁使用 Department filter 查跨部門用量。
- `MANAGER` 若傳入非自身部門的 `departmentId`，backend 會回傳 403，避免以 query 參數繞過部門 scope。
- 已新增 `/api/admin/usage/members`，依目前 filters 與 backend scope 回傳成員用量排行。
- Usage 頁已改為 `Transactions` / `Member Usage` 內部分頁，維持原本單畫面架構，表格區內部捲動。
- Member Usage 已支援 cursor pagination，避免成員數量增加時一次載入全部資料。
- 已新增 Usage CSV 匯出第一版：
  - `/api/admin/usage/transactions/export`
  - `/api/admin/usage/members/export`
  - 匯出使用同一組 filters 與 backend scope，不套用目前頁面的 cursor。
  - 匯出上限由 `ADMIN_USAGE_EXPORT_LIMIT` 環境參數控制，預設 10,000 筆，避免無限制查詢拖垮服務；前端會先檢查將匯出的筆數，若超過上限，會以系統風格確認視窗說明一次可匯出的筆數並詢問是否繼續。
- 目前前端 Department filter 先只對 `ADMIN` 顯示；`AUDITOR` 的部門選擇 UI、主管 dashboard 卡片與更完整的匯出工作流仍留在後續增量。

已執行驗證：

- repo root: `npm run build:data-provider`
- `packages/api`: `npx jest src/admin/usage.spec.ts --runInBand`
- `api`: `npx jest server/routes/__tests__/admin-usage.spec.js --runInBand`
- `client`: `CI=1 npx jest src/components/Admin/Usage/__tests__/AdminUsagePage.spec.tsx --runInBand --watchAll=false`
- `packages/api`: `npm run build`
- `api`: `node --check api/server/routes/admin/usage.js`
- `client`: locale JSON parse validation
- repo root: `git diff --check`

### 目標

使用 Phase 1A/1B 的部門資料與既有 transaction，提供主管可用的部門用量查詢。

### 建議範圍

- Department usage summary API：期間、模型、使用者、token/credits、交易數。
- Department member usage API：部門成員列表與用量排序。
- Department conversation list：只顯示授權範圍內對話摘要。
- Client manager dashboard：活躍人數、部門用量、quota 使用率、常用模型。
- CSV 匯出第一版。

### 不納入

- 郵件寄送。
- 高風險事件摘要。
- 趨勢圖完整視覺化。

### 驗收標準

- 主管登入後只能看到本部門資料。
- Admin 可用 department filter 查跨部門彙總。
- 匯出內容與畫面查詢條件一致。
- 多層部門架構列為重點延伸項目：主管 scope 需要可選擇是否包含 descendant departments，例如 `dep_01` 主管是否可查 `dep_01_01` 的 conversation / usage，並以 backend policy 強制執行。

## Phase 2B：主管摘要與郵件審核流程

### 目標

建立 R14-R19 的摘要寄送、主管回應、逾時提醒與管理者追蹤閉環。

### 建議範圍

- `ManagerReviewBatch` / `ManagerReviewItem` schema。
- 排程產生每日/每週摘要。
- Email 寄送 adapter 與 template。
- Reply token：用不可猜測 token 對應 batch/item，避免只靠文字判定。
- 通過 / 備查回覆與狀態回寫。
- 逾期提醒與 admin notification event。

### 不納入

- 公司行事曆上班日判定。
- 複雜簽核、改正、結案流程。
- SMS 或其他通知通道。

### 驗收標準

- 可對指定主管產生摘要批次。
- 可用直接審核介面送出主管通過 / 備查並回寫狀態。
- 公開 token 連結可檢視主管審核摘要與明細，並送出相同狀態。
- 逾期資料會產生提醒事件。
- 備查可保留主管備註並列入後續案件、指派、複核與簽核結案流程。

### 目前狀態

- 2B 的手動閉環已完成：建立批次、直接審核、公開連結審核、郵件寄送 adapter、手動逾期掃描、手動提醒、狀態防呆與操作紀錄。
- 自動排程產生批次、自動排程提醒、郵件收件回覆解析、通知中心、公司行事曆與備查後續案件流程列為後續 phase。
- 後續主管審核需要接上 Phase 2C 的月額度治理，從單純確認 transaction 摘要，調整為審核部門額度使用、接近上限、額外授予、阻擋與備查後續處理。

## Phase 2C：月額度治理與額度分配

### 目標

建立公司、部門、子部門與個人層級的當期額度治理。額度單位沿用目前模型 token 用量依費率換算後的 credit / token value；每期公司總額度可分配給部門，部門可分配給子部門或個人，任一硬限制帳戶用完即阻擋，但可依權限授予當期額外額度。

詳細設計見 `Phase2C_月額度治理與額度分配.md`。

### 建議範圍

- `QuotaPeriod`：公司額度期間，保留結算起始日與系統時區彈性。
- `QuotaAccount`：公司、部門、使用者的當期額度帳戶。
- `QuotaAllocation`：上層帳戶分配額度給下層帳戶。
- `QuotaGrant`：額外授予額度，需理由、授予者與當期有效期限。
- `QuotaLedgerEntry`：不可變額度流水帳，記錄分配、授予、用量扣抵、提醒與阻擋。
- 用量寫入後同步扣抵 user、department ancestry 與 company account。
- 接近額度用完時提供提醒；用完時沿用硬阻擋。
- 主管審核批次加入 quota context，支援通過 / 備查與後續追蹤。
- ActivityLog 擴充額度設定、分配、授予、提醒、阻擋與審核操作。

### 不納入

- 兄弟部門借用額度。
- 跨期額度結轉。
- 完整 BPM 簽核流程。
- 外部財務系統串接。

### 驗收標準

- 管理者可建立當期公司總額度並分配給部門。
- 部門主管可把自己部門額度分配給子部門或個人。
- 使用者用量會扣抵個人、部門 ancestry 與公司額度。
- 任一硬限制帳戶無剩餘額度時，使用者請求會被阻擋。
- 接近額度上限時，使用者與主管可看到提醒。
- 額外授予額度需要理由，且只在當期有效。
- 額度治理操作與系統阻擋會寫入 ActivityLog。

## Phase 3A：敏感資料與告警規則

### 目標

先做可設定、可稽核的規則與告警事件，支援敏感輸入提示、限制或遮罩的後續實作。

### 建議範圍

- `AlertRule` schema：regex、keyword、file type、threshold、severity、enabled、notification target。
- `AlertEvent` schema：rule、actor、department、resource、severity、status、evidence。
- 輸入與附件 metadata 的初步掃描 hook。
- 高風險操作二次確認 event。
- Admin rule CRUD 與 alert list API。

### 不納入

- DLP 供應商整合。
- 完整內容遮罩與解封鎖 workflow。
- 多管道通知。

### 驗收標準

- 啟用 regex 規則後，命中輸入會產生 alert event。
- 告警事件可回連 conversation/message/file。
- 規則異動會產生 ActivityLog。

## Phase 3B：稽核中心

### 目標

把 ActivityLog、alert event、對話、附件、使用者、部門與處置狀態集中到稽核操作畫面，並在這個 phase 開始實作真正的稽核處置、異常追蹤與簽核流程。

### 建議範圍

- Audit center API：事件、告警、關聯對話、附件、處置狀態。
- 稽核處置欄位：status、assignee、resolution、closedAt。
- Auditor role UI。
- 匯出稽核樣本。

### 不納入

- 不可竄改儲存。
- 外部 SIEM integration。

### 驗收標準

- Auditor 能搜尋高風險事件並查看關聯上下文。
- Auditor 可更新處置狀態。
- Admin 與 Auditor 權限可被清楚區分。

## Phase 4A：模型治理

### 目標

把現有 channel / plan entitlement 擴成模型治理主檔與使用留痕。

### 建議範圍

- 擴充 model metadata：version、context window、input/output cost、status、risk level、release date。
- 每次 request 記錄實際模型、版本、參數與 fallback。
- 高成本模型上限與申請 domain 的第一版。
- fallback policy 與事件記錄。

### 不納入

- 完整灰度發布。
- 模型品質評分自動化。

### 驗收標準

- 管理者可停用模型且使用者不可再選用。
- 每次對話可查到實際使用模型與參數摘要。
- fallback 發生時會寫入事件。

## Phase 4B：設定治理

### 目標

建立管理設定的草稿、送審、核准、生效與回滾流程，避免設定直接影響正式環境。

### 建議範圍

- `ConfigChangeSet` schema：module、draft value、before value、status、reviewer、effectiveAt。
- 設定異動 ActivityLog。
- 版本比較與匯出。
- 管理 API 加入 authorization gate。

### 不納入

- CAB 外部系統整合。
- 所有設定一次納管；先從模型白名單、保留政策、敏感規則開始。

### 驗收標準

- 重要設定可先存草稿，不會立即生效。
- 核准後才會更新 runtime config。
- 可查看前後值與回滾到上一版。

## Phase 5A：健康監控與營運報表

### 目標

補齊平台健康監控、趨勢、排程巡檢與管理者通知。

### 建議範圍

- Health snapshot schema：API、DB、文件處理、AI provider、排程狀態。
- Metrics ingestion adapter：先支援內部統計，再預留外部 Prometheus/SIEM。
- 每日 8:30 巡檢摘要。
- 每月統計寄送：部門 token、配額、高風險事件、失敗任務。
- Admin health dashboard。

### 不納入

- SMS。
- 完整 traces viewer。
- 99.5% SLA 自動計算的完整性報告。

### 驗收標準

- 管理者可看到最新 health snapshot。
- 巡檢排程失敗會被記錄。
- 月報可重跑並保留寄送紀錄。

## Phase 5B：維運治理與驗收文件

### 目標

補足正式驗收與營運治理所需的證據鏈。

### 建議範圍

- 每季權限盤點 batch。
- 年度 DR / 備份 / 容量 / 資安抽查紀錄模型。
- Incident 分級、事件單與復盤欄位。
- 驗收文件輸出：需求對照、測試案例、UAT、權限矩陣、告警規則、稽核樣本。
- 使用者與管理文件目錄。

### 不納入

- 真正災難復原平台建置。
- 外部 HelpDesk 串接。

### 驗收標準

- 可產出驗收包資料。
- 權限盤點可追蹤主管回覆。
- Incident 有分級、責任人、改善措施與結案狀態。

## 建議立即開始的第一批工作

第一批建議只做 Phase 1A，原因如下：

- 主管權限、主管報表、摘要郵件都依賴部門與主管關係。
- 操作紀錄若先補 actor department，後續查詢與報表會更穩。
- 這一批變更可切小，風險低，且能和既有 admin users/roles/plans 後台銜接。

### Phase 1A 建議拆成四個 PR 或工作批次

| 批次 | 內容 | 驗證 |
|---|---|---|
| 1A-1 | data-schemas department model + user department fields | schema/method tests |
| 1A-2 | packages/api admin departments service + api thin routes | backend route tests |
| 1A-3 | data-provider endpoints/types/service/query hooks | typecheck/build data-provider |
| 1A-4 | client admin departments UI + user detail department assignment | frontend tests / syntax check |

## 開始實作前待確認

- 部門是否只需要單層，還是第一版就要支援父子部門。
- 使用者是否只能屬於一個部門。
- 主管是否只能是一個 user，還是需要多主管。
- 部門資料來源是否先由 admin 手動維護，未來再接 AD/HR。
- 主管角色要用固定 `MANAGER`，還是允許 admin 以自訂 role 勾選 manager capability。

若沒有額外指定，建議第一版採保守設計：支援父部門欄位但不做繼承、使用者單部門、單主管、admin 手動維護、固定 `MANAGER` role。
