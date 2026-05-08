import { useMemo, useState } from 'react';
import {
  OGDialog,
  OGDialogContent,
  OGDialogOverlay,
  OGDialogPortal,
  OGDialogTitle,
} from '@librechat/client';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  MailWarning,
  Plus,
  RotateCcw,
  Send,
  X,
} from 'lucide-react';
import type {
  AdminManagerReviewBatch,
  AdminManagerReviewCadence,
  AdminManagerReviewBatchStatus,
  AdminManagerReviewItemStatus,
  AdminManagerReviewRiskLevel,
} from 'librechat-data-provider';
import type { TranslationKeys } from '~/hooks/useLocalize';
import {
  useCreateAdminManagerReviewBatchMutation,
  useGetAdminDepartmentsQuery,
  useGetAdminManagerReviewBatchItemsQuery,
  useGetAdminManagerReviewBatchesQuery,
  useGetAdminUsersQuery,
  useScanAdminManagerReviewBatchesOverdueMutation,
  useSendAdminManagerReviewBatchEmailMutation,
  useSendAdminManagerReviewBatchReminderEmailMutation,
  useSubmitAdminManagerReviewBatchResponseMutation,
} from '~/data-provider/Admin';
import { useLocalize } from '~/hooks';
import AdminDateTimePicker, { formatAdminDateValue } from '../AdminDateTimePicker';
import AdminHelpButton from '../AdminHelpButton';
import AdminLayout from '../AdminLayout';
import formatAdminDateTime from '../formatAdminDateTime';

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function toIsoStartOfDay(date: string) {
  return `${date}T00:00:00.000Z`;
}

function toIsoEndOfDay(date: string) {
  return `${date}T23:59:59.999Z`;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat().format(value);
}

function getStatusLabelKey(status: AdminManagerReviewBatchStatus): TranslationKeys {
  const keys: Record<AdminManagerReviewBatchStatus, TranslationKeys> = {
    cancelled: 'com_ui_admin_review_status_cancelled',
    generated: 'com_ui_admin_review_status_generated',
    overdue: 'com_ui_admin_review_status_overdue',
    reviewed: 'com_ui_admin_review_status_reviewed',
    sent: 'com_ui_admin_review_status_sent',
  };
  return keys[status] ?? 'com_ui_admin_review_status_generated';
}

function getStatusClassName(status: AdminManagerReviewBatchStatus) {
  const classNames: Record<AdminManagerReviewBatchStatus, string> = {
    cancelled:
      'border-slate-500/30 bg-slate-500/10 text-slate-700 dark:text-slate-300',
    generated: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300',
    overdue: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    reviewed: 'border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-300',
    sent: 'border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300',
  };
  return classNames[status] ?? classNames.generated;
}

function getResponseClassName(responseStatus: 'ok' | 'not_ok') {
  return responseStatus === 'ok'
    ? 'border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-300'
    : 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300';
}

function getResponseLabelKey(responseStatus: 'ok' | 'not_ok'): TranslationKeys {
  return responseStatus === 'ok'
    ? 'com_ui_admin_review_response_ok'
    : 'com_ui_admin_review_response_not_ok';
}

function getItemStatusLabelKey(status: AdminManagerReviewItemStatus): TranslationKeys {
  const keys: Record<AdminManagerReviewItemStatus, TranslationKeys> = {
    not_ok: 'com_ui_admin_review_response_not_ok',
    ok: 'com_ui_admin_review_response_ok',
    pending: 'com_ui_admin_review_response_pending',
  };
  return keys[status];
}

function getRiskLabelKey(riskLevel: AdminManagerReviewRiskLevel): TranslationKeys {
  const keys: Record<AdminManagerReviewRiskLevel, TranslationKeys> = {
    attention: 'com_ui_admin_review_risk_attention',
    high: 'com_ui_admin_review_risk_high',
    normal: 'com_ui_admin_review_risk_normal',
  };
  return keys[riskLevel];
}

