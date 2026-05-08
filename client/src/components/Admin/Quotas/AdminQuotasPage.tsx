import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import type {
  AdminQuotaAccount,
  AdminQuotaAccountScopeType,
  AdminQuotaGrantStatus,
  AdminQuotaLedgerEntryType,
  AdminQuotaPeriod,
  AdminQuotaPeriodStatus,
  AdminUserSummary,
} from 'librechat-data-provider';
import AdminLayout from '../AdminLayout';
import { formatAdminDateValue } from '../AdminDateTimePicker';
import {
  useActivateAdminQuotaPeriodMutation,
  useApproveAdminQuotaGrantRequestMutation,
  useCloseAdminQuotaPeriodMutation,
  useCreateAdminQuotaAllocationMutation,
  useCreateAdminQuotaGrantRequestMutation,
  useCreateAdminQuotaPeriodMutation,
  useRejectAdminQuotaGrantRequestMutation,
} from '~/data-provider/Admin/mutations';
import {
  useGetAdminDepartmentsQuery,
  useGetAdminQuotaAccountsQuery,
  useGetAdminQuotaGrantsQuery,
  useGetAdminQuotaLedgerQuery,
  useGetAdminQuotaPeriodsQuery,
  useGetAdminUsersQuery,
} from '~/data-provider/Admin';
import { useLocalize } from '~/hooks';

type Notice = {
  title: string;
  message: string;
};

type ResponseErrorBody = {
  error?: string;
  message?: string;
};

type ResponseError = {
  message?: string;
  response?: {
    status?: number;
    data?: ResponseErrorBody;
  };
};

type QuotaModal = 'period' | 'allocation' | 'grant' | 'periods' | 'ledger' | 'grants' | null;
type AccountScopeFilter = AdminQuotaAccountScopeType | 'all';

const pageSize = 10;
const sectionClassName = 'rounded-3xl border border-border-medium bg-surface-primary p-5';
const inputClassName =
  'w-full rounded-xl border border-border-medium bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary disabled:cursor-not-allowed disabled:opacity-60 [color-scheme:light] dark:[color-scheme:dark]';
const labelClassName = 'flex flex-col gap-2 text-sm text-text-secondary';
const primaryButtonClassName =
  'admin-button-primary rounded-xl px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60';
const secondaryButtonClassName =
  'admin-button-secondary rounded-xl px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60';
const smallSecondaryButtonClassName =
  'admin-button-secondary rounded-lg px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-60';

function formatCredits(value: number) {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
  }).format(value);
}

function getAccountLabel(
  account: AdminQuotaAccount,
  departmentsById: Map<string, string>,
  companyLabel: string,
) {
  if (account.scopeType === 'company') {
    return companyLabel;
  }

  if (account.scopeLabel) {
    return account.scopeLabel;
  }

  if (account.scopeType === 'department' && account.scopeId) {
    return departmentsById.get(account.scopeId) ?? account.scopeId;
  }

  return account.scopeId ?? account.id;
}

function getUserLabel(user: AdminUserSummary) {
  const displayName = user.name || user.username || user.email || user.id;
  const secondary = user.email && user.email !== displayName ? ` - ${user.email}` : '';

  return `${displayName}${secondary} (${user.id})`;
}

function getOptionalAccountLabel(
  account: AdminQuotaAccount | null,
  departmentsById: Map<string, string>,
  companyLabel: string,
) {
  if (!account) {
    return '-';
  }

  return getAccountLabel(account, departmentsById, companyLabel);
}

function getLedgerDirectionLabel(amount: number, localize: ReturnType<typeof useLocalize>) {
  if (amount > 0) {
    return localize('com_ui_admin_quota_direction_in');
  }

  if (amount < 0) {
    return localize('com_ui_admin_quota_direction_out');
  }

  return '-';
}

function getUsageRatio(account: AdminQuotaAccount) {
  const total =
    account.limitCredits ??
    account.baseAllocatedCredits + account.extraGrantedCredits + account.bufferCredits;
  if (total <= 0) {
    return 0;
  }

  return Math.min(1, account.usedCredits / total);
}

function getLimitCredits(account: AdminQuotaAccount) {
  return account.limitCredits ?? account.baseAllocatedCredits + account.extraGrantedCredits;
}

function getAllocatedLimitCredits(account: AdminQuotaAccount) {
  return account.allocatedLimitCredits ?? account.reservedCredits;
}

function getAllocatableLimitCredits(account: AdminQuotaAccount) {
  return account.allocatableLimitCredits ?? getLimitCredits(account) - account.reservedCredits;
}

function getUsableRemainingCredits(account: AdminQuotaAccount) {
  return account.usableRemainingCredits ?? account.remainingCredits;
}

function getPageItems<T>(items: T[], page: number) {
  return items.slice(page * pageSize, page * pageSize + pageSize);
}

function getPageCount(total: number) {
  return Math.max(1, Math.ceil(total / pageSize));
}

function isResponseError(error: unknown): error is ResponseError {
  return typeof error === 'object' && error !== null;
}

function getResponseStatus(error: unknown) {
  return isResponseError(error) ? error.response?.status : undefined;
}

function getResponseMessage(error: unknown) {
  if (!isResponseError(error)) {
    return null;
  }

  return error.response?.data?.message ?? error.response?.data?.error ?? error.message ?? null;
}

