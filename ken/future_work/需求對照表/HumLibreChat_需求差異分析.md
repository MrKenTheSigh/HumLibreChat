# HumLibreChat 需求差異分析

評估日期：2026-04-21

## 來源與限制

- 使用者指定來源為 `E:\Vault\work\playground\Documents\合庫\AI_Portal\需求對照表.md`。
- 實際目錄中未找到該檔名；同目錄現有最接近且內容為完整需求矩陣的檔案為 `需求清單整理.md`，本分析以該檔 `R01-R92` 為需求來源。
- 本次只做靜態程式碼與既有規格文件盤點，未啟動服務、未跑整合測試，也未驗證部署設定。

## 總體判斷

HumLibreChat 已不是單純 upstream LibreChat；目前已補入一批管理端與成本/用量相關能力，包含：

- 管理後台入口與頁面：使用者、角色、方案、模型通道、對話查詢、用量查詢。
- RBAC 角色文件與管理 API。
- 基本身分驗證、OpenID/SAML/LDAP 支援，以及 admin-only 管理路由保護。
- 附件上傳、多格式支援、對話搜尋/標籤/匯出等一般聊天能力。
- token credit / balance / transaction 的前台顯示與後台查詢。
- plan、channel、model entitlement 的初步模型可用性治理。

但相對於 AI Portal 需求文件，缺口仍集中在企業治理層：部門/主管組織模型、ABAC、例外授權、主管郵件審核、稽核中心、告警規則引擎、不可竄改稽核、健康監控、排程報表、正式維運治理與驗收證據鏈。

## 現有實作證據

| 能力 | 現有證據 | 判斷 |
|---|---|---|
| 管理後台框架 | `client/src/components/Admin/AdminView.tsx`，已有 Users / Roles / Plans / Channels / Conversations / Usage 導覽 | 已具備管理後台骨架 |
| 使用者管理 | `packages/api/src/admin/users.ts`，支援列表、建立、查詢、姓名更新、角色指派、plan 指派、balance 調整 | 部分符合管理者後台設定 |
| 角色管理 | `packages/api/src/admin/roles.ts`、`packages/data-schemas/src/schema/role.ts`、`packages/data-provider/src/roles.ts` | 有 RBAC，但角色維度不足 |
| 後端管理 API 控權 | `api/server/routes/admin/*.js` 使用 `requireJwtAuth` 與 `requireAdmin` | 有 admin-only 控制 |
| 權限型別 | `packages/data-provider/src/permissions.ts` 定義 CHAT、FILE_UPLOADS、PROMPTS、AGENTS、MCP 等功能權限 | 功能級 RBAC，非 ABAC |
| 資源 ACL | `packages/api/src/acl/accessControlService.ts`，支援 user/group/public/role 對資源授權 | 有資源 ACL 基礎，主要用於既有資源共享，不足以覆蓋文件要求 |
| 附件上傳 | `packages/data-provider/src/file-config.ts`、`client/src/hooks/Files/useFileHandling.ts` | 多格式與上傳狀態部分具備 |
| 對話管理 | `packages/data-provider/src/api-endpoints.ts` 具備 search、share、conversation update/delete/import/fork 等端點；UI 有 Conversations、Bookmarks、Tags | 多數前台對話管理能力已具備 |
| 用量與 quota | `client/src/components/Chat/ChatQuotaBar.tsx`、`client/src/components/Chat/Messages/MessageCreditUsage.tsx`、`packages/api/src/admin/usage.ts` | 個人/平台用量部分具備，部門與正式報表不足 |
| 模型通道與 plan | `packages/api/src/admin/channels.ts`、`packages/api/src/admin/plans.ts` | 初步模型白名單/entitlement；尚非完整模型治理 |
| 身分整合 | `api/server/socialLogins.js`、`api/strategies/*`、OpenID/SAML/LDAP 相關測試 | 有企業身分整合基礎，角色同步仍有限 |

## 需求群組差異

### A. 前台使用者需求：R07-R13

狀態：大多已具備或部分具備。

已具備：

- 極簡對話式 UI、左側對話歷史、新對話等 LibreChat 主流程已存在。
- 附件支援涵蓋 PDF、DOCX、XLSX、PPTX、TXT、PNG、JPG，且實際支援格式比需求更多。
- 對話重新命名、搜尋、分享/匯出、刪除、標籤/收藏等能力有既有實作線索。
- 回應評分/feedback、prompt 模板、starter 類能力在既有前台中可找到。
- quota 顯示與單訊息 credit usage 已有客製 UI。

主要差異：

- R09 的「解析中 / 可提問 / 解析失敗」目前更接近上傳進度與錯誤 toast，不是企業需求定義的文件解析狀態流程。
- R10 要求模型版本、單次 token、累積 token、剩餘 quota、回應耗時與執行狀態。現有有 model、quota、credit usage，但模型版本、累積 token、耗時、狀態透明度尚不完整。
- R12 敏感資訊防護未見完整政策化流程；缺少送出前風險提示、阻擋、二次確認、自動遮罩與 audit log 串接。

