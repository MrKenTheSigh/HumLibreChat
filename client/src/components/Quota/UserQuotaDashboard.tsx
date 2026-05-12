import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, X } from 'lucide-react';
import type { AdminQuotaRequest, AdminQuotaRequestStatus } from 'librechat-data-provider';
import {
  OGDialog,
  OGDialogContent,
  OGDialogOverlay,
  OGDialogPortal,
  OGDialogTitle,
  useToastContext,
} from '@librechat/client';
import {
  useCreateUserQuotaRequestMutation,
  useGetStartupConfig,
  useGetUserBalance,
  useGetUserQuotaRequestsQuery,
} from '~/data-provider';
import type { TranslationKeys } from '~/hooks';
import { useLocalize } from '~/hooks';
import QuotaBar from '~/components/Nav/QuotaBar';

type QuotaRequestStatusFilter = AdminQuotaRequestStatus | 'all';

const pageSize = 10;
const filterButtonClassName =
  'rounded-xl border px-3 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60';

function formatCredits(value: number | null | undefined) {
  if (value == null) {
    return '-';
  }

  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  const second = String(date.getSeconds()).padStart(2, '0');

  return `${year}/${month}/${day} ${hour}:${minute}:${second}`;
}

function getQuotaRequestStatusKey(status: AdminQuotaRequest['status']): TranslationKeys {
  if (status === 'approved') {
    return 'com_nav_quota_request_status_approved';
  }

  if (status === 'rejected') {
    return 'com_nav_quota_request_status_rejected';
  }

  if (status === 'cancelled') {
    return 'com_nav_quota_request_status_cancelled';
  }

  return 'com_nav_quota_request_status_pending';
}

function getQuotaRequestStatusClassName(status: AdminQuotaRequest['status']) {
  if (status === 'approved') {
    return 'border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-200';
  }

  if (status === 'rejected') {
    return 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-200';
  }

  if (status === 'cancelled') {
    return 'border-border-medium bg-surface-tertiary text-text-secondary';
  }

  return 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-200';
}

