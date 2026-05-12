import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  LayoutDashboard,
  MousePointer2,
  Move,
  Network,
  Plus,
  Send,
  Search,
  ShieldCheck,
  RotateCcw,
  Save,
  Users,
  X,
} from 'lucide-react';
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { SystemRoles } from 'librechat-data-provider';
import type { Edge, Node, NodeProps, ReactFlowInstance } from '@xyflow/react';
import type {
  AdminDepartment,
  AdminQuotaAccount,
  AdminQuotaAccountScopeType,
  AdminQuotaRequest,
  AdminUserSummary,
} from 'librechat-data-provider';
import AdminHelpButton from '../AdminHelpButton';
import AdminLayout from '../AdminLayout';
import {
  useGetAdminDepartmentsQuery,
  useGetAdminQuotaAccountsQuery,
  useGetAdminQuotaPeriodsQuery,
  useGetAdminQuotaRequestsQuery,
  useGetAdminUsersQuery,
} from '~/data-provider/Admin';
import {
  useApproveAdminQuotaRequestMutation,
  useCreateAdminQuotaAllocationMutation,
  useCreateAdminQuotaPeriodMutation,
  useCreateAdminQuotaRequestMutation,
  useRejectAdminQuotaRequestMutation,
  useUpdateAdminDepartmentMutation,
  useUpdateAdminUserDepartmentMutation,
} from '~/data-provider/Admin/mutations';
import type { TranslationKeys } from '~/hooks';
import { useAuthContext, useLocalize } from '~/hooks';

type GraphMode = 'view' | 'organization' | 'quota';
type GraphNodeKind = 'company' | 'department' | 'user' | 'unassigned';

type OrgGraphNodeData = {
  kind: GraphNodeKind;
  label: string;
  secondary: string;
  status: string;
  userCount: number;
  expanded: boolean;
  canExpand: boolean;
  mode: GraphMode;
  canAllocateQuota: boolean;
  hasPendingChange: boolean;
  usedCredits: number | null;
  limitCredits: number | null;
  allocatedCredits: number | null;
  allocatableCredits: number | null;
  usableCredits: number | null;
  usedLabel: string;
  allocatedLabel: string;
  expandLabel: string;
  collapseLabel: string;
  allocateLabel: string;
  usersLabel: string;
  noUsersLabel: string;
  onToggle: (nodeId: string) => void;
  onAllocate: (nodeId: string) => void;
};

type OrgNode = Node<OrgGraphNodeData, 'orgNode'>;

type GraphLookupValue = {
  kind: GraphNodeKind;
  label: string;
  secondary: string;
  department?: AdminDepartment;
  user?: AdminUserSummary;
  account?: AdminQuotaAccount;
  userCount: number;
};

type Notice = {
  title: string;
  message: string;
};

type QuotaTransferPrecheckIssue = {
  userId: string;
  userLabel: string;
  targetLabel: string;
  requiredCredits: number;
  availableCredits: number;
  shortageCredits: number;
  reason: 'insufficient' | 'missing_target' | 'no_department';
};

type ResponseErrorBody = {
  error?: string;
  message?: string;
};

type ResponseError = {
  message?: string;
  response?: {
    data?: ResponseErrorBody;
  };
};

type GraphBuildResult = {
  nodes: OrgNode[];
  edges: Edge[];
  lookup: Map<string, GraphLookupValue>;
};

const horizontalGap = 340;
const verticalGap = 284;
const graphUserLimit = 100;
const companyDepartmentCode = 'COMPANY';

const modeButtonClassName =
  'px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60';
const inputClassName =
  'w-full rounded-xl border border-border-medium bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary disabled:cursor-not-allowed disabled:opacity-60';
const labelClassName = 'flex flex-col gap-2 text-sm text-text-secondary';

function formatCredits(value: number | null) {
  if (value == null) {
    return '-';
  }

  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
  }).format(value);
}

function getAccountLimitCredits(account?: AdminQuotaAccount) {
  if (!account) {
    return null;
  }

  return account.limitCredits ?? account.baseAllocatedCredits + account.extraGrantedCredits;
}

function getAccountAllocatableCredits(account?: AdminQuotaAccount) {
  if (!account) {
    return null;
  }

  return account.allocatableLimitCredits ?? getAccountLimitCredits(account) ?? 0;
}

function getQuotaRequestSourceBefore(request: AdminQuotaRequest) {
  return getAccountAllocatableCredits(request.sourceAccount ?? undefined);
}

function getQuotaRequestSourceAfter(request: AdminQuotaRequest) {
  const sourceBefore = getQuotaRequestSourceBefore(request);
  if (sourceBefore == null) {
    return null;
  }

  return sourceBefore - request.amount;
}

function getQuotaRequestTargetBefore(request: AdminQuotaRequest) {
  return getAccountLimitCredits(request.targetAccount ?? undefined);
}

function getQuotaRequestTargetAfter(request: AdminQuotaRequest) {
  const targetBefore = getQuotaRequestTargetBefore(request);
  if (targetBefore == null) {
    return null;
  }

  return targetBefore + request.amount;
}

function CreditChange({ before, after }: { before: number | null; after: number | null }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-base font-medium text-text-secondary">{formatCredits(before)}</span>
      <span className="text-sm text-text-secondary">{'>'}</span>
      <span className="text-2xl font-semibold text-text-primary">{formatCredits(after)}</span>
    </div>
  );
}

function getAccountAllocatedCredits(account?: AdminQuotaAccount) {
  if (!account) {
    return null;
  }

  return account.allocatedLimitCredits ?? account.reservedCredits;
}

function getAccountUsableCredits(account?: AdminQuotaAccount) {
  if (!account) {
    return null;
  }

  return account.usableRemainingCredits ?? account.remainingCredits;
}

function withDerivedAccountCredits(account: AdminQuotaAccount): AdminQuotaAccount {
  const limitCredits = getAccountLimitCredits(account) ?? 0;
  const allocatedLimitCredits = account.reservedCredits ?? 0;
  const allocatableLimitCredits = Math.max(0, limitCredits - allocatedLimitCredits);

  return {
    ...account,
    limitCredits,
    allocatedLimitCredits,
    allocatableLimitCredits,
  };
}

function isResponseError(error: unknown): error is ResponseError {
  return typeof error === 'object' && error !== null;
}

function getResponseMessage(error: unknown) {
  if (!isResponseError(error)) {
    return null;
  }

  return error.response?.data?.message ?? error.response?.data?.error ?? error.message ?? null;
}

function getQuotaOperationErrorKey(message: string | null): TranslationKeys | null {
  if (!message) {
    return null;
  }

  if (message === 'Insufficient quota credits') {
    return 'com_ui_admin_quota_error_insufficient_credits';
  }

  if (message === 'Quota request is not pending') {
    return 'com_ui_admin_quota_error_request_not_pending';
  }

  if (message === 'sourceAccountId is outside the allowed review scope') {
    return 'com_ui_admin_quota_error_review_scope';
  }

  if (
    message === 'sourceAccountId is outside the allowed scope' ||
    message === 'targetAccountId is outside the allowed scope' ||
    message === 'accountId is outside the allowed scope'
  ) {
    return 'com_ui_admin_quota_error_scope';
  }

  if (message === 'Quota requests must target the parent account') {
    return 'com_ui_admin_quota_error_parent_request';
  }

  if (message === 'Cannot request quota from the same account') {
    return 'com_ui_admin_quota_error_same_account_request';
  }

  return null;
}

function getNodeTone(kind: GraphNodeKind) {
  if (kind === 'company') {
    return 'border-emerald-500/40 bg-emerald-500/10';
  }

  if (kind === 'department') {
    return 'border-sky-500/40 bg-sky-500/10';
  }

  if (kind === 'user') {
    return 'border-violet-500/45 bg-violet-100/80 dark:bg-violet-950/60';
  }

  return 'border-amber-500/40 bg-amber-500/10';
}

function getUserDisplayName(user: AdminUserSummary) {
  return user.name || user.username || user.email || user.id;
}

function getQuotaAccountLabel(
  account?: AdminQuotaAccount | null,
  options?: { showUserAlias?: boolean },
) {
  if (!account) {
    return '-';
  }

  if (account.scopeType === 'company') {
    return account.scopeLabel || 'Company';
  }

  if (
    options?.showUserAlias === true &&
    account.scopeType === 'user' &&
    account.scopeLabel &&
    account.scopeSecondaryLabel &&
    account.scopeLabel !== account.scopeSecondaryLabel
  ) {
    const name = account.scopeSecondaryLabel.split(' / ').at(-1)?.trim();
    return `${account.scopeLabel} (${name || account.scopeSecondaryLabel})`;
  }

  return account.scopeLabel || account.scopeSecondaryLabel || account.scopeId || account.id;
}

function getAccountByScope(
  accounts: AdminQuotaAccount[],
  scopeType: AdminQuotaAccountScopeType,
  scopeId: string | null,
) {
  return (
    accounts.find((account) => {
      if (account.scopeType !== scopeType) {
        return false;
      }

      if (scopeType === 'company') {
        return account.scopeId === 'company' || account.scopeId == null;
      }

      return account.scopeId === scopeId;
    }) ?? null
  );
}

function getCompanyRootDepartment(departments: AdminDepartment[]) {
  return (
    departments.find(
      (department) => department.code.trim().toUpperCase() === companyDepartmentCode,
    ) ?? null
  );
}

function getDescendantDepartmentIds(departments: AdminDepartment[], departmentId: string) {
  const childrenByParent = new Map<string, AdminDepartment[]>();

  for (const department of departments) {
    if (!department.parentDepartmentId) {
      continue;
    }

    const siblings = childrenByParent.get(department.parentDepartmentId) ?? [];
    siblings.push(department);
    childrenByParent.set(department.parentDepartmentId, siblings);
  }

  const descendants = new Set<string>();
  const stack = [...(childrenByParent.get(departmentId) ?? [])];

  while (stack.length > 0) {
    const department = stack.pop();
    if (!department || descendants.has(department.id)) {
      continue;
    }

    descendants.add(department.id);
    stack.push(...(childrenByParent.get(department.id) ?? []));
  }

  return descendants;
}

function isDepartmentDescendantOf(
  departments: AdminDepartment[],
  departmentId: string,
  ancestorDepartmentId: string,
  companyRootDepartmentId?: string | null,
) {
  if (companyRootDepartmentId && ancestorDepartmentId === companyRootDepartmentId) {
    return true;
  }

  const departmentsById = new Map(departments.map((department) => [department.id, department]));
  let currentDepartmentId: string | null = departmentId;

  while (currentDepartmentId) {
    if (currentDepartmentId === ancestorDepartmentId) {
      return true;
    }

    currentDepartmentId = departmentsById.get(currentDepartmentId)?.parentDepartmentId ?? null;
  }

  return false;
}