### B. 角色、授權與身分：R01-R06、R60-R63、R68、R71、R90-R92

狀態：RBAC 基礎已具備，企業權限模型仍不足。

已具備：

- 系統已有 `ADMIN` / `USER` 系統角色，並支援自訂 role CRUD。
- 管理路由有 JWT 與 admin role 保護。
- OpenID、SAML、LDAP、JWT 相關基礎已存在。
- ACL service 可對部分資源做 principal/resource/permission bits 授權。

主要差異：

- R01 要求一般使用者、部門主管、稽核/資安管理者、系統管理者；目前只有通用 `ADMIN` / `USER` 與自訂名稱，未見主管、稽核、部門組織語意與預設矩陣。
- R02/R03 要 RBAC + ABAC，且以部門、職級、專案、資料分類、時間、系統狀態限制；目前未見部門、職級、專案、資料分類等屬性授權。
- R05 例外授權申請/審批、到期、原因、核准人未見實作。
- R06 權限版本、前後值、快照、回復未見完整實作。
- R61/R62/R90/R91 要對話、附件、報表、稽核資料的獨立授權碼，以及預覽/下載/轉寄/分享分離；現有 ACL 基礎不足以確認覆蓋所有資源與操作。
- R92 敏感操作 audit log 欄位要求未見完整結構化稽核事件模型。

### C. 主管管理與審核：R14-R25

狀態：大多未見實作。

已具備的接近能力：

- 後台可查使用者、對話、用量與交易紀錄，可作為主管或管理者查詢的底層資料來源。

主要差異：

- 未見部門/主管資料模型，因此 R20-R23 的部門範圍、直屬團隊、週報/月報、主管 dashboard 無法成立。
- R14-R19 的主管摘要郵件、通過 / 備查回覆、逾時提醒、管理者同步通知與異常導頁原本未見排程、郵件收件解析或狀態機；目前已補上手動閉環，排程與郵件收件解析列為後續。
- R24 的高成本模型開通、quota 增額、專案白名單申請流程未見正式申請/審批模型。
- R25 的敏感資料、異常大量使用、多次違規通知未見告警事件與處置追蹤。

### D. 稽核與資安：R26-R29、R58-R59、R63、R66、R89-R92

狀態：目前只有「管理者查詢對話與交易」雛形，離稽核中心仍有明顯差距。

已具備：

- `packages/api/src/admin/conversations.ts` 可由 admin 查詢全平台 conversation 與 messages。
- `packages/api/src/admin/usage.ts` 可查 transaction 與用量摘要。
- 交易模型可保存 token/credits 類紀錄。

主要差異：

- R26 稽核中心要求告警事件、關聯對話、附件、使用者、部門、時間、處置狀態；目前沒有獨立 alert/incident/audit case domain。
- R27 告警規則引擎缺少 regex、關鍵字字典、檔案類型、行為閾值、敏感等級設定與執行結果。
- R28 要檢索登入、提問、模型切換、上傳、下載、分享、刪除、權限變更等操作；目前查詢面集中在 conversation/transaction，事件類型不足。
- R29 不可竄改稽核紀錄未見 hash chain、append-only、外部 WORM/SIEM 或事件編號策略。
- R63 遮罩與解封鎖、二次授權紀錄未見完整實作。
- R89 個資規範遵循需要政策、欄位分類、遮罩與稽核證據，目前尚未形成閉環。

### E. 管理後台設定與模型治理：R30-R49、R72-R73

狀態：已有一部分管理能力，但偏「帳號 / 方案 / 通道 / entitlement」，未達文件中的治理流程。

已具備：

- R30 的使用者、角色、模型白名單/通道、提示詞/知識庫等部分能力在平台中有不同程度實作。
- R33 的個人 quota / credits 初步具備；plan 可指定 starting credits。
- R34/R39/R41 的模型可用性限制已有 plan model entitlements 與 channel enabled/model enabled 基礎。
- R73 管理 API 基本上受 admin-only 路由保護。

主要差異：

- R31/R32 平台基本設定、公告、語系、時區、通知、安全政策，多數仍依 config 或既有 LibreChat 設定，未見完整管理 UI 與審批。
- R35 知識庫來源、同步頻率、索引狀態、權限映射、分類標籤未見完整管理後台。
- R36-R38 設定草稿/送審/核准/生效/回滾、config audit log、版本比對與備份未見完整實作。
- R40 模型版本資訊欄位不足；目前 channel model 主要是 model/deployment/pricing/enabled。
- R42 任務場景綁定、R43 高成本模型審批、R44 模型績效比較、R46 對話模型參數/fallback 留痕、R47 fallback、R48 灰度與回滾、R49 safety/retry/system prompt template 參數治理，多數未見完整流程。
- R72 告警策略設定未見實作。

### F. 監控、報表、維運與驗收：R50-R57、R64-R65、R69-R70、R74-R88