function getErrorMessage(error: unknown) {
  if (
    typeof error === 'object' &&
    error != null &&
    'response' in error &&
    typeof error.response === 'object' &&
    error.response != null &&
    'data' in error.response &&
    typeof error.response.data === 'object' &&
    error.response.data != null
  ) {
    const data = error.response.data;
    if ('message' in data && typeof data.message === 'string' && data.message.trim().length > 0) {
      return data.message;
    }
    if ('error' in data && typeof data.error === 'string' && data.error.trim().length > 0) {
      return data.error;
    }
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  if (
    typeof error === 'object' &&
    error != null &&
    'message' in error &&
    typeof error.message === 'string' &&
    error.message.trim().length > 0
  ) {
    return error.message;
  }

  return '';
}

function getErrorStatus(error: unknown) {
  if (
    typeof error === 'object' &&
    error != null &&
    'response' in error &&
    typeof error.response === 'object' &&
    error.response != null &&
    'status' in error.response &&
    typeof error.response.status === 'number'
  ) {
    return error.response.status;
  }

  return null;
}

function getQuotaRequestErrorKey(error: unknown): TranslationKeys {
  const message = getErrorMessage(error);

  if (message === 'No active quota period is available') {
    return 'com_nav_quota_request_no_active_period';
  }

  if (message === 'A quota request is already pending') {
    return 'com_nav_quota_request_pending_exists';
  }

  if (message === 'User does not belong to a quota-managed department') {
    return 'com_nav_quota_request_no_department';
  }

  if (
    message === 'Parent quota account is not available' ||
    message === 'User quota account does not have a parent account'
  ) {
    return 'com_nav_quota_request_parent_unavailable';
  }

  if (getErrorStatus(error) === 409 || message.includes('409')) {
    return 'com_nav_quota_request_conflict';
  }

  return 'com_nav_quota_request_error';
}

export default function UserQuotaDashboard() {
  const localize = useLocalize();
  const navigate = useNavigate();
  const { showToast } = useToastContext();
  const { data: startupConfig } = useGetStartupConfig();
  const legacyBalanceEnabled = startupConfig?.legacyBalanceEnabled === true;
  const balanceQuery = useGetUserBalance({
    enabled: true,
  });
  const [statusFilter, setStatusFilter] = useState<QuotaRequestStatusFilter>('all');
  const [cursorStack, setCursorStack] = useState<string[]>([]);
  const cursor = cursorStack[cursorStack.length - 1];
  const quotaRequestsQuery = useGetUserQuotaRequestsQuery(
    { status: statusFilter, cursor, limit: pageSize },
    { enabled: true },
  );
  const pendingQuotaRequestsQuery = useGetUserQuotaRequestsQuery(
    { status: 'pending', limit: 20 },
    { enabled: true },
  );
  const createQuotaRequestMutation = useCreateUserQuotaRequestMutation();
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestAmount, setRequestAmount] = useState('');
  const [requestReason, setRequestReason] = useState('');

  const quota = balanceQuery.data?.quota;
  const requests = quotaRequestsQuery.data?.requests ?? [];
  const nextCursor = quotaRequestsQuery.data?.nextCursor;
  const pendingRequestCount = pendingQuotaRequestsQuery.data?.requests.length ?? 0;
  const amountValue = Number(requestAmount);
  const canSubmitRequest =
    Number.isFinite(amountValue) &&
    amountValue > 0 &&
    requestReason.trim().length > 0 &&
    !createQuotaRequestMutation.isLoading;

  const submitRequest = () => {
    if (!canSubmitRequest) {
      return;
    }

    createQuotaRequestMutation.mutate(
      {
        amount: amountValue,
        reason: requestReason.trim(),
      },
      {
        onSuccess: () => {
          setRequestOpen(false);
          setRequestAmount('');
          setRequestReason('');
          setCursorStack([]);
          showToast({
            status: 'success',
            message: localize('com_nav_quota_request_success'),
          });
        },
        onError: (error) => {
          showToast({
            status: 'warning',
            message: localize(getQuotaRequestErrorKey(error)),
          });
        },
      },
    );
  };

  const statusOptions: Array<{ label: TranslationKeys; value: QuotaRequestStatusFilter }> = [
    { label: 'com_ui_all', value: 'all' },
    { label: 'com_nav_quota_request_status_pending', value: 'pending' },
    { label: 'com_nav_quota_request_status_approved', value: 'approved' },
    { label: 'com_nav_quota_request_status_rejected', value: 'rejected' },
  ];
  const quotaSummaryContent = (() => {
    if (quota) {
      return (
        <div className="grid gap-4 xl:grid-cols-[minmax(520px,1fr)_220px_220px]">
          <QuotaBar
            className="mx-0 my-0"
            periodTotalCredits={quota.periodTotalCredits}
            periodUsedCredits={quota.periodUsedCredits}
            periodRemainingCredits={quota.periodRemainingCredits}
            usageRatio={quota.usageRatio}
          />
          <div className="rounded-xl border border-border-light bg-background px-4 py-3">
            <div className="text-xs text-text-secondary">{localize('com_ui_admin_quota_used')}</div>
            <div className="mt-1 text-lg font-semibold">
              {formatCredits(quota.periodUsedCredits)}
            </div>
          </div>
          <div className="rounded-xl border border-border-light bg-background px-4 py-3">
            <div className="text-xs text-text-secondary">
              {localize('com_nav_quota_pending_requests', { 0: pendingRequestCount })}
            </div>
            <div className="mt-1 text-lg font-semibold">{pendingRequestCount}</div>
          </div>
        </div>
      );
    }

    if (balanceQuery.data?.quotaState?.status === 'inactive_period') {
      return (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-200">
          {localize('com_nav_quota_request_no_active_period')}
        </div>
      );
    }

    if (legacyBalanceEnabled && balanceQuery.data) {
      return (
        <div className="rounded-xl border border-border-light bg-background px-4 py-3">
          <div className="text-xs text-text-secondary">{localize('com_nav_balance')}</div>
          <div className="mt-1 text-lg font-semibold">
            {formatCredits(balanceQuery.data.tokenCredits)}
          </div>
        </div>
      );
    }

    if (balanceQuery.isLoading) {
      return <div className="text-sm text-text-secondary">{localize('com_ui_loading')}</div>;
    }

    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-200">
        {localize('com_nav_quota_request_no_active_period')}
      </div>
    );
  })();
  const quotaRequestListContent = (() => {
    if (quotaRequestsQuery.isLoading) {
      return (
        <div className="rounded-xl border border-dashed border-border-medium bg-background p-6 text-sm text-text-secondary">
          {localize('com_ui_loading')}
        </div>
      );
    }

    if (requests.length === 0) {
      return (
        <div className="rounded-xl border border-dashed border-border-medium bg-background p-6 text-sm text-text-secondary">
          {localize('com_nav_quota_request_empty')}
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {requests.map((request) => (
          <article
            key={request.id}
            className="rounded-xl border border-border-light bg-background p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-base font-semibold">
                  {formatCredits(request.amount)} {localize('com_nav_quota_credits')}
                </div>
                <div className="mt-1 text-sm text-text-secondary">{request.reason}</div>
              </div>
              <span
                className={`rounded-full border px-3 py-1 text-xs font-medium ${getQuotaRequestStatusClassName(
                  request.status,
                )}`}
              >
                {localize(getQuotaRequestStatusKey(request.status))}
              </span>
            </div>
            <div className="mt-3 grid gap-2 text-sm text-text-secondary sm:grid-cols-2">
              <div>
                {localize('com_nav_quota_request_requested_at')}:{' '}
                {formatDateTime(request.requestedAt)}
              </div>
              <div>
                {localize('com_nav_quota_request_reviewed_at')}:{' '}
                {formatDateTime(request.reviewedAt)}
              </div>
            </div>
            {request.reviewReason ? (
              <div className="mt-3 rounded-xl border border-border-light bg-surface-primary px-3 py-2 text-sm text-text-secondary">
                {localize('com_nav_quota_request_review_reason')}: {request.reviewReason}
              </div>
            ) : null}
          </article>
        ))}
      </div>
    );
  })();

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background text-text-primary">
      <div className="shrink-0 border-b border-border-light bg-surface-primary px-4 py-3 sm:px-6">
        <div className="mx-auto flex w-full max-w-[1440px] flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="admin-button-secondary flex h-9 w-9 items-center justify-center rounded-xl"
              aria-label={localize('com_ui_go_back')}
              onClick={() => navigate('/c/new')}
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <div>
              <h1 className="text-lg font-semibold">{localize('com_nav_quota_dashboard')}</h1>
              <div className="text-sm text-text-secondary">
                {localize('com_nav_quota_request_history')}
              </div>
            </div>
          </div>
          <button
            type="button"
            className="admin-button-primary inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium"
            onClick={() => setRequestOpen(true)}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {localize('com_nav_quota_request')}
          </button>
        </div>
      </div>

      <main className="mx-auto flex min-h-0 w-full max-w-[1440px] flex-1 flex-col gap-4 overflow-hidden p-4 sm:p-6">
        <section className="shrink-0 rounded-2xl border border-border-light bg-surface-primary p-4">
          {quotaSummaryContent}
        </section>

        <section className="flex min-h-0 flex-1 flex-col rounded-2xl border border-border-light bg-surface-primary">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-light p-4">
            <div className="flex flex-wrap gap-2">
              {statusOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`${filterButtonClassName} ${
                    statusFilter === option.value
                      ? 'border-blue-500 bg-blue-500/10 text-blue-700 dark:text-blue-200'
                      : 'border-border-medium bg-background text-text-secondary hover:bg-surface-active'
                  }`}
                  onClick={() => {
                    setStatusFilter(option.value);
                    setCursorStack([]);
                  }}
                >
                  {localize(option.label)}
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">{quotaRequestListContent}</div>

          <div className="flex items-center justify-end gap-2 border-t border-border-light p-4">
            <button
              type="button"
              className="admin-button-secondary rounded-xl px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
              disabled={cursorStack.length === 0}
              onClick={() => setCursorStack((current) => current.slice(0, -1))}
            >
              {localize('com_nav_quota_prev_page')}
            </button>
            <button
              type="button"
              className="admin-button-secondary rounded-xl px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!nextCursor}
              onClick={() => {
                if (!nextCursor) {
                  return;
                }
                setCursorStack((current) => [...current, nextCursor]);
              }}
            >
              {localize('com_nav_quota_next_page')}
            </button>
          </div>
        </section>
      </main>

      <OGDialog open={requestOpen} onOpenChange={setRequestOpen}>
        <OGDialogPortal>
          <OGDialogOverlay className="z-[1200] bg-black/50 backdrop-blur-sm" />
          <OGDialogContent className="z-[1201] w-[min(92vw,520px)] rounded-2xl border border-border-light bg-surface-primary p-0 text-text-primary shadow-xl">
            <div className="flex items-center justify-between border-b border-border-light px-6 py-5">
              <OGDialogTitle className="text-lg font-semibold">
                {localize('com_nav_quota_request_title')}
              </OGDialogTitle>
              <button
                type="button"
                className="admin-button-secondary flex h-9 w-9 items-center justify-center rounded-xl"
                aria-label={localize('com_ui_close')}
                onClick={() => setRequestOpen(false)}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div className="space-y-4 px-6 py-5">
              <label className="flex flex-col gap-2 text-sm text-text-secondary">
                {localize('com_nav_quota_request_amount')}
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={requestAmount}
                  onChange={(event) => setRequestAmount(event.target.value)}
                  className="rounded-xl border border-border-medium bg-background px-3 py-2 text-text-primary outline-none transition-colors focus:border-blue-500"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm text-text-secondary">
                {localize('com_nav_quota_request_reason')}
                <textarea
                  rows={5}
                  value={requestReason}
                  onChange={(event) => setRequestReason(event.target.value)}
                  placeholder={localize('com_nav_quota_request_reason_placeholder')}
                  className="resize-none rounded-xl border border-border-medium bg-background px-3 py-2 text-text-primary outline-none transition-colors focus:border-blue-500"
                />
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-border-light px-6 py-4">
              <button
                type="button"
                className="admin-button-primary rounded-xl px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!canSubmitRequest}
                onClick={submitRequest}
              >
                {localize('com_nav_quota_submit_request')}
              </button>
              <button
                type="button"
                className="admin-button-secondary rounded-xl px-4 py-2 text-sm font-medium"
                onClick={() => setRequestOpen(false)}
              >
                {localize('com_ui_cancel')}
              </button>
            </div>
          </OGDialogContent>
        </OGDialogPortal>
      </OGDialog>
    </div>
  );
}