function getAccountForDepartment(
  accountsByScope: Map<string, AdminQuotaAccount>,
  departmentId: string | null,
  companyRootDepartmentId?: string | null,
) {
  if (!departmentId || departmentId === companyRootDepartmentId) {
    return accountsByScope.get('company:company') ?? null;
  }

  return accountsByScope.get(`department:${departmentId}`) ?? null;
}

function cloneAccountForPendingTransfer(account: AdminQuotaAccount): AdminQuotaAccount {
  return {
    ...account,
    allocatedLimitCredits: undefined,
    allocatableLimitCredits: undefined,
  };
}

function getDepartmentLabel(department: AdminDepartment) {
  return `${department.name} (${department.code})`;
}

function getPendingUserDepartmentTransferIssues(input: {
  accounts: AdminQuotaAccount[];
  users: AdminUserSummary[];
  pendingUserDepartments: Record<string, string | null>;
  departments: AdminDepartment[];
  companyRootDepartment: AdminDepartment | null;
  companyLabel: string;
  noDepartmentLabel: string;
}): QuotaTransferPrecheckIssue[] {
  const issues: QuotaTransferPrecheckIssue[] = [];
  const accountsById = new Map<string, AdminQuotaAccount>(
    input.accounts.map((account) => [account.id, cloneAccountForPendingTransfer(account)]),
  );
  const accountsByScope = new Map<string, AdminQuotaAccount>();
  const usersById = new Map(input.users.map((user) => [user.id, user]));
  const departmentsById = new Map(
    input.departments.map((department) => [department.id, department]),
  );

  for (const account of accountsById.values()) {
    accountsByScope.set(`${account.scopeType}:${account.scopeId ?? 'company'}`, account);
  }

  for (const [userId, targetDepartmentId] of Object.entries(input.pendingUserDepartments)) {
    const user = usersById.get(userId);
    const userAccount = accountsByScope.get(`user:${userId}`);

    if (!user || !userAccount?.parentAccountId) {
      continue;
    }

    const transferCredits = userAccount.baseAllocatedCredits ?? 0;
    if (transferCredits <= 0) {
      continue;
    }

    if (!targetDepartmentId) {
      issues.push({
        userId,
        userLabel: getUserDisplayName(user),
        targetLabel: input.noDepartmentLabel,
        requiredCredits: transferCredits,
        availableCredits: 0,
        shortageCredits: transferCredits,
        reason: 'no_department',
      });
      continue;
    }

    const targetDepartment = departmentsById.get(targetDepartmentId);
    let targetLabel = targetDepartmentId;
    if (targetDepartmentId === input.companyRootDepartment?.id) {
      targetLabel = input.companyLabel;
    } else if (targetDepartment) {
      targetLabel = getDepartmentLabel(targetDepartment);
    }
    const targetParentAccount = getAccountForDepartment(
      accountsByScope,
      targetDepartmentId,
      input.companyRootDepartment?.id,
    );

    if (!targetParentAccount) {
      issues.push({
        userId,
        userLabel: getUserDisplayName(user),
        targetLabel,
        requiredCredits: transferCredits,
        availableCredits: 0,
        shortageCredits: transferCredits,
        reason: 'missing_target',
      });
      continue;
    }

    const currentParentAccount = accountsById.get(userAccount.parentAccountId);
    if (currentParentAccount?.id === targetParentAccount.id) {
      continue;
    }

    const availableCredits = getAccountAllocatableCredits(targetParentAccount) ?? 0;
    if (availableCredits < transferCredits) {
      issues.push({
        userId,
        userLabel: getUserDisplayName(user),
        targetLabel,
        requiredCredits: transferCredits,
        availableCredits,
        shortageCredits: transferCredits - availableCredits,
        reason: 'insufficient',
      });
      continue;
    }

    targetParentAccount.reservedCredits =
      (targetParentAccount.reservedCredits ?? 0) + transferCredits;

    if (currentParentAccount) {
      currentParentAccount.reservedCredits = Math.max(
        0,
        (currentParentAccount.reservedCredits ?? 0) - transferCredits,
      );
    }
  }

  return issues;
}

function getAccountsWithPendingUserDepartmentTransfers(input: {
  accounts: AdminQuotaAccount[];
  users: AdminUserSummary[];
  pendingUserDepartments: Record<string, string | null>;
  departments: AdminDepartment[];
  companyRootDepartment: AdminDepartment | null;
}) {
  if (Object.keys(input.pendingUserDepartments).length === 0) {
    return input.accounts;
  }

  const accountsById = new Map<string, AdminQuotaAccount>(
    input.accounts.map((account) => [account.id, cloneAccountForPendingTransfer(account)]),
  );
  const accountsByScope = new Map<string, AdminQuotaAccount>();
  const usersById = new Map(input.users.map((user) => [user.id, user]));
  const allocatedDisplayOffsets = new Map<string, number>();

  for (const account of accountsById.values()) {
    accountsByScope.set(`${account.scopeType}:${account.scopeId ?? 'company'}`, account);
  }

  for (const [userId, targetDepartmentId] of Object.entries(input.pendingUserDepartments)) {
    const user = usersById.get(userId);
    const userAccount = accountsByScope.get(`user:${userId}`);

    if (!user || !userAccount?.parentAccountId || !targetDepartmentId) {
      continue;
    }

    const currentParentAccount = accountsById.get(userAccount.parentAccountId);
    const targetParentAccount = getAccountForDepartment(
      accountsByScope,
      targetDepartmentId,
      input.companyRootDepartment?.id,
    );

    if (
      !currentParentAccount ||
      !targetParentAccount ||
      currentParentAccount.id === targetParentAccount.id
    ) {
      continue;
    }

    const transferCredits = userAccount.baseAllocatedCredits ?? 0;
    if (transferCredits <= 0) {
      continue;
    }

    currentParentAccount.reservedCredits = Math.max(
      0,
      (currentParentAccount.reservedCredits ?? 0) - transferCredits,
    );
    targetParentAccount.reservedCredits =
      (targetParentAccount.reservedCredits ?? 0) + transferCredits;

    const movedToOriginalDepartmentDescendant =
      user.departmentId != null &&
      isDepartmentDescendantOf(
        input.departments,
        targetDepartmentId,
        user.departmentId,
        input.companyRootDepartment?.id,
      );

    if (movedToOriginalDepartmentDescendant) {
      allocatedDisplayOffsets.set(
        currentParentAccount.id,
        (allocatedDisplayOffsets.get(currentParentAccount.id) ?? 0) + transferCredits,
      );
    }
  }

  return input.accounts.map((account) => {
    const adjustedAccount = accountsById.get(account.id) ?? account;
    const withDerivedCredits = withDerivedAccountCredits(adjustedAccount);

    const allocatedDisplayOffset = allocatedDisplayOffsets.get(adjustedAccount.id);
    if (allocatedDisplayOffset != null) {
      withDerivedCredits.allocatedLimitCredits =
        (withDerivedCredits.allocatedLimitCredits ?? 0) + allocatedDisplayOffset;
    }

    return withDerivedCredits;
  });
}