狀態：幾乎仍是待建項目。

已具備：

- `/health` health check 存在。
- 後台 usage 可查交易與用量摘要。
- token/credit transaction 為後續報表提供部分資料基礎。

主要差異：

- R50-R55 平台健康儀表板、API 可用率、延遲、錯誤率、文件解析成功率、DB/vector DB、排程狀態、metrics/logs/traces、多管道告警、SLA、事件時間線未見完整實作。
- R56-R57 目前有使用量/交易摘要，但缺少部門維度、月報排程、寄送、趨勢圖與正式報表產出。
- R69-R70 驗收文件、測試案例、UAT、權限矩陣、告警規則文件、稽核樣本紀錄仍需另外產出。
- R74-R88 每日巡檢、每月統計寄送、每季權限盤點、年度 DR/備份驗證、incident 分級、事件單、CAB、備份治理、環境隔離、操作文件、FAQ、release note 流程均未見產品化實作。

## 粗略完成度

| 分群 | 需求範圍 | 目前完成度判斷 |
|---|---|---|
| 前台使用者 | R07-R13 | 約 60%-75%；主流程成熟，企業透明度/敏感防護不足 |
| 角色與授權 | R01-R06、R60-R63、R68、R71、R90-R92 | 約 25%-35%；RBAC 有，ABAC/部門/例外/稽核不足 |
| 主管管理 | R14-R25 | 約 5%-15%；底層資料有，主管流程幾乎未產品化 |
| 稽核資安 | R26-R29、R58-R59、R63、R66、R89-R92 | 約 10%-20%；查詢雛形有，稽核中心與告警缺 |
| 管理設定與模型治理 | R30-R49、R72-R73 | 約 30%-45%；帳號/角色/plan/channel 有，治理流程不足 |
| 監控報表維運驗收 | R50-R57、R64-R65、R69-R70、R74-R88 | 約 10%-20%；health/usage 基礎有，營運治理缺 |

整體若以需求文件完整範圍計，HumLibreChat 目前較接近「有一般聊天能力 + 初版管理後台 + 用量/模型 entitlement 基礎」；距離「可正式驗收的企業 AI Portal」仍需要補齊主管流程、ABAC/部門權限、稽核/告警、健康監控、報表排程與維運治理。

## 建議後續工作切分

### 第一優先：把現有後台補成可 Pilot 的管理閉環

對應 R01-R04、R07-R13、R30-R34、R56、R60、R71、R73。

- 建立明確預設角色：一般使用者、主管、稽核/資安、系統管理者。
- 補部門欄位與主管關係資料模型，先支援管理者維護或匯入。
- 將現有 admin users / roles / plans / channels / usage 對齊需求命名與權限矩陣。
- 補前台透明度：模型版本、單次 token、累積 token、剩餘 quota、回應耗時。
- 產出第一版權限矩陣與驗收案例。

### 第二優先：主管摘要與部門報表

對應 R14-R25、R57、R75。

- 建立部門用量 aggregation。
- 實作主管摘要排程、郵件寄送、通過 / 備查回覆與回寫狀態。
- 實作逾時提醒、管理者通知、異常導頁。
- 建立主管 dashboard 與週/月報下載。

### 第三優先：稽核中心與敏感資料治理

對應 R26-R29、R58-R59、R63、R66、R72、R89-R92。

- 建立 audit event / alert event / incident case 資料模型。
- 將登入、提問、模型切換、上傳、下載、分享、刪除、權限變更納入事件。
- 實作 regex/keyword/threshold/file type 規則引擎。
- 補敏感資料遮罩、解封鎖、二次確認與敏感操作 audit log。

### 第四優先：模型治理與設定治理

對應 R35-R49、R36-R38、R43-R48。

- 擴充 channel/model 主檔欄位：version、risk_level、context_window、成本、狀態、發布日期。
- 補高成本模型申請、審批、使用上限。
- 補 fallback、灰度、回滾與每次請求的實際模型/參數/fallback 留痕。
- 建立設定草稿、送審、核准、生效、回滾與版本比對。

### 第五優先：營運監控與正式驗收

對應 R50-R55、R64-R65、R69-R70、R74-R88。

- 建立 metrics/logs/traces 收集策略與健康儀表板。
- 建立告警分級、SLA、事件時間線與通知管道。
- 實作每日巡檢、每月統計、每季權限盤點、年度 DR/備份驗證證據。
- 補驗收文件包：需求對照、測試案例、UAT、權限矩陣、告警規則、稽核樣本、教育訓練紀錄。

## 結論

HumLibreChat 目前的開發進度可視為「LibreChat 主功能 + 初階管理後台 + credits/usage/model entitlement」階段。若要符合 AI Portal 需求清單，下一步不應先做零散 UI，而應先補三個基礎 domain：組織/部門/主管、稽核事件/告警事件、設定/模型治理狀態機。這三塊補起來後，主管審核、報表、ABAC、稽核中心與營運監控才有穩定資料基礎。