export default function AdminQuotasPage() {
  const localize = useLocalize();
  const [selectedPeriodId, setSelectedPeriodId] = useState('');
  const [modal, setModal] = useState<QuotaModal>(null);
  const [accountSearch, setAccountSearch] = useState('');
  const [accountScopeFilter, setAccountScopeFilter] = useState<AccountScopeFilter>('all');
  const [periodPage, setPeriodPage] = useState(0);
  const [accountsPage, setAccountsPage] = useState(0);
  const [ledgerCursor, setLedgerCursor] = useState<string | undefined>();
  const [ledgerCursorHistory, setLedgerCursorHistory] = useState<string[]>([]);
  const [grantCursor, setGrantCursor] = useState<string | undefined>();
  const [grantCursorHistory, setGrantCursorHistory] = useState<string[]>([]);
  const [periodYear, setPeriodYear] = useState(String(new Date().getFullYear()));
  const [periodMonth, setPeriodMonth] = useState(String(new Date().getMonth() + 1));
  const [createFullYear, setCreateFullYear] = useState(false);
  const [companyCredits, setCompanyCredits] = useState('10000');
  const [fromAccountId, setFromAccountId] = useState('');
  const [allocationScopeType, setAllocationScopeType] =
    useState<Exclude<AdminQuotaAccountScopeType, 'company'>>('department');
  const [allocationScopeId, setAllocationScopeId] = useState('');
  const [allocationUserSearch, setAllocationUserSearch] = useState('');
  const [allocationUserMenuOpen, setAllocationUserMenuOpen] = useState(false);
  const [allocationAmount, setAllocationAmount] = useState('');
  const [allocationReason, setAllocationReason] = useState('');
  const [grantAmount, setGrantAmount] = useState('');
  const [grantReason, setGrantReason] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);

  const periodsQuery = useGetAdminQuotaPeriodsQuery({ status: 'all' });
  const departmentsQuery = useGetAdminDepartmentsQuery({ enabled: true });
  const deferredAllocationUserSearch = useDeferredValue(allocationUserSearch);
  const allocationUsersQuery = useGetAdminUsersQuery(
    {
      limit: 20,
      search: deferredAllocationUserSearch.trim() || undefined,
    },
    {
      enabled: modal === 'allocation' && allocationScopeType === 'user',
    },
  );
  const periods = useMemo(() => periodsQuery.data?.periods ?? [], [periodsQuery.data?.periods]);
  const activePeriod = useMemo(
    () => periods.find((period) => period.status === 'active') ?? periods[0] ?? null,
    [periods],
  );
  const periodId = selectedPeriodId || activePeriod?.id || '';
  const accountsQuery = useGetAdminQuotaAccountsQuery(
    { periodId },
    { enabled: periodId.length > 0 },
  );
  const ledgerQuery = useGetAdminQuotaLedgerQuery(
    { periodId, limit: pageSize, cursor: ledgerCursor },
    { enabled: periodId.length > 0 },
  );
  const grantsQuery = useGetAdminQuotaGrantsQuery(
    { periodId, limit: pageSize, cursor: grantCursor, status: 'all' },
    { enabled: periodId.length > 0 },
  );
  const departmentsById = useMemo(
    () =>
      new Map(
        (departmentsQuery.data?.departments ?? []).map((department) => [
          department.id,
          `${department.name} (${department.code})`,
        ]),
      ),
    [departmentsQuery.data?.departments],
  );
  const accounts = accountsQuery.data?.accounts ?? [];
  const selectedPeriod = periods.find((period) => period.id === periodId) ?? null;
  const selectedFromAccount = accounts.find((account) => account.id === fromAccountId) ?? null;
  const companyAccount = accounts.find((account) => account.scopeType === 'company') ?? null;
  const allocatableAccounts = accounts.filter((account) => getAllocatableLimitCredits(account) > 0);
  const filteredAccounts = accounts.filter((account) => {
    if (accountScopeFilter !== 'all' && account.scopeType !== accountScopeFilter) {
      return false;
    }

    const normalizedSearch = accountSearch.trim().toLowerCase();
    if (normalizedSearch.length === 0) {
      return true;
    }

    const label = getAccountLabel(account, departmentsById, localize('com_ui_admin_quota_company'));
    return [
      label,
      account.scopeId ?? '',
      account.scopeLabel ?? '',
      account.scopeSecondaryLabel ?? '',
      account.department?.name ?? '',
      account.department?.code ?? '',
      account.id,
    ]
      .join(' ')
      .toLowerCase()
      .includes(normalizedSearch);
  });
  const allocationUsers = allocationUsersQuery.data?.users ?? [];
  const allocationTargetUsers = allocationUsers.filter(
    (user) => selectedFromAccount?.scopeType !== 'user' || user.id !== selectedFromAccount.scopeId,
  );
  const allocationTargetDepartments = (departmentsQuery.data?.departments ?? []).filter(
    (department) =>
      selectedFromAccount?.scopeType !== 'department' ||
      department.id !== selectedFromAccount.scopeId,
  );
  const pagedPeriods = getPageItems(periods, periodPage);
  const pagedAccounts = getPageItems(filteredAccounts, accountsPage);
  const periodPageCount = getPageCount(periods.length);
  const accountsPageCount = getPageCount(filteredAccounts.length);
  const companyLimitCredits = companyAccount ? getLimitCredits(companyAccount) : 0;
  const companyAllocatedCredits = companyAccount ? getAllocatedLimitCredits(companyAccount) : 0;
  const companyAllocatableCredits = companyAccount ? getAllocatableLimitCredits(companyAccount) : 0;
  const grantTargetAccountId = companyAccount?.id ?? '';
  const pendingGrantCount = (grantsQuery.data?.grants ?? []).filter(
    (grant) => grant.status === 'requested',
  ).length;
  const createPeriodMutation = useCreateAdminQuotaPeriodMutation();
  const activatePeriodMutation = useActivateAdminQuotaPeriodMutation();
  const closePeriodMutation = useCloseAdminQuotaPeriodMutation();
  const createAllocationMutation = useCreateAdminQuotaAllocationMutation();
  const createGrantRequestMutation = useCreateAdminQuotaGrantRequestMutation();
  const approveGrantRequestMutation = useApproveAdminQuotaGrantRequestMutation();
  const rejectGrantRequestMutation = useRejectAdminQuotaGrantRequestMutation();
  const hasPeriod = periodId.length > 0;
  const allocationAmountValue = Number(allocationAmount);
  const maxAllocationAmount = selectedFromAccount
    ? Math.max(0, getAllocatableLimitCredits(selectedFromAccount))
    : 0;
  const isSelfAllocation =
    selectedFromAccount != null &&
    selectedFromAccount.scopeType === allocationScopeType &&
    (selectedFromAccount.scopeId ?? '') === allocationScopeId &&
    allocationScopeId.length > 0;
  const isAllocationAmountOverLimit =
    Number.isFinite(allocationAmountValue) && allocationAmountValue > maxAllocationAmount;
  const canCreatePeriod =
    !createPeriodMutation.isLoading &&
    periodYear.trim().length > 0 &&
    Number.isInteger(Number(periodYear)) &&
    Number(periodYear) >= 1970 &&
    Number(periodYear) <= 9999 &&
    (createFullYear ||
      (periodMonth.trim().length > 0 &&
        Number.isInteger(Number(periodMonth)) &&
        Number(periodMonth) >= 1 &&
        Number(periodMonth) <= 12)) &&
    Number(companyCredits) >= 0;
  const canCreateAllocation =
    !createAllocationMutation.isLoading &&
    hasPeriod &&
    fromAccountId.length > 0 &&
    allocationScopeId.length > 0 &&
    Number.isFinite(allocationAmountValue) &&
    allocationAmountValue > 0 &&
    !isAllocationAmountOverLimit &&
    !isSelfAllocation;
  const canCreateGrant =
    hasPeriod &&
    grantTargetAccountId.length > 0 &&
    Number(grantAmount) > 0 &&
    grantReason.trim().length > 0;
  const periodStatusLabels: Record<AdminQuotaPeriodStatus, string> = {
    active: localize('com_ui_admin_quota_status_active'),
    closed: localize('com_ui_admin_quota_status_closed'),
    draft: localize('com_ui_admin_quota_status_draft'),
  };
  const scopeTypeLabels: Record<AdminQuotaAccountScopeType, string> = {
    company: localize('com_ui_admin_quota_scope_company'),
    department: localize('com_ui_admin_quota_scope_department'),
    user: localize('com_ui_admin_quota_scope_user'),
  };
  const ledgerEntryTypeLabels: Record<AdminQuotaLedgerEntryType, string> = {
    adjustment: localize('com_ui_admin_quota_ledger_adjustment'),
    allocation: localize('com_ui_admin_quota_ledger_allocation'),
    block: localize('com_ui_admin_quota_ledger_block'),
    grant: localize('com_ui_admin_quota_ledger_grant'),
    refund: localize('com_ui_admin_quota_ledger_refund'),
    usage: localize('com_ui_admin_quota_ledger_usage'),
    warning: localize('com_ui_admin_quota_ledger_warning'),
  };
  const grantStatusLabels: Record<AdminQuotaGrantStatus, string> = {
    approved: localize('com_ui_admin_quota_grant_status_approved'),
    cancelled: localize('com_ui_admin_quota_grant_status_cancelled'),
    rejected: localize('com_ui_admin_quota_grant_status_rejected'),
    requested: localize('com_ui_admin_quota_grant_status_requested'),
  };

  useEffect(() => {
    setAccountsPage(0);
    setLedgerCursor(undefined);
    setLedgerCursorHistory([]);
    setGrantCursor(undefined);
    setGrantCursorHistory([]);
  }, [periodId]);

  useEffect(() => {
    setAccountsPage(0);
  }, [accountSearch, accountScopeFilter]);

  useEffect(() => {
    if (!isSelfAllocation) {
      return;
    }

    setAllocationScopeId('');
    if (allocationScopeType === 'user') {
      setAllocationUserSearch('');
    }
  }, [allocationScopeType, isSelfAllocation]);

  const handleAllocationScopeTypeChange = (
    value: Exclude<AdminQuotaAccountScopeType, 'company'>,
  ) => {
    setAllocationScopeType(value);
    setAllocationScopeId('');
    setAllocationUserSearch('');
    setAllocationUserMenuOpen(false);
  };

  const handleSelectAllocationUser = (user: AdminUserSummary) => {
    setAllocationScopeId(user.id);
    setAllocationUserSearch(getUserLabel(user));
    setAllocationUserMenuOpen(false);
  };

  const showError = (error: unknown, messageOverride?: string) => {
    const responseMessage = getResponseMessage(error);
    const message =
      messageOverride ?? responseMessage ?? localize('com_ui_admin_quota_operation_failed');
    setNotice({
      title: localize('com_ui_error'),
      message,
    });
  };

  const handleCreatePeriod = async () => {
    try {
      const createPeriodPayload = {
        year: Number(periodYear),
        createFullYear,
        companyCredits: Number(companyCredits),
        ...(createFullYear ? {} : { month: Number(periodMonth) }),
      };
      const created = await createPeriodMutation.mutateAsync({
        ...createPeriodPayload,
      });
      const createdPeriods = created.periods ?? [created.period];
      setSelectedPeriodId(createdPeriods[0]?.id ?? created.period.id);
      setNotice({
        title: localize('com_ui_saved'),
        message:
          createdPeriods.length > 1
            ? localize('com_ui_admin_quota_periods_created', {
                count: createdPeriods.length,
              })
            : localize('com_ui_admin_quota_period_created'),
      });
      setModal(null);
    } catch (error) {
      showError(
        error,
        getResponseStatus(error) === 409
          ? localize('com_ui_admin_quota_period_duplicate')
          : undefined,
      );
    }
  };

  const handleCreateAllocation = async () => {
    try {
      await createAllocationMutation.mutateAsync({
        periodId,
        fromAccountId,
        scopeType: allocationScopeType,
        scopeId: allocationScopeId,
        amount: Number(allocationAmount),
        reason: allocationReason,
      });
      setAllocationAmount('');
      setAllocationReason('');
      setNotice({
        title: localize('com_ui_saved'),
        message: localize('com_ui_admin_quota_allocation_created'),
      });
      setModal(null);
    } catch (error) {
      showError(error);
    }
  };

  const handleCreateGrantRequest = async () => {
    try {
      await createGrantRequestMutation.mutateAsync({
        periodId,
        targetAccountId: grantTargetAccountId,
        amount: Number(grantAmount),
        reason: grantReason,
      });
      setGrantAmount('');
      setGrantReason('');
      setNotice({
        title: localize('com_ui_saved'),
        message: localize('com_ui_admin_quota_grant_request_created'),
      });
      setModal(null);
    } catch (error) {
      showError(error);
    }
  };

  const goToNextLedgerPage = () => {
    if (!ledgerQuery.data?.nextCursor) {
      return;
    }

    setLedgerCursorHistory((current) => [...current, ledgerCursor ?? '']);
    setLedgerCursor(ledgerQuery.data.nextCursor);
  };

  const goToPreviousLedgerPage = () => {
    setLedgerCursorHistory((current) => {
      const nextHistory = [...current];
      const previousCursor = nextHistory.pop();
      setLedgerCursor(previousCursor || undefined);
      return nextHistory;
    });
  };

  const goToNextGrantPage = () => {
    if (!grantsQuery.data?.nextCursor) {
      return;
    }

    setGrantCursorHistory((current) => [...current, grantCursor ?? '']);
    setGrantCursor(grantsQuery.data.nextCursor);
  };

  const goToPreviousGrantPage = () => {
    setGrantCursorHistory((current) => {
      const nextHistory = [...current];
      const previousCursor = nextHistory.pop();
      setGrantCursor(previousCursor || undefined);
      return nextHistory;
    });
  };

  const renderClientPagination = (
    page: number,
    pageCount: number,
    setPage: (page: number) => void,
  ) => (
    <div className="flex items-center justify-end gap-2 border-t border-border-light p-3 text-sm text-text-secondary">
      <span>
        {localize('com_ui_page')} {page + 1} {localize('com_ui_of')} {pageCount}
      </span>
      <button
        type="button"
        className={smallSecondaryButtonClassName}
        disabled={page <= 0}
        onClick={() => setPage(Math.max(0, page - 1))}
      >
        {localize('com_ui_back')}
      </button>
      <button
        type="button"
        className={smallSecondaryButtonClassName}
        disabled={page + 1 >= pageCount}
        onClick={() => setPage(Math.min(pageCount - 1, page + 1))}
      >
        {localize('com_ui_next')}
      </button>
    </div>
  );

  const renderCursorPagination = (
    cursorHistory: string[],
    nextCursor: string | null | undefined,
    onBack: () => void,
    onNext: () => void,
  ) => (
    <div className="flex items-center justify-end gap-2 border-t border-border-light p-3 text-sm text-text-secondary">
      <span>
        {localize('com_ui_page')} {cursorHistory.length + 1}
      </span>
      <button
        type="button"
        className={smallSecondaryButtonClassName}
        disabled={cursorHistory.length === 0}
        onClick={onBack}
      >
        {localize('com_ui_back')}
      </button>
      <button
        type="button"
        className={smallSecondaryButtonClassName}
        disabled={!nextCursor}
        onClick={onNext}
      >
        {localize('com_ui_next')}
      </button>
    </div>
  );

  const handleApproveGrantRequest = async (grantId: string) => {
    try {
      await approveGrantRequestMutation.mutateAsync({ grantId });
      setNotice({
        title: localize('com_ui_saved'),
        message: localize('com_ui_admin_quota_grant_request_approved'),
      });
    } catch (error) {
      showError(error);
    }
  };

  const handleRejectGrantRequest = async (grantId: string) => {
    try {
      await rejectGrantRequestMutation.mutateAsync({ grantId });
      setNotice({
        title: localize('com_ui_saved'),
        message: localize('com_ui_admin_quota_grant_request_rejected'),
      });
    } catch (error) {
      showError(error);
    }
  };

  const handleActivate = async (period: AdminQuotaPeriod) => {
    try {
      await activatePeriodMutation.mutateAsync(period.id);
      setNotice({
        title: localize('com_ui_saved'),
        message: localize('com_ui_admin_quota_period_activated'),
      });
    } catch (error) {
      showError(error);
    }
  };

  const handleClose = async (period: AdminQuotaPeriod) => {
    try {
      await closePeriodMutation.mutateAsync(period.id);
      setNotice({
        title: localize('com_ui_saved'),
        message: localize('com_ui_admin_quota_period_closed'),
      });
    } catch (error) {
      showError(error);
    }
  };

  return (
    <AdminLayout
      title={localize('com_ui_admin_quotas')}
      description={localize('com_ui_admin_quotas_description')}
      hideHeader={true}
    >
      <div className="flex min-h-0 flex-col gap-4">
        <section className={sectionClassName}>
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <h1 className="text-lg font-medium text-text-primary">
                  {localize('com_ui_admin_quotas')}
                </h1>
                <div className="mt-1 text-sm text-text-secondary">
                  {selectedPeriod
                    ? `${selectedPeriod.periodKey} · ${periodStatusLabels[selectedPeriod.status]}`
                    : localize('com_ui_admin_quota_requires_period')}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className={secondaryButtonClassName}
                  onClick={() => setModal('period')}
                >
                  {localize('com_ui_admin_quota_create_period')}
                </button>
                <button
                  type="button"
                  className={secondaryButtonClassName}
                  onClick={() => setModal('periods')}
                >
                  {localize('com_ui_admin_quota_manage_periods')}
                </button>
                <button
                  type="button"
                  className={secondaryButtonClassName}
                  disabled={!hasPeriod}
                  onClick={() => setModal('ledger')}
                >
                  {localize('com_ui_admin_quota_ledger_short')}
                </button>
                <button
                  type="button"
                  className={secondaryButtonClassName}
                  disabled={!hasPeriod}
                  onClick={() => setModal('grants')}
                >
                  {localize('com_ui_admin_quota_grant_requests_short')}
                  {pendingGrantCount > 0 ? ` (${pendingGrantCount})` : ''}
                </button>
                <button
                  type="button"
                  className={secondaryButtonClassName}
                  disabled={!hasPeriod}
                  onClick={() => setModal('grant')}
                >
                  {localize('com_ui_admin_quota_create_grant_request')}
                </button>
                <button
                  type="button"
                  className={primaryButtonClassName}
                  disabled={!hasPeriod}
                  onClick={() => setModal('allocation')}
                >
                  {localize('com_ui_admin_quota_allocate')}
                </button>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(220px,300px)_minmax(220px,1fr)_180px]">
              <label className={labelClassName}>
                {localize('com_ui_admin_quota_periods_short')}
                <select
                  className={inputClassName}
                  value={periodId}
                  onChange={(event) => setSelectedPeriodId(event.target.value)}
                >
                  <option value="">{localize('com_ui_select')}</option>
                  {periods.map((period) => (
                    <option key={period.id} value={period.id}>
                      {period.periodKey} - {periodStatusLabels[period.status]}
                    </option>
                  ))}
                </select>
              </label>

              <label className={labelClassName}>
                {localize('com_ui_search')}
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
                  <input
                    type="search"
                    className={`${inputClassName} pl-9`}
                    value={accountSearch}
                    onChange={(event) => setAccountSearch(event.target.value)}
                  />
                </div>
              </label>

              <label className={labelClassName}>
                {localize('com_ui_type')}
                <select
                  className={inputClassName}
                  value={accountScopeFilter}
                  onChange={(event) =>
                    setAccountScopeFilter(event.target.value as AccountScopeFilter)
                  }
                >
                  <option value="all">{localize('com_ui_all_proper')}</option>
                  <option value="company">{scopeTypeLabels.company}</option>
                  <option value="department">{scopeTypeLabels.department}</option>
                  <option value="user">{scopeTypeLabels.user}</option>
                </select>
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-border-light bg-background p-3">
                <div className="text-xs text-text-secondary">
                  {localize('com_ui_admin_quota_company_limit')}
                </div>
                <div className="mt-1 truncate text-sm font-semibold text-text-primary">
                  {formatCredits(companyLimitCredits)}
                </div>
              </div>
              <div className="rounded-2xl border border-border-light bg-background p-3">
                <div className="text-xs text-text-secondary">
                  {localize('com_ui_admin_quota_allocated_limit_short')}
                </div>
                <div className="mt-1 truncate text-sm font-semibold text-text-primary">
                  {formatCredits(companyAllocatedCredits)}
                </div>
              </div>
              <div className="rounded-2xl border border-border-light bg-background p-3">
                <div className="text-xs text-text-secondary">
                  {localize('com_ui_admin_quota_allocatable_limit_short')}
                </div>
                <div className="mt-1 truncate text-sm font-semibold text-text-primary">
                  {formatCredits(companyAllocatableCredits)}
                </div>
              </div>
              <div className="rounded-2xl border border-border-light bg-background p-3">
                <div className="text-xs text-text-secondary">{localize('com_ui_results')}</div>
                <div className="mt-1 truncate text-sm font-semibold text-text-primary">
                  {filteredAccounts.length}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className={`${sectionClassName} min-h-0`}>
          <div className="overflow-x-auto rounded-xl border border-border-light">
            <div className="grid grid-cols-[minmax(220px,1fr)_110px_120px_120px_120px_120px] gap-3 border-b border-border-light bg-background px-3 py-2 text-xs font-medium text-text-secondary">
              <span>{localize('com_ui_admin_quota_account')}</span>
              <span>{localize('com_ui_type')}</span>
              <span className="text-right">{localize('com_ui_admin_quota_used_short')}</span>
              <span className="text-right">{localize('com_ui_admin_quota_limit_short')}</span>
              <span className="text-right">
                {localize('com_ui_admin_quota_allocatable_limit_short')}
              </span>
              <span className="text-right">
                {localize('com_ui_admin_quota_usable_remaining_short')}
              </span>
            </div>
            {!hasPeriod ? (
              <div className="p-5 text-sm text-text-secondary">
                {localize('com_ui_admin_quota_requires_period')}
              </div>
            ) : null}
            {hasPeriod && accounts.length === 0 ? (
              <div className="p-5 text-sm text-text-secondary">
                {localize('com_ui_admin_quota_accounts_empty')}
              </div>
            ) : null}
            {hasPeriod && accounts.length > 0 && filteredAccounts.length === 0 ? (
              <div className="p-5 text-sm text-text-secondary">
                {localize('com_ui_no_results_found')}
              </div>
            ) : null}
            {pagedAccounts.map((account) => {
              const ratio = getUsageRatio(account);
              return (
                <div
                  key={account.id}
                  className="grid grid-cols-[minmax(220px,1fr)_110px_120px_120px_120px_120px] gap-3 border-b border-border-light p-3 text-sm last:border-b-0"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium text-text-primary">
                      {getAccountLabel(
                        account,
                        departmentsById,
                        localize('com_ui_admin_quota_company'),
                      )}
                    </div>
                    {account.scopeSecondaryLabel ? (
                      <div className="mt-1 truncate text-xs text-text-secondary">
                        {account.scopeSecondaryLabel}
                      </div>
                    ) : null}
                    {account.scopeType === 'user' && account.department ? (
                      <div className="mt-1 truncate text-xs text-text-secondary">
                        {localize('com_ui_admin_department')}: {account.department.name} (
                        {account.department.code})
                      </div>
                    ) : null}
                    <div className="mt-2 h-2 rounded-full bg-surface-secondary">
                      <div
                        className="h-2 rounded-full bg-blue-500"
                        style={{ width: `${Math.round(ratio * 100)}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-text-secondary">{scopeTypeLabels[account.scopeType]}</span>
                  <span className="text-right text-text-primary">
                    {formatCredits(account.usedCredits)}
                  </span>
                  <span className="text-right text-text-primary">
                    {formatCredits(getLimitCredits(account))}
                  </span>
                  <span className="text-right text-text-primary">
                    {formatCredits(getAllocatableLimitCredits(account))}
                  </span>
                  <span className="text-right text-text-primary">
                    {formatCredits(getUsableRemainingCredits(account))}
                  </span>
                </div>
              );
            })}
            {renderClientPagination(accountsPage, accountsPageCount, setAccountsPage)}
          </div>
        </section>
      </div>

      {modal ? (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/40 p-4">
          <div
            className={`w-full rounded-2xl border border-border-light bg-surface-primary p-5 shadow-xl ${
              modal === 'periods' || modal === 'ledger' || modal === 'grants'
                ? 'max-w-6xl'
                : 'max-w-xl'
            }`}
          >
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-base font-semibold text-text-primary">
                {modal === 'period' ? localize('com_ui_admin_quota_create_period') : null}
                {modal === 'allocation' ? localize('com_ui_admin_quota_allocation') : null}
                {modal === 'grant' ? localize('com_ui_admin_quota_create_grant_request') : null}
                {modal === 'periods' ? localize('com_ui_admin_quota_periods_short') : null}
                {modal === 'ledger' ? localize('com_ui_admin_quota_ledger_short') : null}
                {modal === 'grants' ? localize('com_ui_admin_quota_grant_requests_short') : null}
              </h2>
              <button
                type="button"
                className="admin-button-secondary flex h-9 w-9 items-center justify-center rounded-xl"
                aria-label={localize('com_ui_close')}
                onClick={() => setModal(null)}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            {modal === 'periods' ? (
              <div className="mt-4 max-h-[70vh] overflow-auto rounded-xl border border-border-light">
                <div className="grid grid-cols-[minmax(140px,1fr)_120px_minmax(180px,1fr)_160px] gap-3 border-b border-border-light bg-background px-3 py-2 text-xs font-medium text-text-secondary">
                  <span>{localize('com_ui_admin_quota_period_key')}</span>
                  <span>{localize('com_ui_status')}</span>
                  <span>{localize('com_ui_admin_date_range')}</span>
                  <span className="text-right">{localize('com_ui_actions')}</span>
                </div>
                {periods.length === 0 ? (
                  <div className="p-5 text-sm text-text-secondary">
                    {localize('com_ui_admin_quota_periods_empty')}
                  </div>
                ) : null}
                {pagedPeriods.map((period) => (
                  <div
                    key={period.id}
                    className="grid grid-cols-[minmax(140px,1fr)_120px_minmax(180px,1fr)_160px] gap-3 border-b border-border-light p-3 text-sm last:border-b-0"
                  >
                    <span className="font-medium text-text-primary">{period.periodKey}</span>
                    <span className="text-text-secondary">{periodStatusLabels[period.status]}</span>
                    <span className="text-text-secondary">
                      {formatAdminDateValue(period.periodStart)} -{' '}
                      {formatAdminDateValue(period.periodEnd)}
                    </span>
                    <span className="flex justify-end gap-2">
                      <button
                        type="button"
                        className={smallSecondaryButtonClassName}
                        disabled={period.status === 'active'}
                        onClick={() => handleActivate(period)}
                      >
                        {localize('com_ui_admin_quota_activate')}
                      </button>
                      <button
                        type="button"
                        className={smallSecondaryButtonClassName}
                        disabled={period.status === 'closed'}
                        onClick={() => handleClose(period)}
                      >
                        {localize('com_ui_admin_quota_close')}
                      </button>
                    </span>
                  </div>
                ))}
                {renderClientPagination(periodPage, periodPageCount, setPeriodPage)}
              </div>
            ) : null}

            {modal === 'ledger' ? (
              <div className="mt-4 max-h-[70vh] overflow-auto rounded-xl border border-border-light">
                <div className="grid grid-cols-[minmax(180px,1fr)_minmax(180px,1fr)_100px_80px_110px_minmax(160px,1fr)_120px] gap-3 border-b border-border-light bg-background px-3 py-2 text-xs font-medium text-text-secondary">
                  <span>{localize('com_ui_admin_quota_account')}</span>
                  <span>{localize('com_ui_admin_quota_counterparty')}</span>
                  <span>{localize('com_ui_status')}</span>
                  <span>{localize('com_ui_admin_quota_direction')}</span>
                  <span>{localize('com_ui_admin_quota_amount')}</span>
                  <span>{localize('com_ui_admin_quota_reason')}</span>
                  <span className="text-right">{localize('com_ui_admin_updated_at')}</span>
                </div>
                {!hasPeriod ? (
                  <div className="p-5 text-sm text-text-secondary">
                    {localize('com_ui_admin_quota_requires_period')}
                  </div>
                ) : null}
                {hasPeriod && (ledgerQuery.data?.ledger ?? []).length === 0 ? (
                  <div className="p-5 text-sm text-text-secondary">
                    {localize('com_ui_admin_quota_ledger_empty')}
                  </div>
                ) : null}
                {(ledgerQuery.data?.ledger ?? []).map((entry) => {
                  const companyLabel = localize('com_ui_admin_quota_company');
                  const directionLabel = getLedgerDirectionLabel(entry.amount, localize);
                  return (
                    <div
                      key={entry.id}
                      className="grid grid-cols-[minmax(180px,1fr)_minmax(180px,1fr)_100px_80px_110px_minmax(160px,1fr)_120px] gap-3 border-b border-border-light p-3 text-sm last:border-b-0"
                    >
                      <span className="truncate text-text-primary">
                        {getOptionalAccountLabel(
                          entry.account ?? null,
                          departmentsById,
                          companyLabel,
                        )}
                      </span>
                      <span className="truncate text-text-primary">
                        {getOptionalAccountLabel(
                          entry.counterpartyAccount ?? null,
                          departmentsById,
                          companyLabel,
                        )}
                      </span>
                      <span className="text-text-primary">
                        {ledgerEntryTypeLabels[entry.entryType]}
                      </span>
                      <span className="text-text-primary">{directionLabel}</span>
                      <span
                        className={
                          entry.amount < 0 ? 'text-red-600 dark:text-red-400' : 'text-text-primary'
                        }
                      >
                        {formatCredits(Math.abs(entry.amount))}
                      </span>
                      <span className="truncate text-text-secondary">{entry.reason}</span>
                      <span className="text-right text-text-secondary">
                        {formatAdminDateValue(entry.createdAt)}
                      </span>
                    </div>
                  );
                })}
                {renderCursorPagination(
                  ledgerCursorHistory,
                  ledgerQuery.data?.nextCursor,
                  goToPreviousLedgerPage,
                  goToNextLedgerPage,
                )}
              </div>
            ) : null}

            {modal === 'grants' ? (
              <div className="mt-4 max-h-[70vh] overflow-auto rounded-xl border border-border-light">
                <div className="grid grid-cols-[minmax(180px,1fr)_100px_120px_180px] gap-3 border-b border-border-light bg-background px-3 py-2 text-xs font-medium text-text-secondary">
                  <span>{localize('com_ui_admin_quota_target_account')}</span>
                  <span>{localize('com_ui_status')}</span>
                  <span className="text-right">{localize('com_ui_admin_quota_amount')}</span>
                  <span className="text-right">{localize('com_ui_actions')}</span>
                </div>
                {!hasPeriod ? (
                  <div className="p-5 text-sm text-text-secondary">
                    {localize('com_ui_admin_quota_requires_period')}
                  </div>
                ) : null}
                {hasPeriod && (grantsQuery.data?.grants ?? []).length === 0 ? (
                  <div className="p-5 text-sm text-text-secondary">
                    {localize('com_ui_admin_quota_grant_requests_empty')}
                  </div>
                ) : null}
                {(grantsQuery.data?.grants ?? []).map((grant) => (
                  <div
                    key={grant.id}
                    className="grid grid-cols-[minmax(180px,1fr)_100px_120px_180px] gap-3 border-b border-border-light p-3 text-sm last:border-b-0"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-text-primary">
                        {grant.targetAccountId === companyAccount?.id
                          ? localize('com_ui_admin_quota_company')
                          : grant.targetAccountId}
                      </div>
                      <div className="truncate text-xs text-text-secondary">{grant.reason}</div>
                    </div>
                    <span className="text-text-secondary">{grantStatusLabels[grant.status]}</span>
                    <span className="text-right text-text-primary">
                      {formatCredits(grant.amount)}
                    </span>
                    <span className="flex justify-end gap-2">
                      <button
                        type="button"
                        className={smallSecondaryButtonClassName}
                        disabled={
                          grant.status !== 'requested' || approveGrantRequestMutation.isLoading
                        }
                        onClick={() => handleApproveGrantRequest(grant.id)}
                      >
                        {localize('com_ui_approve')}
                      </button>
                      <button
                        type="button"
                        className={smallSecondaryButtonClassName}
                        disabled={
                          grant.status !== 'requested' || rejectGrantRequestMutation.isLoading
                        }
                        onClick={() => handleRejectGrantRequest(grant.id)}
                      >
                        {localize('com_ui_reject')}
                      </button>
                    </span>
                  </div>
                ))}
                {renderCursorPagination(
                  grantCursorHistory,
                  grantsQuery.data?.nextCursor,
                  goToPreviousGrantPage,
                  goToNextGrantPage,
                )}
              </div>
            ) : null}

            {modal === 'period' ? (
              <div className="mt-4 space-y-4">
                <section className="rounded-2xl border border-border-medium bg-surface-primary p-4">
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
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <label className={labelClassName}>
                      {localize('com_ui_admin_quota_month')}
                      <select
                        className={inputClassName}
                        value={periodMonth}
                        disabled={createFullYear}
                        onChange={(event) => setPeriodMonth(event.target.value)}
                      >
                        {Array.from({ length: 12 }, (_value, index) => (
                          <option key={index + 1} value={String(index + 1)}>
                            {index + 1}
                          </option>
                        ))}
                      </select>
                    </label>
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
                  </div>
                  <div className="mt-4 rounded-xl border border-border-light bg-background p-3">
                    <label className="flex items-center gap-2 text-sm text-text-primary">
                      <input
                        type="checkbox"
                        checked={createFullYear}
                        onChange={(event) => setCreateFullYear(event.target.checked)}
                      />
                      {localize('com_ui_admin_quota_create_full_year')}
                    </label>
                    <p className="mt-2 text-xs text-text-secondary">
                      {localize('com_ui_admin_quota_period_definition_hint')}
                    </p>
                  </div>
                </section>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    className={primaryButtonClassName}
                    disabled={!canCreatePeriod}
                    onClick={handleCreatePeriod}
                  >
                    {localize('com_ui_create')}
                  </button>
                  <button
                    type="button"
                    className={secondaryButtonClassName}
                    disabled={createPeriodMutation.isLoading}
                    onClick={() => setModal(null)}
                  >
                    {localize('com_ui_cancel')}
                  </button>
                </div>
              </div>
            ) : null}

            {modal === 'allocation' ? (
              <div className="mt-4 space-y-3">
                <label className={labelClassName}>
                  {localize('com_ui_admin_quota_source_account')}
                  <select
                    className={inputClassName}
                    value={fromAccountId}
                    onChange={(event) => setFromAccountId(event.target.value)}
                  >
                    <option value="">{localize('com_ui_select')}</option>
                    {allocatableAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {getAccountLabel(
                          account,
                          departmentsById,
                          localize('com_ui_admin_quota_company'),
                        )}{' '}
                        - {formatCredits(getAllocatableLimitCredits(account))}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={labelClassName}>
                  {localize('com_ui_admin_quota_allocation_target')}
                  <select
                    className={inputClassName}
                    value={allocationScopeType}
                    onChange={(event) => {
                      handleAllocationScopeTypeChange(
                        event.target.value as Exclude<AdminQuotaAccountScopeType, 'company'>,
                      );
                    }}
                  >
                    <option value="department">{localize('com_ui_admin_department')}</option>
                    <option value="user">{localize('com_ui_admin_user')}</option>
                  </select>
                </label>
                {allocationScopeType === 'department' ? (
                  <label className={labelClassName}>
                    {localize('com_ui_admin_department')}
                    <select
                      className={inputClassName}
                      value={allocationScopeId}
                      onChange={(event) => setAllocationScopeId(event.target.value)}
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
                    <div className="relative">
                      <input
                        className={inputClassName}
                        type="search"
                        value={allocationUserSearch}
                        placeholder={localize('com_ui_admin_quota_search_user_placeholder')}
                        onBlur={() => setAllocationUserMenuOpen(false)}
                        onChange={(event) => {
                          setAllocationScopeId('');
                          setAllocationUserSearch(event.target.value);
                          setAllocationUserMenuOpen(true);
                        }}
                        onFocus={() => setAllocationUserMenuOpen(true)}
                      />
                      {allocationUserMenuOpen ? (
                        <div className="absolute left-0 right-0 top-[calc(100%+0.25rem)] z-[1120] max-h-56 overflow-auto rounded-xl border border-border-medium bg-surface-primary p-1 shadow-xl">
                          {allocationUsersQuery.isLoading ? (
                            <div className="px-3 py-2 text-sm text-text-secondary">
                              {localize('com_ui_loading')}
                            </div>
                          ) : null}
                          {!allocationUsersQuery.isLoading && allocationTargetUsers.length === 0 ? (
                            <div className="px-3 py-2 text-sm text-text-secondary">
                              {localize('com_ui_no_results_found')}
                            </div>
                          ) : null}
                          {allocationTargetUsers.map((user) => (
                            <button
                              key={user.id}
                              type="button"
                              className="flex w-full flex-col rounded-lg px-3 py-2 text-left text-sm hover:bg-background"
                              onMouseDown={(event) => {
                                event.preventDefault();
                                handleSelectAllocationUser(user);
                              }}
                            >
                              <span className="font-medium text-text-primary">
                                {user.name || user.username || user.email || user.id}
                              </span>
                              <span className="text-xs text-text-secondary">
                                {user.email} - {user.id}
                              </span>
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
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
                  <div className="flex items-center justify-between gap-3 text-xs text-text-secondary">
                    <span>{localize('com_ui_admin_quota_allocation_available')}</span>
                    <span className="font-medium text-text-primary">
                      {formatCredits(maxAllocationAmount)}
                    </span>
                  </div>
                  <input
                    className="mt-3 w-full accent-primary disabled:cursor-not-allowed disabled:opacity-60"
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
                  {isSelfAllocation ? (
                    <p className="mt-2 text-xs text-red-600 dark:text-red-300">
                      {localize('com_ui_admin_quota_allocation_self_target')}
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
                    className={primaryButtonClassName}
                    disabled={!canCreateAllocation}
                    onClick={handleCreateAllocation}
                  >
                    {localize('com_ui_admin_quota_allocate')}
                  </button>
                  <button
                    type="button"
                    className={secondaryButtonClassName}
                    disabled={createAllocationMutation.isLoading}
                    onClick={() => setModal(null)}
                  >
                    {localize('com_ui_cancel')}
                  </button>
                </div>
              </div>
            ) : null}

            {modal === 'grant' ? (
              <div className="mt-4 space-y-3">
                <div className="rounded-xl border border-border-light bg-background p-3 text-sm text-text-secondary">
                  {localize('com_ui_admin_quota_grant_request_hint')}
                </div>
                <div className={labelClassName}>
                  {localize('com_ui_admin_quota_target_account')}
                  <div className="rounded-xl border border-border-medium bg-background px-3 py-2 text-sm text-text-primary">
                    {companyAccount
                      ? getAccountLabel(
                          companyAccount,
                          departmentsById,
                          localize('com_ui_admin_quota_company'),
                        )
                      : localize('com_ui_admin_quota_requires_period')}
                  </div>
                </div>
                <label className={labelClassName}>
                  {localize('com_ui_admin_quota_amount')}
                  <input
                    className={inputClassName}
                    type="number"
                    min="0"
                    value={grantAmount}
                    onChange={(event) => setGrantAmount(event.target.value)}
                  />
                </label>
                <label className={labelClassName}>
                  {localize('com_ui_admin_quota_reason')}
                  <input
                    className={inputClassName}
                    value={grantReason}
                    onChange={(event) => setGrantReason(event.target.value)}
                  />
                </label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    className={primaryButtonClassName}
                    disabled={createGrantRequestMutation.isLoading || !canCreateGrant}
                    onClick={handleCreateGrantRequest}
                  >
                    {localize('com_ui_admin_quota_create_grant_request')}
                  </button>
                  <button
                    type="button"
                    className={secondaryButtonClassName}
                    disabled={createGrantRequestMutation.isLoading}
                    onClick={() => setModal(null)}
                  >
                    {localize('com_ui_cancel')}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {notice ? (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border-light bg-surface-primary p-5 shadow-xl">
            <h2 className="text-base font-semibold text-text-primary">{notice.title}</h2>
            <p className="mt-3 text-sm text-text-secondary">{notice.message}</p>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                className={primaryButtonClassName}
                onClick={() => setNotice(null)}
              >
                {localize('com_ui_done')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AdminLayout>
  );
}