function OrgGraphNode(props: NodeProps<OrgNode>) {
  const { id, selected, data } = props;
  const usageRatio =
    data.usedCredits != null && data.limitCredits != null && data.limitCredits > 0
      ? Math.min(100, Math.round((data.usedCredits / data.limitCredits) * 100))
      : null;
  const allocationRatio =
    data.allocatedCredits != null && data.limitCredits != null && data.limitCredits > 0
      ? Math.min(100, Math.round((data.allocatedCredits / data.limitCredits) * 100))
      : null;
  let footerAction: React.ReactNode = null;

  if (data.canExpand) {
    footerAction = (
      <button
        type="button"
        className="nodrag admin-button-secondary flex-1 rounded-lg px-2 py-1.5 text-xs font-medium"
        onClick={(event) => {
          event.stopPropagation();
          data.onToggle(id);
        }}
      >
        {data.expanded ? data.collapseLabel : data.expandLabel}
      </button>
    );
  } else if (data.kind === 'department' || data.kind === 'unassigned') {
    footerAction = (
      <div className="flex-1 rounded-lg border border-border-light bg-background px-2 py-1.5 text-center text-xs text-text-secondary">
        {data.noUsersLabel}
      </div>
    );
  }

  return (
    <div
      className={`relative w-[260px] rounded-2xl border bg-surface-primary p-4 text-text-primary shadow-sm transition-all ${getNodeTone(
        data.kind,
      )} ${data.hasPendingChange ? '!bg-amber-500/15 shadow-lg shadow-amber-500/10' : ''} ${
        selected
          ? 'shadow-lg shadow-blue-500/10 ring-2 ring-blue-500/80 ring-offset-2 ring-offset-background'
          : ''
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2.5 !w-2.5 !border !border-blue-300 !bg-blue-500"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!h-2.5 !w-2.5 !border !border-blue-300 !bg-blue-500"
      />
      {data.hasPendingChange ? (
        <div className="absolute right-3 top-3 h-2.5 w-2.5 rounded-full bg-amber-400 shadow-sm shadow-amber-500/40" />
      ) : null}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{data.label}</div>
          <div className="mt-1 truncate text-xs text-text-secondary">{data.secondary}</div>
        </div>
        {data.kind !== 'company' && data.kind !== 'unassigned' ? (
          <span className="rounded-full border border-border-light bg-background px-2 py-0.5 text-[11px] text-text-secondary">
            {data.status}
          </span>
        ) : null}
      </div>

      <div className="mt-3 text-xs">
        <button
          type="button"
          disabled={!data.canExpand}
          className="nodrag w-full rounded-xl border border-border-light bg-background px-2 py-1.5 text-left transition-colors enabled:hover:bg-surface-hover disabled:cursor-default"
          onClick={(event) => {
            event.stopPropagation();
            if (data.canExpand) {
              data.onToggle(id);
            }
          }}
        >
          <div className="text-text-secondary">{data.usersLabel}</div>
          <div className="mt-1 font-medium text-text-primary">{data.userCount}</div>
        </button>
      </div>

      <div className="mt-3 space-y-2 text-xs">
        <div>
          <div className="mb-1 flex items-center justify-between gap-3 text-text-secondary">
            <span>{data.allocatedLabel}</span>
            <span className="text-text-primary">
              {formatCredits(data.allocatedCredits)} / {formatCredits(data.limitCredits)}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-background">
            <div
              className="h-full rounded-full bg-amber-500"
              style={{ width: `${allocationRatio ?? 0}%` }}
            />
          </div>
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between gap-3 text-text-secondary">
            <span>{data.usedLabel}</span>
            <span className="text-text-primary">
              {formatCredits(data.usedCredits)} / {formatCredits(data.limitCredits)}
              {usageRatio == null ? '' : ` (${usageRatio}%)`}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-background">
            <div
              className="h-full rounded-full bg-blue-500"
              style={{ width: `${usageRatio ?? 0}%` }}
            />
          </div>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        {footerAction}
        {data.mode === 'quota' && data.canAllocateQuota && data.kind !== 'user' ? (
          <button
            type="button"
            disabled={(data.allocatableCredits ?? 0) <= 0}
            className="nodrag admin-button-primary flex-1 rounded-lg px-2 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-60"
            onClick={(event) => {
              event.stopPropagation();
              data.onAllocate(id);
            }}
          >
            {data.allocateLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function buildGraph(input: {
  departments: AdminDepartment[];
  users: AdminUserSummary[];
  accounts: AdminQuotaAccount[];
  expandedNodeIds: Set<string>;
  mode: GraphMode;
  selectedNodeId: string;
  labels: {
    company: string;
    root: string;
    department: string;
    user: string;
    unassigned: string;
    enabled: string;
    disabled: string;
    noAccount: string;
    expandUsers: string;
    collapseUsers: string;
    allocate: string;
    users: string;
    noUsers: string;
    used: string;
    allocated: string;
  };
  onToggle: (nodeId: string) => void;
  onAllocate: (nodeId: string) => void;
  pendingNodeIds: Set<string>;
  pendingAffectedDepartmentIds: Set<string>;
  canAllocateQuota: boolean;
}): GraphBuildResult {
  const nodes: OrgNode[] = [];
  const edges: Edge[] = [];
  const lookup = new Map<string, GraphLookupValue>();
  const companyRootDepartment = getCompanyRootDepartment(input.departments);
  const visibleDepartments = input.departments.filter(
    (department) => department.id !== companyRootDepartment?.id,
  );
  const visibleDepartmentIds = new Set(visibleDepartments.map((department) => department.id));
  const departmentsByParent = new Map<string, AdminDepartment[]>();
  const usersByDepartment = new Map<string, AdminUserSummary[]>();
  const companyDirectUsers: AdminUserSummary[] = [];
  const unassignedUsers: AdminUserSummary[] = [];

  for (const department of visibleDepartments) {
    const parentDepartmentId = department.parentDepartmentId;
    const parentKey =
      parentDepartmentId != null &&
      parentDepartmentId !== companyRootDepartment?.id &&
      visibleDepartmentIds.has(parentDepartmentId)
        ? parentDepartmentId
        : 'company';
    const siblings = departmentsByParent.get(parentKey) ?? [];
    siblings.push(department);
    departmentsByParent.set(parentKey, siblings);
  }

  for (const user of input.users) {
    if (companyRootDepartment && user.departmentId === companyRootDepartment.id) {
      companyDirectUsers.push(user);
      continue;
    }

    if (user.departmentId != null && visibleDepartmentIds.has(user.departmentId)) {
      const departmentUsers = usersByDepartment.get(user.departmentId) ?? [];
      departmentUsers.push(user);
      usersByDepartment.set(user.departmentId, departmentUsers);
      continue;
    }

    unassignedUsers.push(user);
  }

  for (const siblings of departmentsByParent.values()) {
    siblings.sort((first, second) => {
      if (first.sortOrder !== second.sortOrder) {
        return first.sortOrder - second.sortOrder;
      }

      return first.name.localeCompare(second.name);
    });
  }

  for (const departmentUsers of usersByDepartment.values()) {
    departmentUsers.sort((first, second) =>
      getUserDisplayName(first).localeCompare(getUserDisplayName(second)),
    );
  }
  companyDirectUsers.sort((first, second) =>
    getUserDisplayName(first).localeCompare(getUserDisplayName(second)),
  );
  unassignedUsers.sort((first, second) =>
    getUserDisplayName(first).localeCompare(getUserDisplayName(second)),
  );

  let row = 0;
  const companyAccount = getAccountByScope(input.accounts, 'company', null);

  const addNode = (node: OrgNode, lookupValue: GraphLookupValue) => {
    nodes.push(node);
    lookup.set(node.id, lookupValue);
  };

  const addEdge = (source: string, target: string) => {
    edges.push({
      id: `${source}-${target}`,
      source,
      target,
      type: 'smoothstep',
      markerEnd: { type: MarkerType.ArrowClosed, color: '#60a5fa' },
      style: { stroke: '#60a5fa', strokeWidth: 2.2 },
      animated: false,
    });
  };

  const buildNode = (params: {
    id: string;
    kind: GraphNodeKind;
    label: string;
    secondary: string;
    status: string;
    depth: number;
    row: number;
    userCount: number;
    canExpand: boolean;
    expanded: boolean;
    account?: AdminQuotaAccount | null;
  }): OrgNode => ({
    id: params.id,
    type: 'orgNode',
    selected: input.selectedNodeId === params.id,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    position: {
      x: params.depth * horizontalGap,
      y: params.row * verticalGap,
    },
    data: {
      kind: params.kind,
      label: params.label,
      secondary: params.secondary,
      status: params.status,
      userCount: params.userCount,
      expanded: params.expanded,
      canExpand: params.canExpand,
      mode: input.mode,
      canAllocateQuota: input.canAllocateQuota,
      hasPendingChange:
        input.pendingNodeIds.has(params.id) ||
        ((params.kind === 'company' || params.kind === 'department') &&
          input.pendingAffectedDepartmentIds.has(params.id)),
      usedCredits: params.account?.usedCredits ?? null,
      limitCredits: getAccountLimitCredits(params.account ?? undefined),
      allocatedCredits: getAccountAllocatedCredits(params.account ?? undefined),
      allocatableCredits: getAccountAllocatableCredits(params.account ?? undefined),
      usableCredits: getAccountUsableCredits(params.account ?? undefined),
      usedLabel: input.labels.used,
      allocatedLabel: input.labels.allocated,
      expandLabel: input.labels.expandUsers,
      collapseLabel: input.labels.collapseUsers,
      allocateLabel: input.labels.allocate,
      usersLabel: input.labels.users,
      noUsersLabel: input.labels.noUsers,
      onToggle: input.onToggle,
      onAllocate: input.onAllocate,
    },
  });

  const placeDepartment = (department: AdminDepartment, depth: number, parentNodeId: string) => {
    const nodeId = `department:${department.id}`;
    const departmentUsers = usersByDepartment.get(department.id) ?? [];
    const account = getAccountByScope(input.accounts, 'department', department.id);
    const expanded = input.expandedNodeIds.has(nodeId);
    const currentRow = row;
    row += 1;

    addNode(
      buildNode({
        id: nodeId,
        kind: 'department',
        label: department.name,
        secondary: `${input.labels.department} - ${department.code}`,
        status: department.enabled ? input.labels.enabled : input.labels.disabled,
        depth,
        row: currentRow,
        userCount: departmentUsers.length,
        canExpand: departmentUsers.length > 0,
        expanded,
        account,
      }),
      {
        kind: 'department',
        label: department.name,
        secondary: department.code,
        department,
        account: account ?? undefined,
        userCount: departmentUsers.length,
      },
    );
    addEdge(parentNodeId, nodeId);

    for (const child of departmentsByParent.get(department.id) ?? []) {
      placeDepartment(child, depth + 1, nodeId);
    }

    if (expanded) {
      for (const user of departmentUsers) {
        const userNodeId = `user:${user.id}`;
        const userAccount = getAccountByScope(input.accounts, 'user', user.id);
        const userRow = row;
        row += 1;
        addNode(
          buildNode({
            id: userNodeId,
            kind: 'user',
            label: getUserDisplayName(user),
            secondary: user.email,
            status: user.role ?? input.labels.user,
            depth: depth + 1,
            row: userRow,
            userCount: 0,
            canExpand: false,
            expanded: false,
            account: userAccount,
          }),
          {
            kind: 'user',
            label: getUserDisplayName(user),
            secondary: user.email,
            user,
            account: userAccount ?? undefined,
            userCount: 0,
          },
        );
        addEdge(nodeId, userNodeId);
      }
    }
  };

  const companyNode = buildNode({
    id: 'company',
    kind: 'company',
    label: input.labels.company,
    secondary: input.labels.root,
    status: companyAccount ? input.labels.enabled : input.labels.noAccount,
    depth: 0,
    row: 0,
    userCount: companyDirectUsers.length,
    canExpand: companyDirectUsers.length > 0,
    expanded: input.expandedNodeIds.has('company'),
    account: companyAccount,
  });
  addNode(companyNode, {
    kind: 'company',
    label: input.labels.company,
    secondary: input.labels.root,
    account: companyAccount ?? undefined,
    department: companyRootDepartment ?? undefined,
    userCount: companyDirectUsers.length,
  });
  row = 1;

  for (const department of departmentsByParent.get('company') ?? []) {
    placeDepartment(department, 1, 'company');
  }

  if (input.expandedNodeIds.has('company')) {
    for (const user of companyDirectUsers) {
      const userNodeId = `user:${user.id}`;
      const userAccount = getAccountByScope(input.accounts, 'user', user.id);
      const userRow = row;
      row += 1;
      addNode(
        buildNode({
          id: userNodeId,
          kind: 'user',
          label: getUserDisplayName(user),
          secondary: user.email,
          status: user.role ?? input.labels.user,
          depth: 1,
          row: userRow,
          userCount: 0,
          canExpand: false,
          expanded: false,
          account: userAccount,
        }),
        {
          kind: 'user',
          label: getUserDisplayName(user),
          secondary: user.email,
          user,
          account: userAccount ?? undefined,
          userCount: 0,
        },
      );
      addEdge('company', userNodeId);
    }
  }

  if (unassignedUsers.length > 0) {
    const nodeId = 'unassigned';
    const expanded = input.expandedNodeIds.has(nodeId);
    const currentRow = row;
    row += 1;
    addNode(
      buildNode({
        id: nodeId,
        kind: 'unassigned',
        label: input.labels.unassigned,
        secondary: input.labels.user,
        status: input.labels.noAccount,
        depth: 1,
        row: currentRow,
        userCount: unassignedUsers.length,
        canExpand: true,
        expanded,
      }),
      {
        kind: 'unassigned',
        label: input.labels.unassigned,
        secondary: input.labels.user,
        userCount: unassignedUsers.length,
      },
    );
    addEdge('company', nodeId);

    if (expanded) {
      for (const user of unassignedUsers) {
        const userNodeId = `user:${user.id}`;
        const userAccount = getAccountByScope(input.accounts, 'user', user.id);
        const userRow = row;
        row += 1;
        addNode(
          buildNode({
            id: userNodeId,
            kind: 'user',
            label: getUserDisplayName(user),
            secondary: user.email,
            status: user.role ?? input.labels.user,
            depth: 2,
            row: userRow,
            userCount: 0,
            canExpand: false,
            expanded: false,
            account: userAccount,
          }),
          {
            kind: 'user',
            label: getUserDisplayName(user),
            secondary: user.email,
            user,
            account: userAccount ?? undefined,
            userCount: 0,
          },
        );
        addEdge(nodeId, userNodeId);
      }
    }
  }

  const companyY = nodes.length > 1 ? ((row - 1) * verticalGap) / 2 : 0;
  nodes[0] = {
    ...nodes[0],
    position: { x: 0, y: companyY },
  };

  return { nodes, edges, lookup };
}

export default function AdminOrganizationGraphPage() {
  const localize = useLocalize();
  const { user } = useAuthContext();
  const isAdmin = user?.role === SystemRoles.ADMIN;
  const canChangeOrganization = isAdmin;
  const canManageQuota = user?.role === SystemRoles.ADMIN || user?.role === SystemRoles.MANAGER;
  const canReviewQuotaRequests = canManageQuota;
  const [mode, setMode] = useState<GraphMode>('view');
  const [selectedPeriodId, setSelectedPeriodId] = useState('');
  const [selectedNodeId, setSelectedNodeId] = useState('company');
  const [search, setSearch] = useState('');
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<string>>(() => new Set());
  const [pendingDepartmentParents, setPendingDepartmentParents] = useState<
    Record<string, string | null>
  >({});
  const [pendingUserDepartments, setPendingUserDepartments] = useState<
    Record<string, string | null>
  >({});
  const [allocationSourceNodeId, setAllocationSourceNodeId] = useState('');
  const [allocationTargetType, setAllocationTargetType] =
    useState<Exclude<AdminQuotaAccountScopeType, 'company'>>('department');
  const [allocationTargetId, setAllocationTargetId] = useState('');
  const [allocationAmount, setAllocationAmount] = useState('');
  const [allocationReason, setAllocationReason] = useState('');
  const [quotaRequestTargetNodeId, setQuotaRequestTargetNodeId] = useState('');
  const [quotaRequestAmount, setQuotaRequestAmount] = useState('');
  const [quotaRequestReason, setQuotaRequestReason] = useState('');
  const [quotaRequestReviewOpen, setQuotaRequestReviewOpen] = useState(false);
  const [quotaRequestDecisionReasons, setQuotaRequestDecisionReasons] = useState<
    Record<string, string>
  >({});
  const [createPeriodOpen, setCreatePeriodOpen] = useState(false);
  const [periodYear, setPeriodYear] = useState(String(new Date().getFullYear()));
  const [periodMonth, setPeriodMonth] = useState(String(new Date().getMonth() + 1));
  const [companyCredits, setCompanyCredits] = useState('10000');
  const [templatePeriodId, setTemplatePeriodId] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [quotaTransferIssues, setQuotaTransferIssues] = useState<QuotaTransferPrecheckIssue[]>([]);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance<
    OrgNode,
    Edge
  > | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<OrgNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const periodsQuery = useGetAdminQuotaPeriodsQuery({ status: 'all' });
  const departmentsQuery = useGetAdminDepartmentsQuery({ enabled: true });
  const usersQuery = useGetAdminUsersQuery({ limit: graphUserLimit });
  const updateDepartmentMutation = useUpdateAdminDepartmentMutation();
  const updateUserDepartmentMutation = useUpdateAdminUserDepartmentMutation();
  const createPeriodMutation = useCreateAdminQuotaPeriodMutation();
  const createAllocationMutation = useCreateAdminQuotaAllocationMutation();
  const createQuotaRequestMutation = useCreateAdminQuotaRequestMutation();
  const approveQuotaRequestMutation = useApproveAdminQuotaRequestMutation();
  const rejectQuotaRequestMutation = useRejectAdminQuotaRequestMutation();
  const periods = useMemo(() => periodsQuery.data?.periods ?? [], [periodsQuery.data?.periods]);
  const activePeriod = periods.find((period) => period.status === 'active') ?? periods[0] ?? null;
  const periodId = selectedPeriodId || activePeriod?.id || '';
  const hasQuotaPeriod = periodId.length > 0;
  const accountsQuery = useGetAdminQuotaAccountsQuery({ periodId }, { enabled: hasQuotaPeriod });
  const quotaRequestsQuery = useGetAdminQuotaRequestsQuery(
    { periodId, status: 'pending', limit: 100 },
    { enabled: hasQuotaPeriod && canReviewQuotaRequests },
  );
  const departments = useMemo(
    () => departmentsQuery.data?.departments ?? [],
    [departmentsQuery.data?.departments],
  );
  const users = useMemo(() => usersQuery.data?.users ?? [], [usersQuery.data?.users]);
  const adjustedDepartments = useMemo(
    () =>
      departments.map((department) => {
        if (!(department.id in pendingDepartmentParents)) {
          return department;
        }

        return {
          ...department,
          parentDepartmentId: pendingDepartmentParents[department.id],
        };
      }),
    [departments, pendingDepartmentParents],
  );
  const companyRootDepartment = useMemo(
    () => getCompanyRootDepartment(adjustedDepartments),
    [adjustedDepartments],
  );
  const adjustedUsers = useMemo(
    () =>
      users.map((user) => {
        if (!(user.id in pendingUserDepartments)) {
          return user;
        }

        return {
          ...user,
          departmentId: pendingUserDepartments[user.id],
        };
      }),
    [pendingUserDepartments, users],
  );
  const accounts = useMemo(
    () => accountsQuery.data?.accounts ?? [],
    [accountsQuery.data?.accounts],
  );
  const quotaPreviewAccounts = useMemo(
    () =>
      getAccountsWithPendingUserDepartmentTransfers({
        accounts,
        users,
        pendingUserDepartments,
        departments: adjustedDepartments,
        companyRootDepartment,
      }),
    [accounts, adjustedDepartments, companyRootDepartment, pendingUserDepartments, users],
  );
  const hasMoreUsers = usersQuery.data?.nextCursor != null;
  const graphLoadError = departmentsQuery.isError || usersQuery.isError;
  const graphLoading = departmentsQuery.isLoading || usersQuery.isLoading;

  const handleToggle = useCallback((nodeId: string) => {
    setExpandedNodeIds((current) => {
      const next = new Set(current);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  const handleAllocate = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);
    setMode('quota');
    setAllocationSourceNodeId(nodeId);
    setAllocationTargetType('department');
    setAllocationTargetId('');
    setAllocationAmount('');
    setAllocationReason('');
  }, []);

  useEffect(() => {
    if (mode === 'quota' && !hasQuotaPeriod) {
      setMode('view');
    }
    if (mode === 'organization' && !canChangeOrganization) {
      setMode('view');
    }
  }, [canChangeOrganization, hasQuotaPeriod, mode]);

  const filteredUsers = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    if (!normalizedSearch) {
      return adjustedUsers;
    }

    return adjustedUsers.filter((user) =>
      [user.name ?? '', user.username ?? '', user.email, user.role ?? '']
        .join(' ')
        .toLowerCase()
        .includes(normalizedSearch),
    );
  }, [adjustedUsers, search]);

  const filteredDepartments = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    if (!normalizedSearch) {
      return adjustedDepartments;
    }

    const matchedDepartmentIds = new Set(
      filteredUsers
        .map((user) => user.departmentId)
        .filter((departmentId): departmentId is string => departmentId != null),
    );

    return adjustedDepartments.filter(
      (department) =>
        `${department.name} ${department.code} ${department.description}`
          .toLowerCase()
          .includes(normalizedSearch) || matchedDepartmentIds.has(department.id),
    );
  }, [adjustedDepartments, filteredUsers, search]);
  const pendingAffectedDepartmentIds = useMemo(() => {
    const affectedDepartmentIds = new Set<string>();
    const usersById = new Map(users.map((user) => [user.id, user]));
    const addAffectedDepartmentId = (departmentId: string) => {
      affectedDepartmentIds.add(
        departmentId === companyRootDepartment?.id ? 'company' : `department:${departmentId}`,
      );
    };

    for (const [userId, departmentId] of Object.entries(pendingUserDepartments)) {
      const originalDepartmentId = usersById.get(userId)?.departmentId ?? null;

      if (originalDepartmentId) {
        addAffectedDepartmentId(originalDepartmentId);
      }

      if (departmentId) {
        addAffectedDepartmentId(departmentId);
      }
    }

    return affectedDepartmentIds;
  }, [companyRootDepartment?.id, pendingUserDepartments, users]);

  const graph = useMemo(
    () =>
      buildGraph({
        departments: filteredDepartments,
        users: filteredUsers,
        accounts: quotaPreviewAccounts,
        expandedNodeIds,
        mode,
        selectedNodeId,
        labels: {
          company: localize('com_ui_admin_org_graph_company'),
          root: localize('com_ui_admin_org_graph_root'),
          department: localize('com_ui_admin_department'),
          user: localize('com_ui_admin_quota_scope_user'),
          unassigned: localize('com_ui_admin_org_graph_unassigned_users'),
          enabled: localize('com_ui_admin_enabled'),
          disabled: localize('com_ui_admin_disabled'),
          noAccount: localize('com_ui_admin_org_graph_no_account'),
          expandUsers: localize('com_ui_admin_org_graph_expand_users'),
          collapseUsers: localize('com_ui_admin_org_graph_collapse_users'),
          allocate: localize('com_ui_admin_quota_allocate'),
          users: localize('com_ui_admin_users'),
          noUsers: localize('com_ui_admin_org_graph_no_users'),
          used: localize('com_ui_admin_org_graph_used_short'),
          allocated: localize('com_ui_admin_org_graph_allocated_short'),
        },
        onToggle: handleToggle,
        onAllocate: handleAllocate,
        pendingNodeIds: new Set([
          ...Object.keys(pendingDepartmentParents).map(
            (departmentId) => `department:${departmentId}`,
          ),
          ...Object.keys(pendingUserDepartments).map((userId) => `user:${userId}`),
        ]),
        pendingAffectedDepartmentIds,
        canAllocateQuota: canManageQuota,
      }),
    [
      expandedNodeIds,
      filteredDepartments,
      filteredUsers,
      handleAllocate,
      handleToggle,
      localize,
      mode,
      pendingDepartmentParents,
      pendingAffectedDepartmentIds,
      pendingUserDepartments,
      quotaPreviewAccounts,
      selectedNodeId,
      canManageQuota,
    ],
  );

  useEffect(() => {
    setNodes(graph.nodes);
    setEdges(graph.edges);
    if (!graph.lookup.has(selectedNodeId)) {
      setSelectedNodeId('company');
    }
  }, [graph, selectedNodeId, setEdges, setNodes]);

  useEffect(() => {
    if (!reactFlowInstance || graph.nodes.length === 0) {
      return;
    }

    window.setTimeout(() => {
      reactFlowInstance.fitView({ padding: 0.22, duration: 220 });
    }, 0);
  }, [graph.nodes.length, reactFlowInstance]);

  const handleArrangeGraph = useCallback(() => {
    setNodes(graph.nodes);
    setEdges(graph.edges);
    window.setTimeout(() => {
      reactFlowInstance?.fitView({ padding: 0.22, duration: 220 });
    }, 0);
  }, [graph.edges, graph.nodes, reactFlowInstance, setEdges, setNodes]);

  const selected = graph.lookup.get(selectedNodeId) ?? graph.lookup.get('company') ?? null;
  const pendingChangeCount =
    Object.keys(pendingDepartmentParents).length + Object.keys(pendingUserDepartments).length;
  const allocationSource =
    graph.lookup.get(allocationSourceNodeId) ?? graph.lookup.get(selectedNodeId) ?? null;
  const allocationSourceAccount = allocationSource?.account ?? null;
  const quotaRequestTarget =
    graph.lookup.get(quotaRequestTargetNodeId) ?? graph.lookup.get(selectedNodeId) ?? null;
  const quotaRequestTargetAccount = quotaRequestTarget?.account ?? null;
  const quotaRequestSourceAccount =
    quotaRequestTargetAccount?.parentAccountId != null
      ? (accounts.find((account) => account.id === quotaRequestTargetAccount.parentAccountId) ??
        null)
      : null;
  const pendingQuotaRequests = quotaRequestsQuery.data?.requests ?? [];
  const maxAllocationAmount = allocationSourceAccount
    ? Math.max(0, getAccountAllocatableCredits(allocationSourceAccount) ?? 0)
    : 0;
  const allocationAmountValue = Number(allocationAmount);
  const allocationTargetDepartments = adjustedDepartments.filter((department) => {
    if (department.id === companyRootDepartment?.id) {
      return false;
    }

    if (allocationSourceAccount?.scopeType === 'department') {
      return department.parentDepartmentId === allocationSourceAccount.scopeId;
    }

    if (allocationSourceAccount?.scopeType === 'company') {
      return (
        department.parentDepartmentId == null ||
        department.parentDepartmentId === companyRootDepartment?.id
      );
    }

    return false;
  });
  const allocationTargetUsers = adjustedUsers.filter(
    (user) =>
      (allocationSourceAccount?.scopeType !== 'department' ||
        user.departmentId === allocationSourceAccount.scopeId) &&
      (allocationSourceAccount?.scopeType !== 'company' ||
        (companyRootDepartment != null && user.departmentId === companyRootDepartment.id)) &&
      (allocationSourceAccount?.scopeType !== 'user' ||
        user.id !== allocationSourceAccount.scopeId),
  );
  const selectedDepartmentDescendantIds =
    selected?.department != null
      ? getDescendantDepartmentIds(adjustedDepartments, selected.department.id)
      : new Set<string>();
  const selectedDepartmentParentOptions = adjustedDepartments.filter(
    (department) =>
      selected?.department != null &&
      department.id !== selected.department.id &&
      !selectedDepartmentDescendantIds.has(department.id),
  );
  const isAllocationAmountOverLimit =
    Number.isFinite(allocationAmountValue) && allocationAmountValue > maxAllocationAmount;
  const canCreateAllocation =
    canManageQuota &&
    !createAllocationMutation.isLoading &&
    hasQuotaPeriod &&
    allocationSourceAccount != null &&
    allocationTargetId.length > 0 &&
    Number.isFinite(allocationAmountValue) &&
    allocationAmountValue > 0 &&
    !isAllocationAmountOverLimit;
  const quotaRequestAmountValue = Number(quotaRequestAmount);
  const canCreateQuotaRequest =
    canManageQuota &&
    !createQuotaRequestMutation.isLoading &&
    hasQuotaPeriod &&
    quotaRequestTargetAccount != null &&
    quotaRequestTargetAccount.scopeType !== 'company' &&
    quotaRequestSourceAccount != null &&
    Number.isFinite(quotaRequestAmountValue) &&
    quotaRequestAmountValue > 0 &&
    quotaRequestReason.trim().length > 0;
  const canCreatePeriod =
    !createPeriodMutation.isLoading &&
    Number.isInteger(Number(periodYear)) &&
    Number(periodYear) >= 1970 &&
    Number(periodYear) <= 9999 &&
    Number.isInteger(Number(periodMonth)) &&
    Number(periodMonth) >= 1 &&
    Number(periodMonth) <= 12 &&
    Number(companyCredits) >= 0;
  const modeOptions: Array<{ value: GraphMode; label: string; disabled?: boolean }> = [
    { value: 'view', label: localize('com_ui_admin_org_graph_mode_view') },
    {
      value: 'organization',
      label: localize('com_ui_admin_org_graph_mode_organization'),
      disabled: !canChangeOrganization,
    },
    {
      value: 'quota',
      label: localize('com_ui_admin_org_graph_mode_quota'),
      disabled: !hasQuotaPeriod,
    },
  ];
  const showError = (error: unknown, messageOverride?: string) => {
    const responseMessage = getResponseMessage(error);
    const localizedErrorKey = getQuotaOperationErrorKey(responseMessage);
    const message =
      messageOverride ??
      (localizedErrorKey ? localize(localizedErrorKey) : responseMessage) ??
      localize('com_ui_admin_quota_operation_failed');
    setNotice({
      title: localize('com_ui_error'),
      message,
    });
  };

  const handleCreateAllocation = async () => {
    if (!allocationSourceAccount) {
      setNotice({
        title: localize('com_ui_error'),
        message: localize('com_ui_admin_org_graph_allocation_source_missing'),
      });
      return;
    }

    try {
      await createAllocationMutation.mutateAsync({
        periodId,
        fromAccountId: allocationSourceAccount.id,
        scopeType: allocationTargetType,
        scopeId: allocationTargetId,
        amount: Number(allocationAmount),
        reason: allocationReason,
      });
      setAllocationSourceNodeId('');
      setAllocationTargetId('');
      setAllocationAmount('');
      setAllocationReason('');
      setNotice({
        title: localize('com_ui_saved'),
        message: localize('com_ui_admin_quota_allocation_created'),
      });
    } catch (error) {
      showError(error);
    }
  };

  const handleOpenQuotaRequest = (nodeId: string) => {
    setSelectedNodeId(nodeId);
    setQuotaRequestTargetNodeId(nodeId);
    setQuotaRequestAmount('');
    setQuotaRequestReason('');
  };

  const handleCreateQuotaRequest = async () => {
    if (!quotaRequestTargetAccount || !quotaRequestSourceAccount) {
      setNotice({
        title: localize('com_ui_error'),
        message: localize('com_ui_admin_org_graph_quota_request_source_missing'),
      });
      return;
    }

    try {
      await createQuotaRequestMutation.mutateAsync({
        periodId,
        targetAccountId: quotaRequestTargetAccount.id,
        sourceAccountId: quotaRequestSourceAccount.id,
        amount: Number(quotaRequestAmount),
        reason: quotaRequestReason,
      });
      setQuotaRequestTargetNodeId('');
      setQuotaRequestAmount('');
      setQuotaRequestReason('');
      setNotice({
        title: localize('com_ui_saved'),
        message: localize('com_ui_admin_org_graph_quota_request_created'),
      });
    } catch (error) {
      showError(error);
    }
  };

  const handleDecideQuotaRequest = async (
    request: AdminQuotaRequest,
    decision: 'approve' | 'reject',
  ) => {
    try {
      const reason = quotaRequestDecisionReasons[request.id] ?? '';
      if (decision === 'approve') {
        await approveQuotaRequestMutation.mutateAsync({ requestId: request.id, reason });
      } else {
        await rejectQuotaRequestMutation.mutateAsync({ requestId: request.id, reason });
      }
      setQuotaRequestDecisionReasons((current) => {
        const next = { ...current };
        delete next[request.id];
        return next;
      });
      setNotice({
        title: localize('com_ui_saved'),
        message:
          decision === 'approve'
            ? localize('com_ui_admin_org_graph_quota_request_approved')
            : localize('com_ui_admin_org_graph_quota_request_rejected'),
      });
    } catch (error) {
      showError(error);
    }
  };

  const handleCreatePeriod = async () => {
    try {
      const created = await createPeriodMutation.mutateAsync({
        year: Number(periodYear),
        month: Number(periodMonth),
        companyCredits: Number(companyCredits),
        templatePeriodId: templatePeriodId || null,
      });
      setSelectedPeriodId(created.period.id);
      setCreatePeriodOpen(false);
      setNotice({
        title: localize('com_ui_saved'),
        message: localize('com_ui_admin_quota_period_created'),
      });
    } catch (error) {
      showError(error);
    }
  };

  const handleDepartmentParentChange = (
    departmentId: string,
    parentDepartmentId: string | null,
  ) => {
    const originalParentId =
      departments.find((department) => department.id === departmentId)?.parentDepartmentId ?? null;

    setPendingDepartmentParents((current) => {
      const next = { ...current };
      if (parentDepartmentId === originalParentId) {
        delete next[departmentId];
      } else {
        next[departmentId] = parentDepartmentId;
      }
      return next;
    });
  };

  const handleUserDepartmentChange = (userId: string, departmentId: string | null) => {
    const originalDepartmentId = users.find((user) => user.id === userId)?.departmentId ?? null;

    setPendingUserDepartments((current) => {
      const next = { ...current };
      if (departmentId === originalDepartmentId) {
        delete next[userId];
      } else {
        next[userId] = departmentId;
      }
      return next;
    });
  };

  const handleResetOrganizationChanges = () => {
    setPendingDepartmentParents({});
    setPendingUserDepartments({});
    setQuotaTransferIssues([]);
  };

  const handleSaveOrganizationChanges = async () => {
    try {
      if (hasQuotaPeriod && Object.keys(pendingUserDepartments).length > 0) {
        const transferIssues = getPendingUserDepartmentTransferIssues({
          accounts,
          users,
          pendingUserDepartments,
          departments: adjustedDepartments,
          companyRootDepartment,
          companyLabel: localize('com_ui_admin_org_graph_company'),
          noDepartmentLabel: localize('com_ui_admin_org_graph_unassigned_users'),
        });

        if (transferIssues.length > 0) {
          setQuotaTransferIssues(transferIssues);
          return;
        }
      }

      for (const [departmentId, parentDepartmentId] of Object.entries(pendingDepartmentParents)) {
        await updateDepartmentMutation.mutateAsync({
          departmentId,
          parentDepartmentId,
        });
      }

      for (const [userId, departmentId] of Object.entries(pendingUserDepartments)) {
        await updateUserDepartmentMutation.mutateAsync({
          userId,
          departmentId,
          quotaPeriodId: periodId || null,
        });
      }

      setPendingDepartmentParents({});
      setPendingUserDepartments({});
      setNotice({
        title: localize('com_ui_saved'),
        message: localize('com_ui_admin_org_graph_organization_saved'),
      });
    } catch (error) {
      showError(error);
    }
  };

  let graphContent: React.ReactNode;
  if (graphLoading) {
    graphContent = (
      <div className="flex h-full items-center justify-center text-sm text-text-secondary">
        {localize('com_ui_loading')}
      </div>
    );
  } else if (graphLoadError) {
    graphContent = (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-red-300">
        {localize('com_ui_admin_org_graph_load_failed')}
      </div>
    );
  } else {
    graphContent = (
      <ReactFlow<OrgNode, Edge>
        nodes={nodes}
        edges={edges}
        nodeTypes={{ orgNode: OrgGraphNode }}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onInit={setReactFlowInstance}
        onNodeClick={(_, node) => setSelectedNodeId(node.id)}
        onNodeDoubleClick={(_, node) => {
          if (node.data.canExpand) {
            handleToggle(node.id);
          }
        }}
        fitView={true}
        zoomOnDoubleClick={false}
        nodesDraggable={mode === 'organization'}
        nodesConnectable={false}
        elementsSelectable={true}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={18} />
        <Controls className="admin-org-graph-controls" />
        <MiniMap
          pannable={true}
          zoomable={true}
          className="admin-org-graph-minimap"
          maskColor="rgba(15, 23, 42, 0.32)"
          nodeColor={(node) => {
            const kind = (node.data as OrgGraphNodeData | undefined)?.kind;
            if (kind === 'company') {
              return '#10b981';
            }
            if (kind === 'department') {
              return '#0ea5e9';
            }
            if (kind === 'user') {
              return '#8b5cf6';
            }
            return '#f59e0b';
          }}
        />
      </ReactFlow>
    );
  }

  return (
    <AdminLayout title={localize('com_ui_admin_org_graph')} hideHeader={true}>
      <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
        <section className="shrink-0 rounded-3xl border border-border-medium bg-surface-primary p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-background text-text-primary">
                <Network className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-medium text-text-primary">
                  {localize('com_ui_admin_org_graph')}
                </h1>
                <AdminHelpButton title="com_ui_admin_org_graph">
                  <div className="mt-4 space-y-4 text-sm leading-6 text-text-secondary">
                    <section className="rounded-2xl border border-border-light bg-background p-4">
                      <div className="flex items-center gap-2 font-medium text-text-primary">
                        <Move className="h-4 w-4" aria-hidden="true" />
                        {localize('com_ui_admin_org_graph_help_navigation_title')}
                      </div>
                      <p className="mt-2">{localize('com_ui_admin_org_graph_pan_hint')}</p>
                    </section>

                    <section className="rounded-2xl border border-border-light bg-background p-4">
                      <div className="flex items-center gap-2 font-medium text-text-primary">
                        <Users className="h-4 w-4" aria-hidden="true" />
                        {localize('com_ui_admin_org_graph_help_users_title')}
                      </div>
                      <p className="mt-2">{localize('com_ui_admin_org_graph_expand_hint')}</p>
                    </section>

                    <section className="rounded-2xl border border-border-light bg-background p-4">
                      <div className="flex items-center gap-2 font-medium text-text-primary">
                        <MousePointer2 className="h-4 w-4" aria-hidden="true" />
                        {localize('com_ui_admin_org_graph_help_modes_title')}
                      </div>
                      <div className="mt-3 space-y-2">
                        <p>{localize('com_ui_admin_org_graph_canvas_hint_view')}</p>
                        <p>{localize('com_ui_admin_org_graph_canvas_hint_organization')}</p>
                        <p>{localize('com_ui_admin_org_graph_canvas_hint_quota')}</p>
                      </div>
                    </section>
                  </div>
                </AdminHelpButton>
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(260px,0.8fr)_repeat(3,minmax(120px,0.45fr))]">
            <label className="flex flex-col gap-2 text-sm text-text-secondary">
              {localize('com_ui_search')}
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={localize('com_ui_admin_org_graph_search_placeholder')}
                  className="w-full rounded-xl border border-border-medium bg-background py-2 pl-9 pr-3 text-sm text-text-primary"
                />
              </div>
            </label>

            <label className="flex flex-col gap-2 text-sm text-text-secondary">
              {localize('com_ui_admin_quota_periods_short')}
              <div className="flex gap-2">
                <select
                  value={periodId}
                  onChange={(event) => setSelectedPeriodId(event.target.value)}
                  disabled={periods.length === 0}
                  className="min-w-0 flex-1 rounded-xl border border-border-medium bg-background px-3 py-2 text-sm text-text-primary"
                >
                  {periods.length === 0 ? (
                    <option value="">{localize('com_ui_admin_quota_periods_empty')}</option>
                  ) : null}
                  {periods.map((period) => (
                    <option key={period.id} value={period.id}>
                      {period.periodKey}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="admin-button-secondary flex h-10 w-10 shrink-0 items-center justify-center rounded-xl disabled:cursor-not-allowed disabled:opacity-60"
                  aria-label={localize('com_ui_admin_quota_period_create')}
                  disabled={!isAdmin}
                  onClick={() => setCreatePeriodOpen(true)}
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </label>

            <div className="rounded-2xl border border-border-light bg-background px-3 py-2">
              <div className="text-xs text-text-secondary">
                {localize('com_ui_admin_departments')}
              </div>
              <div className="mt-1 text-lg font-semibold text-text-primary">
                {filteredDepartments.length}
              </div>
            </div>
            <div className="rounded-2xl border border-border-light bg-background px-3 py-2">
              <div className="text-xs text-text-secondary">{localize('com_ui_admin_users')}</div>
              <div className="mt-1 text-lg font-semibold text-text-primary">
                {filteredUsers.length}
              </div>
            </div>
            <div className="rounded-2xl border border-border-light bg-background px-3 py-2">
              <div className="text-xs text-text-secondary">
                {localize('com_ui_admin_quota_accounts')}
              </div>
              <div className="mt-1 text-lg font-semibold text-text-primary">{accounts.length}</div>
            </div>
          </div>

          {hasMoreUsers ? (
            <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
              {localize('com_ui_admin_org_graph_user_limit_notice', { count: graphUserLimit })}
            </div>
          ) : null}
        </section>

        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-border-medium bg-surface-primary">
          <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border-light bg-surface-primary p-3">
            <div className="rounded-2xl border border-border-light bg-background p-1">
              <button
                type="button"
                className="admin-button-secondary inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium"
                onClick={handleArrangeGraph}
              >
                <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
                {localize('com_ui_admin_org_graph_arrange')}
              </button>
            </div>
            <div className="inline-flex overflow-hidden rounded-2xl border border-border-light bg-background p-1">
              {modeOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  disabled={option.disabled}
                  className={`${modeButtonClassName} ${
                    mode === option.value
                      ? 'admin-button-primary rounded-xl'
                      : 'rounded-xl text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                  }`}
                  onClick={() => {
                    if (!option.disabled) {
                      setMode(option.value);
                    }
                  }}
                >
                  {option.label}
                  {option.value === 'quota' && pendingQuotaRequests.length > 0 ? (
                    <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-semibold text-white">
                      {pendingQuotaRequests.length}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
            {mode === 'quota' && canReviewQuotaRequests ? (
              <button
                type="button"
                className="admin-button-secondary inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!hasQuotaPeriod}
                onClick={() => setQuotaRequestReviewOpen(true)}
              >
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                {localize('com_ui_admin_org_graph_quota_requests')}
                {pendingQuotaRequests.length > 0 ? (
                  <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-semibold text-white">
                    {pendingQuotaRequests.length}
                  </span>
                ) : null}
              </button>
            ) : null}
            {mode === 'organization' ? (
              <div className="flex flex-wrap items-center gap-3 xl:ml-auto xl:mr-[360px]">
                {pendingChangeCount > 0 ? (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-200">
                    {localize('com_ui_admin_org_graph_pending_changes', {
                      count: pendingChangeCount,
                    })}
                  </div>
                ) : null}
                <button
                  type="button"
                  disabled={
                    pendingChangeCount === 0 ||
                    updateDepartmentMutation.isLoading ||
                    updateUserDepartmentMutation.isLoading
                  }
                  className="admin-button-secondary inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={handleResetOrganizationChanges}
                >
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  {localize('com_ui_reset')}
                </button>
                <button
                  type="button"
                  disabled={
                    pendingChangeCount === 0 ||
                    updateDepartmentMutation.isLoading ||
                    updateUserDepartmentMutation.isLoading
                  }
                  className="admin-button-secondary inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={handleSaveOrganizationChanges}
                >
                  <Save className="h-4 w-4" aria-hidden="true" />
                  {localize('com_ui_save')}
                </button>
              </div>
            ) : null}
          </div>
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <div className="min-h-0 flex-1 bg-background">{graphContent}</div>

            <aside className="hidden h-full min-h-0 w-[360px] shrink-0 overflow-y-auto overscroll-contain border-l border-border-light bg-surface-primary p-5 xl:block">
              {selected ? (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-border-light bg-background p-4">
                    <div className="text-sm font-semibold text-text-primary">{selected.label}</div>
                    <div className="mt-1 text-sm text-text-secondary">{selected.secondary}</div>

                    <div className="mt-4 rounded-xl border border-border-light bg-surface-primary px-3 py-2 text-xs">
                      <div className="text-text-secondary">{localize('com_ui_admin_users')}</div>
                      <div className="mt-1 font-medium text-text-primary">{selected.userCount}</div>
                    </div>

                    <div className="mt-4 space-y-3 text-xs">
                      <div>
                        <div className="mb-1 flex items-center justify-between gap-3 text-text-secondary">
                          <span>{localize('com_ui_admin_org_graph_allocated_short')}</span>
                          <span className="text-text-primary">
                            {formatCredits(getAccountAllocatedCredits(selected.account))} /{' '}
                            {formatCredits(getAccountLimitCredits(selected.account))}
                          </span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-surface-primary">
                          <div
                            className="h-full rounded-full bg-amber-500"
                            style={{
                              width: `${
                                selected.account && getAccountLimitCredits(selected.account)
                                  ? Math.min(
                                      100,
                                      Math.round(
                                        ((getAccountAllocatedCredits(selected.account) ?? 0) /
                                          (getAccountLimitCredits(selected.account) ?? 1)) *
                                          100,
                                      ),
                                    )
                                  : 0
                              }%`,
                            }}
                          />
                        </div>
                      </div>
                      <div>
                        <div className="mb-1 flex items-center justify-between gap-3 text-text-secondary">
                          <span>{localize('com_ui_admin_org_graph_used_short')}</span>
                          <span className="text-text-primary">
                            {formatCredits(selected.account?.usedCredits ?? null)} /{' '}
                            {formatCredits(getAccountLimitCredits(selected.account))}
                            {selected.account && getAccountLimitCredits(selected.account)
                              ? ` (${Math.min(
                                  100,
                                  Math.round(
                                    ((selected.account.usedCredits ?? 0) /
                                      (getAccountLimitCredits(selected.account) ?? 1)) *
                                      100,
                                  ),
                                )}%)`
                              : ''}
                          </span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-surface-primary">
                          <div
                            className="h-full rounded-full bg-blue-500"
                            style={{
                              width: `${
                                selected.account && getAccountLimitCredits(selected.account)
                                  ? Math.min(
                                      100,
                                      Math.round(
                                        ((selected.account.usedCredits ?? 0) /
                                          (getAccountLimitCredits(selected.account) ?? 1)) *
                                          100,
                                      ),
                                    )
                                  : 0
                              }%`,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {selected.userCount > 0 &&
                  (selected.kind === 'company' ||
                    selected.kind === 'department' ||
                    selected.kind === 'unassigned') ? (
                    <button
                      type="button"
                      className="admin-button-secondary w-full rounded-xl px-4 py-2 text-sm font-medium"
                      onClick={() => handleToggle(selectedNodeId)}
                    >
                      {expandedNodeIds.has(selectedNodeId)
                        ? localize('com_ui_admin_org_graph_collapse_users')
                        : localize('com_ui_admin_org_graph_expand_users')}
                    </button>
                  ) : null}

                  {mode === 'organization' && selected.department ? (
                    <label className="flex flex-col gap-2 text-sm text-text-secondary">
                      {localize('com_ui_admin_org_graph_parent_department')}
                      <select
                        className={inputClassName}
                        value={selected.department.parentDepartmentId ?? ''}
                        onChange={(event) =>
                          handleDepartmentParentChange(
                            selected.department?.id ?? '',
                            event.target.value || null,
                          )
                        }
                      >
                        <option value="">{localize('com_ui_admin_org_graph_company')}</option>
                        {selectedDepartmentParentOptions.map((department) => (
                          <option key={department.id} value={department.id}>
                            {department.name} ({department.code})
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}

                  {mode === 'organization' && selected.user ? (
                    <label className="flex flex-col gap-2 text-sm text-text-secondary">
                      {localize('com_ui_admin_department')}
                      <select
                        className={inputClassName}
                        value={selected.user.departmentId ?? ''}
                        onChange={(event) =>
                          handleUserDepartmentChange(
                            selected.user?.id ?? '',
                            event.target.value || null,
                          )
                        }
                      >
                        <option value="">
                          {localize('com_ui_admin_org_graph_unassigned_users')}
                        </option>
                        {adjustedDepartments.map((department) => (
                          <option key={department.id} value={department.id}>
                            {department.name} ({department.code})
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}

                  {mode === 'quota' ? (
                    <div className="space-y-2">
                      <button
                        type="button"
                        disabled={
                          !canManageQuota ||
                          selected.kind === 'user' ||
                          !selected.account ||
                          (getAccountAllocatableCredits(selected.account) ?? 0) <= 0
                        }
                        className="admin-button-primary w-full rounded-xl px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
                        onClick={() => handleAllocate(selectedNodeId)}
                      >
                        {localize('com_ui_admin_quota_allocate')}
                      </button>
                      <button
                        type="button"
                        disabled={
                          !canManageQuota ||
                          !selected.account ||
                          selected.account.scopeType === 'company' ||
                          selected.account.parentAccountId == null
                        }
                        className="admin-button-secondary inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
                        onClick={() => handleOpenQuotaRequest(selectedNodeId)}
                      >
                        <Send className="h-4 w-4" aria-hidden="true" />
                        {localize('com_ui_admin_org_graph_quota_request_create')}
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="mt-5 rounded-2xl border border-dashed border-border-medium bg-background p-6 text-sm text-text-secondary">
                  {localize('com_ui_admin_org_graph_select_node')}
                </div>
              )}
            </aside>
          </div>
        </section>
      </div>
      {createPeriodOpen ? (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-2xl border border-border-light bg-surface-primary p-5 shadow-xl">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-base font-semibold text-text-primary">
                {localize('com_ui_admin_quota_period_create')}
              </h2>
              <button
                type="button"
                className="admin-button-secondary flex h-9 w-9 items-center justify-center rounded-xl"
                aria-label={localize('com_ui_close')}
                onClick={() => setCreatePeriodOpen(false)}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <label className={labelClassName}>
                  {localize('com_ui_admin_quota_year')}
                  <input
                    className={inputClassName}
                    type="number"
                    min="1970"
                    max="9999"
                    value={periodYear}
                    onChange={(event) => setPeriodYear(event.target.value)}
                  />
                </label>
                <label className={labelClassName}>
                  {localize('com_ui_admin_quota_month')}
                  <select
                    className={inputClassName}
                    value={periodMonth}
                    onChange={(event) => setPeriodMonth(event.target.value)}
                  >
                    {Array.from({ length: 12 }, (_value, index) => (
                      <option key={index + 1} value={String(index + 1)}>
                        {index + 1}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className={labelClassName}>
                {localize('com_ui_admin_quota_company_credits')}
                <input
                  className={inputClassName}
                  type="number"
                  min="0"
                  value={companyCredits}
                  onChange={(event) => setCompanyCredits(event.target.value)}
                />
              </label>

              <label className={labelClassName}>
                {localize('com_ui_admin_quota_period_template')}
                <select
                  className={inputClassName}
                  value={templatePeriodId}
                  onChange={(event) => setTemplatePeriodId(event.target.value)}
                >
                  <option value="">{localize('com_ui_admin_quota_period_template_none')}</option>
                  {periods.map((period) => (
                    <option key={period.id} value={period.id}>
                      {period.periodKey}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="admin-button-primary rounded-xl px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={!canCreatePeriod}
                  onClick={handleCreatePeriod}
                >
                  {localize('com_ui_create')}
                </button>
                <button
                  type="button"
                  className="admin-button-secondary rounded-xl px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={createPeriodMutation.isLoading}
                  onClick={() => setCreatePeriodOpen(false)}
                >
                  {localize('com_ui_cancel')}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {allocationSourceNodeId ? (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-2xl border border-border-light bg-surface-primary p-5 shadow-xl">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-base font-semibold text-text-primary">
                {localize('com_ui_admin_quota_allocation')}
              </h2>
              <button
                type="button"
                className="admin-button-secondary flex h-9 w-9 items-center justify-center rounded-xl"
                aria-label={localize('com_ui_close')}
                onClick={() => setAllocationSourceNodeId('')}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div className="rounded-xl border border-border-light bg-background p-3 text-sm">
                <div className="text-xs text-text-secondary">
                  {localize('com_ui_admin_quota_source_account')}
                </div>
                <div className="mt-1 font-medium text-text-primary">
                  {allocationSource?.label ?? '-'}
                </div>
                <div className="mt-1 text-xs text-text-secondary">
                  {localize('com_ui_admin_quota_allocation_available')}:{' '}
                  <span className="text-text-primary">{formatCredits(maxAllocationAmount)}</span>
                </div>
              </div>

              {!allocationSourceAccount ? (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-300">
                  {localize('com_ui_admin_org_graph_allocation_source_missing')}
                </div>
              ) : null}

              <label className={labelClassName}>
                {localize('com_ui_admin_quota_allocation_target')}
                <select
                  className={inputClassName}
                  value={allocationTargetType}
                  onChange={(event) => {
                    setAllocationTargetType(
                      event.target.value as Exclude<AdminQuotaAccountScopeType, 'company'>,
                    );
                    setAllocationTargetId('');
                  }}
                >
                  <option value="department">{localize('com_ui_admin_department')}</option>
                  <option value="user">{localize('com_ui_admin_user')}</option>
                </select>
              </label>

              {allocationTargetType === 'department' ? (
                <label className={labelClassName}>
                  {localize('com_ui_admin_department')}
                  <select
                    className={inputClassName}
                    value={allocationTargetId}
                    onChange={(event) => setAllocationTargetId(event.target.value)}
                  >
                    <option value="">{localize('com_ui_select')}</option>
                    {allocationTargetDepartments.map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.name} ({department.code})
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label className={labelClassName}>
                  {localize('com_ui_admin_user')}
                  <select
                    className={inputClassName}
                    value={allocationTargetId}
                    onChange={(event) => setAllocationTargetId(event.target.value)}
                  >
                    <option value="">{localize('com_ui_select')}</option>
                    {allocationTargetUsers.map((user) => (
                      <option key={user.id} value={user.id}>
                        {getUserDisplayName(user)} - {user.email}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label className={labelClassName}>
                {localize('com_ui_admin_quota_amount')}
                <input
                  className={inputClassName}
                  type="number"
                  min="0"
                  max={maxAllocationAmount}
                  value={allocationAmount}
                  onChange={(event) => setAllocationAmount(event.target.value)}
                />
              </label>

              <div className="rounded-xl border border-border-light bg-background p-3">
                <input
                  className="w-full accent-primary disabled:cursor-not-allowed disabled:opacity-60"
                  type="range"
                  min="0"
                  max={maxAllocationAmount}
                  step="1"
                  value={
                    Number.isFinite(allocationAmountValue)
                      ? Math.min(Math.max(allocationAmountValue, 0), maxAllocationAmount)
                      : 0
                  }
                  disabled={maxAllocationAmount <= 0}
                  aria-label={localize('com_ui_admin_quota_amount')}
                  onChange={(event) => setAllocationAmount(event.target.value)}
                />
                {isAllocationAmountOverLimit ? (
                  <p className="mt-2 text-xs text-red-600 dark:text-red-300">
                    {localize('com_ui_admin_quota_allocation_amount_exceeds')}
                  </p>
                ) : null}
              </div>

              <label className={labelClassName}>
                {localize('com_ui_admin_quota_reason')}
                <input
                  className={inputClassName}
                  value={allocationReason}
                  onChange={(event) => setAllocationReason(event.target.value)}
                />
              </label>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="admin-button-primary rounded-xl px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={!canCreateAllocation}
                  onClick={handleCreateAllocation}
                >
                  {localize('com_ui_admin_quota_allocate')}
                </button>
                <button
                  type="button"
                  className="admin-button-secondary rounded-xl px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={createAllocationMutation.isLoading}
                  onClick={() => setAllocationSourceNodeId('')}
                >
                  {localize('com_ui_cancel')}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {quotaRequestTargetNodeId ? (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-2xl border border-border-light bg-surface-primary p-5 shadow-xl">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-base font-semibold text-text-primary">
                {localize('com_ui_admin_org_graph_quota_request_create')}
              </h2>
              <button
                type="button"
                className="admin-button-secondary flex h-9 w-9 items-center justify-center rounded-xl"
                aria-label={localize('com_ui_close')}
                onClick={() => setQuotaRequestTargetNodeId('')}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-border-light bg-background p-3 text-sm">
                  <div className="text-xs text-text-secondary">
                    {localize('com_ui_admin_quota_source_account')}
                  </div>
                  <div className="mt-1 font-medium text-text-primary">
                    {getQuotaAccountLabel(quotaRequestSourceAccount)}
                  </div>
                  <div className="mt-1 text-xs text-text-secondary">
                    {localize('com_ui_admin_quota_allocation_available')}:{' '}
                    <span className="text-text-primary">
                      {formatCredits(
                        getAccountAllocatableCredits(quotaRequestSourceAccount ?? undefined),
                      )}
                    </span>
                  </div>
                </div>
                <div className="rounded-xl border border-border-light bg-background p-3 text-sm">
                  <div className="text-xs text-text-secondary">
                    {localize('com_ui_admin_quota_allocation_target')}
                  </div>
                  <div className="mt-1 font-medium text-text-primary">
                    {getQuotaAccountLabel(quotaRequestTargetAccount)}
                  </div>
                </div>
              </div>

              {!quotaRequestSourceAccount ? (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-300">
                  {localize('com_ui_admin_org_graph_quota_request_source_missing')}
                </div>
              ) : null}

              <label className={labelClassName}>
                {localize('com_ui_admin_quota_amount')}
                <input
                  className={inputClassName}
                  type="number"
                  min="0"
                  value={quotaRequestAmount}
                  onChange={(event) => setQuotaRequestAmount(event.target.value)}
                />
              </label>

              <label className={labelClassName}>
                {localize('com_ui_admin_quota_reason')}
                <textarea
                  className={`${inputClassName} min-h-[96px] resize-y`}
                  value={quotaRequestReason}
                  onChange={(event) => setQuotaRequestReason(event.target.value)}
                />
              </label>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="admin-button-primary rounded-xl px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={!canCreateQuotaRequest}
                  onClick={handleCreateQuotaRequest}
                >
                  {localize('com_ui_admin_org_graph_quota_request_submit')}
                </button>
                <button
                  type="button"
                  className="admin-button-secondary rounded-xl px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={createQuotaRequestMutation.isLoading}
                  onClick={() => setQuotaRequestTargetNodeId('')}
                >
                  {localize('com_ui_cancel')}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {quotaRequestReviewOpen ? (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[calc(100vh-3rem)] w-full max-w-4xl flex-col rounded-2xl border border-border-light bg-surface-primary p-5 shadow-xl">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-base font-semibold text-text-primary">
                {localize('com_ui_admin_org_graph_quota_requests')}
              </h2>
              <button
                type="button"
                className="admin-button-secondary flex h-9 w-9 items-center justify-center rounded-xl"
                aria-label={localize('com_ui_close')}
                onClick={() => setQuotaRequestReviewOpen(false)}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-4 min-h-0 overflow-y-auto">
              {pendingQuotaRequests.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border-medium bg-background p-6 text-sm text-text-secondary">
                  {localize('com_ui_admin_org_graph_quota_requests_empty')}
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingQuotaRequests.map((request) => (
                    <div
                      key={request.id}
                      className="rounded-2xl border border-border-light bg-background p-4"
                    >
                      <div className="grid gap-3 lg:grid-cols-2">
                        <div className="rounded-xl border border-border-light bg-surface-primary p-4">
                          <div className="text-xs font-medium text-text-secondary">
                            {localize('com_ui_admin_quota_source')}
                          </div>
                          <div className="mt-1 text-sm font-medium text-text-primary">
                            {getQuotaAccountLabel(request.sourceAccount)}
                          </div>
                          <div className="mt-4 text-xs text-text-secondary">
                            {localize('com_ui_admin_org_graph_quota_request_source_change')}
                          </div>
                          <CreditChange
                            before={getQuotaRequestSourceBefore(request)}
                            after={getQuotaRequestSourceAfter(request)}
                          />
                        </div>
                        <div className="rounded-xl border border-border-light bg-surface-primary p-4">
                          <div className="text-xs font-medium text-text-secondary">
                            {localize('com_ui_admin_quota_allocation_target')}
                          </div>
                          <div className="mt-1 text-sm font-medium text-text-primary">
                            {getQuotaAccountLabel(request.targetAccount, { showUserAlias: true })}
                          </div>
                          <div className="mt-4 text-xs text-text-secondary">
                            {localize('com_ui_admin_org_graph_quota_request_target_change')}
                          </div>
                          <CreditChange
                            before={getQuotaRequestTargetBefore(request)}
                            after={getQuotaRequestTargetAfter(request)}
                          />
                        </div>
                      </div>
                      <div className="mt-3 grid gap-3 md:grid-cols-[180px_1fr]">
                        <div className="rounded-xl border border-border-light bg-surface-primary px-3 py-2">
                          <div className="text-xs text-text-secondary">
                            {localize('com_ui_admin_org_graph_quota_request_amount')}
                          </div>
                          <div className="mt-1 text-sm font-semibold text-text-primary">
                            {formatCredits(request.amount)}
                          </div>
                        </div>
                        <div className="rounded-xl border border-border-light bg-surface-primary px-3 py-2">
                          <div className="text-xs text-text-secondary">
                            {localize('com_ui_admin_org_graph_quota_request_reason')}
                          </div>
                          <div className="mt-1 text-sm text-text-primary">{request.reason}</div>
                        </div>
                      </div>
                      {request.sourceAccount &&
                      (getAccountAllocatableCredits(request.sourceAccount) ?? 0) <
                        request.amount ? (
                        <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-200">
                          {localize('com_ui_admin_org_graph_quota_request_insufficient_source')}
                        </div>
                      ) : null}
                      <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                        <label className={labelClassName}>
                          {localize('com_ui_admin_org_graph_quota_request_decision_reason')}
                          <input
                            className={inputClassName}
                            value={quotaRequestDecisionReasons[request.id] ?? ''}
                            onChange={(event) =>
                              setQuotaRequestDecisionReasons((current) => ({
                                ...current,
                                [request.id]: event.target.value,
                              }))
                            }
                          />
                        </label>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="admin-button-primary rounded-xl px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={
                              approveQuotaRequestMutation.isLoading ||
                              (request.sourceAccount != null &&
                                (getAccountAllocatableCredits(request.sourceAccount) ?? 0) <
                                  request.amount)
                            }
                            onClick={() => handleDecideQuotaRequest(request, 'approve')}
                          >
                            {localize('com_ui_approve')}
                          </button>
                          <button
                            type="button"
                            className="admin-button-secondary rounded-xl px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={rejectQuotaRequestMutation.isLoading}
                            onClick={() => handleDecideQuotaRequest(request, 'reject')}
                          >
                            {localize('com_ui_reject')}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
      {quotaTransferIssues.length > 0 ? (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[calc(100vh-3rem)] w-full max-w-3xl flex-col rounded-2xl border border-border-light bg-surface-primary p-5 shadow-xl">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-base font-semibold text-text-primary">
                {localize('com_ui_admin_org_graph_quota_transfer_blocked')}
              </h2>
              <button
                type="button"
                className="admin-button-secondary flex h-9 w-9 items-center justify-center rounded-xl"
                aria-label={localize('com_ui_close')}
                onClick={() => setQuotaTransferIssues([])}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <p className="mt-3 text-sm text-text-secondary">
              {localize('com_ui_admin_org_graph_quota_transfer_blocked_hint')}
            </p>

            <div className="mt-4 min-h-0 overflow-y-auto rounded-2xl border border-border-light">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="bg-background text-xs text-text-secondary">
                  <tr>
                    <th className="px-3 py-2 font-medium">{localize('com_ui_admin_user')}</th>
                    <th className="px-3 py-2 font-medium">
                      {localize('com_ui_admin_quota_allocation_target')}
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      {localize('com_ui_admin_org_graph_required_credits')}
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      {localize('com_ui_admin_org_graph_available_credits')}
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      {localize('com_ui_admin_org_graph_shortage_credits')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-light">
                  {quotaTransferIssues.map((issue) => (
                    <tr key={`${issue.userId}:${issue.targetLabel}`}>
                      <td className="px-3 py-2 text-text-primary">{issue.userLabel}</td>
                      <td className="px-3 py-2 text-text-secondary">{issue.targetLabel}</td>
                      <td className="px-3 py-2 text-right text-text-primary">
                        {formatCredits(issue.requiredCredits)}
                      </td>
                      <td className="px-3 py-2 text-right text-text-primary">
                        {formatCredits(issue.availableCredits)}
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-red-600 dark:text-red-300">
                        {formatCredits(issue.shortageCredits)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                className="admin-button-primary rounded-xl px-4 py-2 text-sm font-medium"
                onClick={() => setQuotaTransferIssues([])}
              >
                {localize('com_ui_confirm')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {notice ? (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border-light bg-surface-primary p-5 shadow-xl">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-base font-semibold text-text-primary">{notice.title}</h2>
              <button
                type="button"
                className="admin-button-secondary flex h-9 w-9 items-center justify-center rounded-xl"
                aria-label={localize('com_ui_close')}
                onClick={() => setNotice(null)}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <p className="mt-4 text-sm text-text-secondary">{notice.message}</p>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                className="admin-button-primary rounded-xl px-4 py-2 text-sm font-medium"
                onClick={() => setNotice(null)}
              >
                {localize('com_ui_confirm')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AdminLayout>
  );
}