function getRequestErrorMessage(error: unknown): string | null {
  if (
    error != null &&
    typeof error === 'object' &&
    'response' in error &&
    error.response != null &&
    typeof error.response === 'object' &&
    'data' in error.response &&
    error.response.data != null &&
    typeof error.response.data === 'object' &&
    'message' in error.response.data &&
    typeof error.response.data.message === 'string'
  ) {
    return error.response.data.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return null;
}

type OperationDialog = {
  message: string;
  title: string;
  variant: 'success' | 'warning' | 'error';
};

type BatchStatusFilter = AdminManagerReviewBatchStatus | 'all';
type BatchCadenceFilter = AdminManagerReviewCadence | 'all';
type BatchResponseFilter = 'ok' | 'not_ok' | 'pending' | 'all';

const statusFilters: BatchStatusFilter[] = [
  'all',
  'generated',
  'sent',
  'overdue',
  'reviewed',
  'cancelled',
];

const cadenceFilters: BatchCadenceFilter[] = ['all', 'daily', 'weekly'];
const responseFilters: BatchResponseFilter[] = ['all', 'pending', 'ok', 'not_ok'];

export default function AdminManagerReviewsPage() {
  const localize = useLocalize();
  const today = useMemo(() => new Date(), []);
  const yesterday = useMemo(() => {
    const value = new Date(today);
    value.setUTCDate(value.getUTCDate() - 1);
    return value;
  }, [today]);
  const [cursorStack, setCursorStack] = useState<string[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [departmentId, setDepartmentId] = useState('');
  const [managerUserId, setManagerUserId] = useState('');
  const [filterDepartmentId, setFilterDepartmentId] = useState('');
  const [filterManagerUserId, setFilterManagerUserId] = useState('');
  const [statusFilter, setStatusFilter] = useState<BatchStatusFilter>('all');
  const [cadenceFilter, setCadenceFilter] = useState<BatchCadenceFilter>('all');
  const [responseFilter, setResponseFilter] = useState<BatchResponseFilter>('all');
  const [filterPeriodStart, setFilterPeriodStart] = useState('');
  const [filterPeriodEnd, setFilterPeriodEnd] = useState('');
  const [periodStart, setPeriodStart] = useState(toDateInputValue(yesterday));
  const [periodEnd, setPeriodEnd] = useState(toDateInputValue(yesterday));
  const [cadence, setCadence] = useState<AdminManagerReviewCadence>('daily');
  const [reviewBatch, setReviewBatch] = useState<AdminManagerReviewBatch | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [itemCursorStack, setItemCursorStack] = useState<string[]>([]);
  const [itemCursor, setItemCursor] = useState<string | undefined>();
  const [operationDialog, setOperationDialog] = useState<OperationDialog | null>(null);
  const [responseText, setResponseText] = useState('');

  const batchesQuery = useGetAdminManagerReviewBatchesQuery({
    cursor,
    departmentId: filterDepartmentId,
    limit: 20,
    managerUserId: filterManagerUserId,
    cadence: cadenceFilter,
    periodStart: filterPeriodStart ? toIsoStartOfDay(filterPeriodStart) : undefined,
    periodEnd: filterPeriodEnd ? toIsoEndOfDay(filterPeriodEnd) : undefined,
    responseStatus: responseFilter,
    status: statusFilter,
  });
  const batchItemsQuery = useGetAdminManagerReviewBatchItemsQuery(
    reviewBatch?.id ?? '',
    {
      cursor: itemCursor,
      limit: 20,
    },
    {
      enabled: reviewBatch != null,
    },
  );
  const departmentsQuery = useGetAdminDepartmentsQuery({ enabled: true });
  const usersQuery = useGetAdminUsersQuery({ limit: 100 });
  const createMutation = useCreateAdminManagerReviewBatchMutation();
  const scanOverdueMutation = useScanAdminManagerReviewBatchesOverdueMutation();
  const sendEmailMutation = useSendAdminManagerReviewBatchEmailMutation();
  const sendReminderEmailMutation = useSendAdminManagerReviewBatchReminderEmailMutation();
  const submitResponseMutation = useSubmitAdminManagerReviewBatchResponseMutation();

  const departments = departmentsQuery.data?.departments ?? [];
  const users = usersQuery.data?.users ?? [];
  const departmentsById = useMemo(
    () => new Map(departments.map((department) => [department.id, department])),
    [departments],
  );
  const usersById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);
  const batches = batchesQuery.data?.batches ?? [];
  const batchItems = batchItemsQuery.data?.items ?? [];
  const selectedDepartment = departmentsById.get(departmentId);
  const selectedManager = usersById.get(managerUserId);
  const canSubmitInternalReview =
    !!reviewBatch && reviewBatch.status !== 'reviewed' && reviewBatch.status !== 'cancelled';
  const canCreate =
    departmentId.length > 0 &&
    managerUserId.length > 0 &&
    periodStart.length > 0 &&
    periodEnd.length > 0 &&
    createMutation.isLoading !== true;

  const createBatch = async () => {
    if (!canCreate) {
      return;
    }

    try {
      await createMutation.mutateAsync({
        departmentId,
        managerUserId,
        cadence,
        periodStart: toIsoStartOfDay(periodStart),
        periodEnd: toIsoEndOfDay(periodEnd),
      });
      setShowCreateModal(false);
      setCursor(undefined);
      setCursorStack([]);
      await batchesQuery.refetch();
    } catch (error) {
      const errorMessage = getRequestErrorMessage(error);
      setOperationDialog({
        title: localize('com_ui_error'),
        message:
          errorMessage === 'Manager review batch already exists for this period'
            ? localize('com_ui_admin_review_duplicate_batch')
            : errorMessage ?? localize('com_ui_error'),
        variant: 'error',
      });
    }
  };

  const resetBatchCursor = () => {
    setCursor(undefined);
    setCursorStack([]);
  };

  const updateDepartmentFilter = (value: string) => {
    resetBatchCursor();
    setFilterDepartmentId(value);
  };

  const updateManagerFilter = (value: string) => {
    resetBatchCursor();
    setFilterManagerUserId(value);
  };

  const updateStatusFilter = (value: BatchStatusFilter) => {
    resetBatchCursor();
    setStatusFilter(value);
  };

  const updateCadenceFilter = (value: BatchCadenceFilter) => {
    resetBatchCursor();
    setCadenceFilter(value);
  };

  const updateResponseFilter = (value: BatchResponseFilter) => {
    resetBatchCursor();
    setResponseFilter(value);
  };

  const updateFilterPeriodStart = (value: string) => {
    resetBatchCursor();
    setFilterPeriodStart(value);
  };

  const updateFilterPeriodEnd = (value: string) => {
    resetBatchCursor();
    setFilterPeriodEnd(value);
  };

  const clearBatchFilters = () => {
    resetBatchCursor();
    setFilterDepartmentId('');
    setFilterManagerUserId('');
    setStatusFilter('all');
    setCadenceFilter('all');
    setResponseFilter('all');
    setFilterPeriodStart('');
    setFilterPeriodEnd('');
  };

  const showOverdueBatches = () => {
    resetBatchCursor();
    setFilterDepartmentId('');
    setFilterManagerUserId('');
    setStatusFilter('overdue');
    setCadenceFilter('all');
    setResponseFilter('all');
    setFilterPeriodStart('');
    setFilterPeriodEnd('');
  };

  const goNext = () => {
    const nextCursor = batchesQuery.data?.nextCursor;
    if (!nextCursor) {
      return;
    }
    setCursorStack((current) => [...current, cursor ?? '']);
    setCursor(nextCursor);
  };

  const goBack = () => {
    setCursorStack((current) => {
      const nextStack = current.slice(0, -1);
      const previousCursor = current[current.length - 1] || undefined;
      setCursor(previousCursor);
      return nextStack;
    });
  };

  const openInternalReview = (batch: AdminManagerReviewBatch) => {
    setResponseText(batch.responseText);
    setItemCursor(undefined);
    setItemCursorStack([]);
    setReviewBatch(batch);
  };

  const closeInternalReview = () => {
    setReviewBatch(null);
    setItemCursor(undefined);
    setItemCursorStack([]);
  };

  const goNextItemPage = () => {
    const nextCursor = batchItemsQuery.data?.nextCursor;
    if (!nextCursor) {
      return;
    }
    setItemCursorStack((current) => [...current, itemCursor ?? '']);
    setItemCursor(nextCursor);
  };

  const goBackItemPage = () => {
    setItemCursorStack((current) => {
      const nextStack = current.slice(0, -1);
      const previousCursor = current[current.length - 1] || undefined;
      setItemCursor(previousCursor);
      return nextStack;
    });
  };

  const scanOverdue = async () => {
    try {
      const response = await scanOverdueMutation.mutateAsync();
      if (response.modifiedCount > 0 || response.overdueCount > 0) {
        showOverdueBatches();
      }
      setOperationDialog({
        title: localize('com_ui_admin_review_overdue_scan_title'),
        message:
          response.modifiedCount > 0
            ? localize('com_ui_admin_review_overdue_scan_updated', {
                0: response.modifiedCount.toLocaleString(),
              })
            : response.overdueCount > 0
              ? localize('com_ui_admin_review_overdue_scan_existing', {
                  0: response.overdueCount.toLocaleString(),
                })
            : localize('com_ui_admin_review_overdue_scan_none'),
        variant: response.modifiedCount > 0 || response.overdueCount > 0 ? 'warning' : 'success',
      });
    } catch (error) {
      const errorMessage = getRequestErrorMessage(error);
      setOperationDialog({
        title: localize('com_ui_error'),
        message: errorMessage ?? localize('com_ui_error'),
        variant: 'error',
      });
    }
  };

  const sendEmail = async (batch: AdminManagerReviewBatch) => {
    if (batch.status === 'reviewed' || batch.status === 'cancelled') {
      setOperationDialog({
        title: localize('com_ui_admin_review_email_not_sent_title'),
        message: localize('com_ui_admin_review_email_not_sent_for_status', {
          0: localize(getStatusLabelKey(batch.status)),
        }),
        variant: 'warning',
      });
      return;
    }

    try {
      const response = await sendEmailMutation.mutateAsync(batch.id);
      setOperationDialog({
        title: response.sent
          ? localize('com_ui_admin_review_email_sent_title')
          : localize('com_ui_admin_review_email_not_sent_title'),
        message: response.sent
          ? localize('com_ui_admin_review_email_sent')
          : response.reason === 'MANAGER_REVIEW_EMAIL_MODE is not smtp'
            ? localize('com_ui_admin_review_email_mode_disabled')
            : localize('com_ui_admin_review_email_not_sent', {
                0: response.reason ?? localize('com_ui_error'),
              }),
        variant: response.sent ? 'success' : 'warning',
      });
    } catch (error) {
      const errorMessage = getRequestErrorMessage(error);
      setOperationDialog({
        title: localize('com_ui_error'),
        message: errorMessage ?? localize('com_ui_error'),
        variant: 'error',
      });
    }
  };

  const sendReminderEmail = async (batch: AdminManagerReviewBatch) => {
    if (batch.status !== 'overdue') {
      setOperationDialog({
        title: localize('com_ui_admin_review_reminder_not_sent_title'),
        message: localize('com_ui_admin_review_reminder_not_sent_for_status', {
          0: localize(getStatusLabelKey(batch.status)),
        }),
        variant: 'warning',
      });
      return;
    }

    try {
      const response = await sendReminderEmailMutation.mutateAsync(batch.id);
      setOperationDialog({
        title: response.sent
          ? localize('com_ui_admin_review_reminder_sent_title')
          : localize('com_ui_admin_review_reminder_not_sent_title'),
        message: response.sent
          ? localize('com_ui_admin_review_reminder_sent')
          : response.reason === 'MANAGER_REVIEW_EMAIL_MODE is not smtp'
            ? localize('com_ui_admin_review_email_mode_disabled')
            : localize('com_ui_admin_review_email_not_sent', {
                0: response.reason ?? localize('com_ui_error'),
              }),
        variant: response.sent ? 'success' : 'warning',
      });
    } catch (error) {
      const errorMessage = getRequestErrorMessage(error);
      setOperationDialog({
        title: localize('com_ui_error'),
        message: errorMessage ?? localize('com_ui_error'),
        variant: 'error',
      });
    }
  };

  const submitManagerResponse = async (responseStatus: 'ok' | 'not_ok') => {
    if (!reviewBatch) {
      return;
    }

    try {
      const response = await submitResponseMutation.mutateAsync({
        batchId: reviewBatch.id,
        responseStatus,
        responseText,
      });
      setReviewBatch(response.batch);
      setOperationDialog({
        title: localize('com_ui_manager_review_submitted'),
        message: localize('com_ui_manager_review_submitted'),
        variant: 'success',
      });
    } catch (error) {
      const errorMessage = getRequestErrorMessage(error);
      setOperationDialog({
        title: localize('com_ui_error'),
        message: errorMessage ?? localize('com_ui_error'),
        variant: 'error',
      });
    }
  };

  const getDepartmentName = (batch: AdminManagerReviewBatch) =>
    departmentsById.get(batch.departmentId)?.name ?? batch.departmentId;
  const getManagerEmail = (batch: AdminManagerReviewBatch) =>
    batch.emailTo || usersById.get(batch.managerUserId)?.email || batch.managerUserId;

  return (
    <AdminLayout title={localize('com_ui_admin_manager_reviews')} hideHeader={true}>
      <div className="flex h-full flex-col gap-6">
        <OGDialog
          open={operationDialog != null}
          onOpenChange={(open) => !open && setOperationDialog(null)}
        >
          <OGDialogPortal>
            <OGDialogOverlay className="z-[1100] bg-black/40" />
            <OGDialogContent
              className="admin-console fixed left-1/2 top-1/2 z-[1101] w-[min(448px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border-medium bg-surface-primary p-5 text-text-primary shadow-2xl focus:outline-none"
              showCloseButton={false}
            >
              <OGDialogTitle className="sr-only">
                {operationDialog?.title ?? localize('com_ui_confirm_action')}
              </OGDialogTitle>
              {operationDialog ? (
                <>
                  <div className="flex items-start gap-3">
                    <div
                      className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                        operationDialog.variant === 'success'
                          ? 'bg-green-500/15 text-green-600 dark:text-green-300'
                          : operationDialog.variant === 'error'
                            ? 'bg-red-500/15 text-red-600 dark:text-red-300'
                            : 'bg-orange-500/15 text-orange-600 dark:text-orange-300'
                      }`}
                    >
                      {operationDialog.variant === 'success' ? (
                        <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                      ) : (
                        <AlertTriangle className="h-5 w-5" aria-hidden="true" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-base font-medium">{operationDialog.title}</h2>
                      <p className="mt-2 text-sm leading-6 text-text-secondary">
                        {operationDialog.message}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="admin-button-secondary flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                      aria-label={localize('com_ui_close')}
                      onClick={() => setOperationDialog(null)}
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                  <div className="mt-5 flex justify-end">
                    <button
                      type="button"
                      className="admin-button-primary rounded-xl px-4 py-2 text-sm"
                      onClick={() => setOperationDialog(null)}
                    >
                      {localize('com_ui_confirm')}
                    </button>
                  </div>
                </>
              ) : null}
            </OGDialogContent>
          </OGDialogPortal>
        </OGDialog>
        {reviewBatch ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="admin-manager-review-internal-title"
              className="flex max-h-[90vh] w-full max-w-5xl flex-col rounded-2xl border border-border-medium bg-surface-primary p-5 text-text-primary shadow-2xl"
            >
              <div className="flex shrink-0 items-start justify-between gap-4">
                <div>
                  <h2
                    id="admin-manager-review-internal-title"
                    className="text-base font-medium"
                  >
                    {localize('com_ui_admin_review_internal_review')}
                  </h2>
                  <div className="mt-1 text-sm text-text-secondary">
                    {reviewBatch.emailTo || reviewBatch.managerUserId}
                  </div>
                </div>
                <button
                  type="button"
                  className="admin-subpanel flex h-9 w-9 items-center justify-center rounded-xl border"
                  aria-label={localize('com_ui_close')}
                  onClick={closeInternalReview}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <div className="mt-4 min-h-0 overflow-auto pr-1">
                <div className="rounded-xl border border-border-light bg-background p-4">
                  <div className="text-sm font-medium text-text-primary">
                    {localize('com_ui_admin_review_internal_review_description')}
                  </div>
                  <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-xl border border-border-light bg-surface-primary px-3 py-2">
                      <div className="text-xs uppercase tracking-wide text-text-secondary">
                        {localize('com_ui_admin_review_items')}
                      </div>
                      <div className="mt-1 text-text-primary">
                        {formatNumber(reviewBatch.itemCount)}
                      </div>
                    </div>
                    <div className="rounded-xl border border-border-light bg-surface-primary px-3 py-2">
                      <div className="text-xs uppercase tracking-wide text-text-secondary">
                        {localize('com_ui_admin_usage_summary_transactions')}
                      </div>
                      <div className="mt-1 text-text-primary">
                        {formatNumber(reviewBatch.transactionCount)}
                      </div>
                    </div>
                    <div className="rounded-xl border border-border-light bg-surface-primary px-3 py-2">
                      <div className="text-xs uppercase tracking-wide text-text-secondary">
                        {localize('com_ui_admin_usage_summary_token_value')}
                      </div>
                      <div className="mt-1 text-text-primary">
                        {formatNumber(reviewBatch.totalTokenValue)}
                      </div>
                    </div>
                    <div className="rounded-xl border border-border-light bg-surface-primary px-3 py-2">
                      <div className="text-xs uppercase tracking-wide text-text-secondary">
                        {localize('com_ui_admin_date_range')}
                      </div>
                      <div className="mt-1 text-text-primary">
                        {formatAdminDateValue(reviewBatch.periodStart)} -{' '}
                        {formatAdminDateValue(reviewBatch.periodEnd)}
                      </div>
                    </div>
                    <div className="rounded-xl border border-border-light bg-surface-primary px-3 py-2">
                      <div className="text-xs uppercase tracking-wide text-text-secondary">
                        {localize('com_ui_admin_quota_allocated')}
                      </div>
                      <div className="mt-1 text-text-primary">
                        {formatNumber(reviewBatch.quotaAllocatedCredits ?? 0)}
                      </div>
                    </div>
                    <div className="rounded-xl border border-border-light bg-surface-primary px-3 py-2">
                      <div className="text-xs uppercase tracking-wide text-text-secondary">
                        {localize('com_ui_admin_quota_remaining')}
                      </div>
                      <div className="mt-1 text-text-primary">
                        {formatNumber(reviewBatch.quotaRemainingCredits ?? 0)}
                      </div>
                    </div>
                    <div className="rounded-xl border border-border-light bg-surface-primary px-3 py-2">
                      <div className="text-xs uppercase tracking-wide text-text-secondary">
                        {localize('com_ui_admin_quota_warnings')}
                      </div>
                      <div className="mt-1 text-text-primary">
                        {formatNumber(reviewBatch.quotaWarningCount ?? 0)}
                      </div>
                    </div>
                    <div className="rounded-xl border border-border-light bg-surface-primary px-3 py-2">
                      <div className="text-xs uppercase tracking-wide text-text-secondary">
                        {localize('com_ui_admin_quota_blocks')}
                      </div>
                      <div className="mt-1 text-text-primary">
                        {formatNumber(reviewBatch.quotaBlockCount ?? 0)}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-border-light bg-background p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-text-primary">
                        {localize('com_ui_admin_review_item_details')}
                      </div>
                      <div className="mt-1 text-xs text-text-secondary">
                        {localize('com_ui_admin_review_item_details_count', {
                          0: batchItems.length.toLocaleString(),
                        })}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="admin-button-secondary rounded-xl px-3 py-2 text-sm"
                      onClick={() => batchItemsQuery.refetch()}
                    >
                      {localize('com_ui_refresh')}
                    </button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead className="text-xs uppercase tracking-wide text-text-secondary">
                        <tr>
                          <th className="whitespace-nowrap px-3 py-2 font-medium">
                            {localize('com_ui_user')}
                          </th>
                          <th className="whitespace-nowrap px-3 py-2 font-medium">
                            {localize('com_ui_admin_conversation')}
                          </th>
                          <th className="whitespace-nowrap px-3 py-2 text-right font-medium">
                            {localize('com_ui_admin_usage_summary_transactions')}
                          </th>
                          <th className="whitespace-nowrap px-3 py-2 text-right font-medium">
                            {localize('com_ui_admin_usage_summary_token_value')}
                          </th>
                          <th className="whitespace-nowrap px-3 py-2 text-right font-medium">
                            {localize('com_ui_admin_usage_summary_input_tokens')}
                          </th>
                          <th className="whitespace-nowrap px-3 py-2 text-right font-medium">
                            {localize('com_ui_admin_usage_summary_write_tokens')}
                          </th>
                          <th className="whitespace-nowrap px-3 py-2 text-right font-medium">
                            {localize('com_ui_admin_usage_summary_read_tokens')}
                          </th>
                          <th className="whitespace-nowrap px-3 py-2 text-right font-medium">
                            {localize('com_ui_admin_quota_remaining')}
                          </th>
                          <th className="whitespace-nowrap px-3 py-2 text-right font-medium">
                            {localize('com_ui_admin_quota_blocks')}
                          </th>
                          <th className="whitespace-nowrap px-3 py-2 font-medium">
                            {localize('com_ui_admin_review_risk')}
                          </th>
                          <th className="whitespace-nowrap px-3 py-2 font-medium">
                            {localize('com_ui_status')}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border-light">
                        {batchItemsQuery.isLoading ? (
                          <tr>
                            <td colSpan={11} className="px-3 py-5 text-text-secondary">
                              {localize('com_ui_loading')}
                            </td>
                          </tr>
                        ) : batchItems.length === 0 ? (
                          <tr>
                            <td colSpan={11} className="px-3 py-5 text-text-secondary">
                              {localize('com_ui_admin_review_item_details_empty')}
                            </td>
                          </tr>
                        ) : (
                          batchItems.map((item) => (
                            <tr key={item.id} className="align-top">
                              <td className="max-w-56 px-3 py-3">
                                <div className="truncate text-text-primary">
                                  {item.userEmail || item.userId}
                                </div>
                                {item.userName ? (
                                  <div className="truncate text-xs text-text-secondary">
                                    {item.userName}
                                  </div>
                                ) : null}
                              </td>
                              <td className="max-w-48 px-3 py-3">
                                <div className="truncate text-text-primary">
                                  {item.conversationId || '-'}
                                </div>
                                <div className="text-xs text-text-secondary">
                                  {formatAdminDateTime(item.newestTransactionAt)}
                                </div>
                              </td>
                              <td className="px-3 py-3 text-right">
                                {formatNumber(item.transactionCount)}
                              </td>
                              <td className="px-3 py-3 text-right">
                                {formatNumber(item.totalTokenValue)}
                              </td>
                              <td className="px-3 py-3 text-right">
                                {formatNumber(item.totalInputTokens)}
                              </td>
                              <td className="px-3 py-3 text-right">
                                {formatNumber(item.totalWriteTokens)}
                              </td>
                              <td className="px-3 py-3 text-right">
                                {formatNumber(item.totalReadTokens)}
                              </td>
                              <td className="px-3 py-3 text-right">
                                {formatNumber(item.quotaRemainingCredits ?? 0)}
                              </td>
                              <td className="px-3 py-3 text-right">
                                {formatNumber(item.quotaBlockCount ?? 0)}
                              </td>
                              <td className="px-3 py-3">
                                {localize(getRiskLabelKey(item.riskLevel))}
                              </td>
                              <td className="px-3 py-3">
                                {localize(getItemStatusLabelKey(item.status))}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-3">
                    <div className="text-sm text-text-secondary">
                      {localize('com_ui_admin_cursor_page')}
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        disabled={itemCursorStack.length === 0}
                        className="admin-button-secondary rounded-xl px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                        onClick={goBackItemPage}
                      >
                        {localize('com_ui_back')}
                      </button>
                      <button
                        type="button"
                        disabled={!batchItemsQuery.data?.nextCursor}
                        className="admin-button-secondary rounded-xl px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                        onClick={goNextItemPage}
                      >
                        {localize('com_ui_admin_next_page')}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-border-light bg-background p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-text-primary">
                        {localize('com_ui_admin_review_response')}
                      </div>
                      {reviewBatch.responseStatus ? (
                        <span
                          className={`mt-2 inline-flex rounded-full border px-3 py-1 text-xs font-medium ${getResponseClassName(
                            reviewBatch.responseStatus,
                          )}`}
                        >
                          {localize(getResponseLabelKey(reviewBatch.responseStatus))}
                        </span>
                      ) : (
                        <div className="mt-1 text-xs text-text-secondary">
                          {localize('com_ui_admin_review_response_pending')}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="admin-button-secondary rounded-xl px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={submitResponseMutation.isLoading || !canSubmitInternalReview}
                        onClick={() => submitManagerResponse('ok')}
                      >
                        {localize('com_ui_admin_review_response_ok')}
                      </button>
                      <button
                        type="button"
                        className="admin-button-secondary rounded-xl px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={submitResponseMutation.isLoading || !canSubmitInternalReview}
                        onClick={() => submitManagerResponse('not_ok')}
                      >
                        {localize('com_ui_admin_review_response_not_ok')}
                      </button>
                    </div>
                  </div>
                  <textarea
                    value={responseText}
                    onChange={(event) => setResponseText(event.target.value)}
                    placeholder={localize('com_ui_admin_review_response_note')}
                    disabled={!canSubmitInternalReview}
                    className="min-h-24 w-full rounded-xl border border-border-medium bg-surface-primary px-3 py-2 text-sm text-text-primary"
                  />
                </div>
              </div>
            </div>
          </div>
        ) : null}
        <OGDialog open={showCreateModal} onOpenChange={setShowCreateModal}>
          <OGDialogPortal>
            <OGDialogOverlay className="bg-black/50 backdrop-blur-sm" />
            <OGDialogContent
              className="admin-console fixed left-1/2 top-1/2 z-50 flex max-h-[88vh] w-[min(760px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-3xl border border-border-medium bg-surface-primary p-0 text-text-primary shadow-2xl focus:outline-none"
              showCloseButton={true}
            >
              <OGDialogTitle className="sr-only">
                {localize('com_ui_admin_review_create_batch')}
              </OGDialogTitle>

              <form
                className="flex min-h-0 flex-1 flex-col"
                onSubmit={(event) => {
                  event.preventDefault();
                  createBatch();
                }}
              >
                <div className="shrink-0 border-b border-border-light px-6 py-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-background text-text-primary">
                      <Plus className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <h2 className="text-lg font-medium text-text-primary">
                      {localize('com_ui_admin_review_create_batch')}
                    </h2>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="flex flex-col gap-2 text-sm text-text-secondary">
                      {localize('com_ui_admin_department')}
                      <select
                        value={departmentId}
                        onChange={(event) => {
                          const nextDepartmentId = event.target.value;
                          const nextDepartment = departments.find(
                            (department) => department.id === nextDepartmentId,
                          );
                          setDepartmentId(nextDepartmentId);
                          setManagerUserId(nextDepartment?.managerUserId ?? '');
                        }}
                        className="rounded-xl border border-border-medium bg-background px-3 py-2 text-sm text-text-primary"
                      >
                        <option value="">{localize('com_ui_select')}</option>
                        {departments.map((department) => (
                          <option key={department.id} value={department.id}>
                            {department.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="flex flex-col gap-2 text-sm text-text-secondary">
                      {localize('com_ui_admin_manager')}
                      <select
                        value={managerUserId}
                        onChange={(event) => setManagerUserId(event.target.value)}
                        className="rounded-xl border border-border-medium bg-background px-3 py-2 text-sm text-text-primary"
                      >
                        <option value="">{localize('com_ui_select')}</option>
                        {users.map((user) => (
                          <option key={user.id} value={user.id}>
                            {user.email}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="flex flex-col gap-2 text-sm text-text-secondary">
                      {localize('com_ui_admin_review_cadence')}
                      <select
                        value={cadence}
                        onChange={(event) =>
                          setCadence(event.target.value as AdminManagerReviewCadence)
                        }
                        className="rounded-xl border border-border-medium bg-background px-3 py-2 text-sm text-text-primary"
                      >
                        <option value="daily">{localize('com_ui_admin_review_daily')}</option>
                        <option value="weekly">{localize('com_ui_admin_review_weekly')}</option>
                      </select>
                    </label>

                    <label className="flex flex-col gap-2 text-sm text-text-secondary">
                      {localize('com_ui_admin_date_from')}
                      <AdminDateTimePicker
                        value={periodStart}
                        onChange={setPeriodStart}
                        ariaLabel={localize('com_ui_admin_date_from')}
                      />
                    </label>

                    <label className="flex flex-col gap-2 text-sm text-text-secondary">
                      {localize('com_ui_admin_date_to')}
                      <AdminDateTimePicker
                        value={periodEnd}
                        onChange={setPeriodEnd}
                        ariaLabel={localize('com_ui_admin_date_to')}
                      />
                    </label>
                  </div>

                  {selectedDepartment && selectedManager ? (
                    <div className="mt-4 rounded-2xl border border-border-light bg-background px-4 py-3 text-sm text-text-secondary">
                      {localize('com_ui_admin_manager_review_create_hint', {
                        0: selectedDepartment.name,
                        1: selectedManager.email,
                      })}
                    </div>
                  ) : null}
                </div>

                <div className="shrink-0 border-t border-border-light px-6 py-5">
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="submit"
                      disabled={!canCreate}
                      className="admin-button-primary rounded-xl px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {localize('com_ui_create')}
                    </button>
                    <button
                      type="button"
                      disabled={createMutation.isLoading}
                      className="admin-button-secondary rounded-xl px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={() => setShowCreateModal(false)}
                    >
                      {localize('com_ui_cancel')}
                    </button>
                  </div>
                </div>
              </form>
            </OGDialogContent>
          </OGDialogPortal>
        </OGDialog>
        <section className="rounded-3xl border border-border-medium bg-surface-primary p-5">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-background text-text-primary">
                <ClipboardCheck className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-medium text-text-primary">
                  {localize('com_ui_admin_manager_reviews')}
                </h1>
                <AdminHelpButton
                  title="com_ui_admin_manager_reviews"
                  description="com_ui_admin_manager_reviews_description"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="admin-button-primary inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium"
                onClick={() => setShowCreateModal(true)}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                {localize('com_ui_create')}
              </button>
              <button
                type="button"
                className="admin-button-secondary inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
                disabled={scanOverdueMutation.isLoading}
                onClick={() => scanOverdue()}
              >
                <Clock3 className="h-4 w-4" aria-hidden="true" />
                {localize('com_ui_admin_review_check_overdue')}
              </button>
              <button
                type="button"
                className="admin-button-secondary inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium"
                onClick={() => batchesQuery.refetch()}
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                {localize('com_ui_refresh')}
              </button>
            </div>
          </div>

          <div className="mt-5">
            <div className="rounded-2xl border border-border-light bg-background p-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(13rem,1fr)_minmax(13rem,1fr)_minmax(9rem,0.75fr)_minmax(9rem,0.75fr)_minmax(10rem,0.85fr)]">
                <label className="flex flex-col gap-2 text-sm text-text-secondary">
                  {localize('com_ui_admin_department')}
                  <select
                    value={filterDepartmentId}
                    onChange={(event) => updateDepartmentFilter(event.target.value)}
                    className="rounded-xl border border-border-medium bg-surface-primary px-3 py-2 text-sm text-text-primary"
                  >
                    <option value="">{localize('com_ui_all_proper')}</option>
                    {departments.map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-2 text-sm text-text-secondary">
                  {localize('com_ui_admin_manager')}
                  <select
                    value={filterManagerUserId}
                    onChange={(event) => updateManagerFilter(event.target.value)}
                    className="rounded-xl border border-border-medium bg-surface-primary px-3 py-2 text-sm text-text-primary"
                  >
                    <option value="">{localize('com_ui_all_proper')}</option>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.email}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-2 text-sm text-text-secondary">
                  {localize('com_ui_status')}
                  <select
                    value={statusFilter}
                    onChange={(event) =>
                      updateStatusFilter(event.target.value as BatchStatusFilter)
                    }
                    className="rounded-xl border border-border-medium bg-surface-primary px-3 py-2 text-sm text-text-primary"
                  >
                    {statusFilters.map((status) => (
                      <option key={status} value={status}>
                        {status === 'all'
                          ? localize('com_ui_all_proper')
                          : localize(getStatusLabelKey(status))}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-2 text-sm text-text-secondary">
                  {localize('com_ui_admin_review_cadence')}
                  <select
                    value={cadenceFilter}
                    onChange={(event) =>
                      updateCadenceFilter(event.target.value as BatchCadenceFilter)
                    }
                    className="rounded-xl border border-border-medium bg-surface-primary px-3 py-2 text-sm text-text-primary"
                  >
                    {cadenceFilters.map((nextCadence) => (
                      <option key={nextCadence} value={nextCadence}>
                        {nextCadence === 'all'
                          ? localize('com_ui_all_proper')
                          : localize(
                              nextCadence === 'daily'
                                ? 'com_ui_admin_review_daily'
                                : 'com_ui_admin_review_weekly',
                            )}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-2 text-sm text-text-secondary">
                  {localize('com_ui_admin_review_response')}
                  <select
                    value={responseFilter}
                    onChange={(event) =>
                      updateResponseFilter(event.target.value as BatchResponseFilter)
                    }
                    className="rounded-xl border border-border-medium bg-surface-primary px-3 py-2 text-sm text-text-primary"
                  >
                    {responseFilters.map((response) => (
                      <option key={response} value={response}>
                        {response === 'all'
                          ? localize('com_ui_all_proper')
                          : response === 'pending'
                            ? localize('com_ui_admin_review_response_pending')
                            : localize(getResponseLabelKey(response))}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-[minmax(12rem,1fr)_minmax(12rem,1fr)_auto]">
                <label className="flex flex-col gap-2 text-sm text-text-secondary">
                  {localize('com_ui_admin_review_period_from')}
                  <AdminDateTimePicker
                    value={filterPeriodStart}
                    onChange={updateFilterPeriodStart}
                    ariaLabel={localize('com_ui_admin_review_period_from')}
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm text-text-secondary">
                  {localize('com_ui_admin_review_period_to')}
                  <AdminDateTimePicker
                    value={filterPeriodEnd}
                    onChange={updateFilterPeriodEnd}
                    ariaLabel={localize('com_ui_admin_review_period_to')}
                  />
                </label>

                <div className="flex items-end">
                  <button
                    type="button"
                    className="admin-button-secondary w-full rounded-xl px-4 py-2 text-sm md:w-auto"
                    onClick={clearBatchFilters}
                  >
                    {localize('com_ui_clear')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-border-medium bg-surface-primary">
          <div className="min-h-0 flex-1 overflow-auto px-5 py-5">
            {batchesQuery.isLoading ? (
              <div className="rounded-2xl border border-dashed border-border-medium bg-background p-6 text-sm text-text-secondary">
                {localize('com_ui_loading')}
              </div>
            ) : batches.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border-medium bg-background p-6 text-sm text-text-secondary">
                {localize('com_ui_admin_manager_reviews_empty')}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {batches.map((batch) => (
                  <article
                    key={batch.id}
                    className="grid gap-4 rounded-2xl border border-border-medium bg-background p-4"
                  >
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                      <div>
                        <div className="text-base font-medium text-text-primary">
                          {getManagerEmail(batch)}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-secondary">
                          <span>{getDepartmentName(batch)}</span>
                          <span>
                            {formatAdminDateValue(batch.periodStart)} -{' '}
                            {formatAdminDateValue(batch.periodEnd)}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex self-start rounded-full border border-border-medium bg-surface-primary px-3 py-1 text-xs font-medium text-text-secondary">
                          {localize(
                            batch.cadence === 'daily'
                              ? 'com_ui_admin_review_daily'
                              : 'com_ui_admin_review_weekly',
                          )}
                        </span>
                        <span
                          className={`inline-flex self-start rounded-full border px-3 py-1 text-xs font-medium ${getStatusClassName(
                            batch.status,
                          )}`}
                        >
                          {localize(getStatusLabelKey(batch.status))}
                        </span>
                        <span
                          className={`inline-flex self-start rounded-full border px-3 py-1 text-xs font-medium ${
                            batch.responseStatus
                              ? getResponseClassName(batch.responseStatus)
                              : 'border-border-medium bg-surface-primary text-text-secondary'
                          }`}
                        >
                          {batch.responseStatus
                            ? localize(getResponseLabelKey(batch.responseStatus))
                            : localize('com_ui_admin_review_response_pending')}
                        </span>
                        <button
                          type="button"
                          className="admin-button-secondary inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-60"
                          onClick={() => openInternalReview(batch)}
                        >
                          <ClipboardCheck className="h-3.5 w-3.5" aria-hidden="true" />
                          {localize('com_ui_admin_review_internal_review')}
                        </button>
                        <button
                          type="button"
                          className="admin-button-secondary inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={sendEmailMutation.isLoading}
                          onClick={() => sendEmail(batch)}
                        >
                          <Send className="h-3.5 w-3.5" aria-hidden="true" />
                          {localize('com_ui_admin_review_send_email')}
                        </button>
                        <button
                          type="button"
                          className="admin-button-secondary inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={
                            sendReminderEmailMutation.isLoading || batch.status !== 'overdue'
                          }
                          onClick={() => sendReminderEmail(batch)}
                        >
                          <MailWarning className="h-3.5 w-3.5" aria-hidden="true" />
                          {localize('com_ui_admin_review_send_reminder')}
                        </button>
                      </div>
                    </div>

                    <div className="grid gap-3 text-sm md:grid-cols-3 xl:grid-cols-6">
                      <div className="rounded-xl border border-border-light bg-surface-primary px-3 py-2">
                        <div className="text-xs uppercase tracking-wide text-text-secondary">
                          {localize('com_ui_admin_department')}
                        </div>
                        <div className="mt-1 truncate text-text-primary">
                          {getDepartmentName(batch)}
                        </div>
                      </div>
                      <div className="rounded-xl border border-border-light bg-surface-primary px-3 py-2">
                        <div className="text-xs uppercase tracking-wide text-text-secondary">
                          {localize('com_ui_admin_manager')}
                        </div>
                        <div className="mt-1 truncate text-text-primary">
                          {getManagerEmail(batch)}
                        </div>
                      </div>
                      <div className="rounded-xl border border-border-light bg-surface-primary px-3 py-2">
                        <div className="text-xs uppercase tracking-wide text-text-secondary">
                          {localize('com_ui_admin_review_items')}
                        </div>
                        <div className="mt-1 text-text-primary">{formatNumber(batch.itemCount)}</div>
                      </div>
                      <div className="rounded-xl border border-border-light bg-surface-primary px-3 py-2">
                        <div className="text-xs uppercase tracking-wide text-text-secondary">
                          {localize('com_ui_admin_usage_summary_transactions')}
                        </div>
                        <div className="mt-1 text-text-primary">
                          {formatNumber(batch.transactionCount)}
                        </div>
                      </div>
                      <div className="rounded-xl border border-border-light bg-surface-primary px-3 py-2">
                        <div className="text-xs uppercase tracking-wide text-text-secondary">
                          {localize('com_ui_admin_usage_summary_token_value')}
                        </div>
                        <div className="mt-1 text-text-primary">
                          {formatNumber(batch.totalTokenValue)}
                        </div>
                      </div>
                      <div className="rounded-xl border border-border-light bg-surface-primary px-3 py-2">
                        <div className="text-xs uppercase tracking-wide text-text-secondary">
                          {localize('com_ui_admin_created_at')}
                        </div>
                        <div className="mt-1 text-text-primary">
                          {formatAdminDateTime(batch.createdAt)}
                        </div>
                      </div>
                      <div className="rounded-xl border border-border-light bg-surface-primary px-3 py-2">
                        <div className="text-xs uppercase tracking-wide text-text-secondary">
                          {localize('com_ui_admin_review_due_at')}
                        </div>
                        <div className="mt-1 text-text-primary">
                          {formatAdminDateTime(batch.dueAt)}
                        </div>
                      </div>
                      <div className="rounded-xl border border-border-light bg-surface-primary px-3 py-2">
                        <div className="text-xs uppercase tracking-wide text-text-secondary">
                          {localize('com_ui_admin_review_reminder_sent_at')}
                        </div>
                        <div className="mt-1 text-text-primary">
                          {formatAdminDateTime(batch.reminderSentAt)}
                        </div>
                      </div>
                    </div>

                    {batch.responseStatus || batch.responseText || batch.reviewedAt ? (
                      <div className="rounded-xl border border-border-light bg-surface-primary px-3 py-3">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <div className="text-xs uppercase tracking-wide text-text-secondary">
                            {localize('com_ui_admin_review_response')}
                          </div>
                          {batch.responseStatus ? (
                            <span
                              className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${getResponseClassName(
                                batch.responseStatus,
                              )}`}
                            >
                              {localize(getResponseLabelKey(batch.responseStatus))}
                            </span>
                          ) : null}
                          {batch.reviewedAt ? (
                            <span className="text-xs text-text-secondary">
                              {formatAdminDateTime(batch.reviewedAt)}
                            </span>
                          ) : null}
                        </div>
                        <div className="whitespace-pre-wrap text-sm text-text-primary">
                          {batch.responseText || localize('com_ui_admin_review_response_no_note')}
                        </div>
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border-light px-5 py-4">
            <div className="text-sm text-text-secondary">
              {localize('com_ui_admin_cursor_page')}
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={cursorStack.length === 0}
                className="admin-button-secondary rounded-xl px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                onClick={goBack}
              >
                {localize('com_ui_back')}
              </button>
              <button
                type="button"
                disabled={!batchesQuery.data?.nextCursor}
                className="admin-button-secondary rounded-xl px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                onClick={goNext}
              >
                {localize('com_ui_admin_next_page')}
              </button>
            </div>
          </div>
        </section>
      </div>
    </AdminLayout>
  );
}
