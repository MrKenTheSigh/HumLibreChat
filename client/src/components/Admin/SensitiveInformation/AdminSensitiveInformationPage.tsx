import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, FileSearch, Search, ShieldAlert } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { SystemRoles } from 'librechat-data-provider';
import type {
  AdminSensitiveInformationMessage,
  AdminSensitiveInformationMessagesParams,
  AdminSensitiveInformationRuleSummary,
  AdminSensitiveInformationSummaryItem,
  AdminSensitiveInformationSummaryParams,
} from 'librechat-data-provider';
import {
  OGDialog,
  OGDialogContent,
  OGDialogOverlay,
  OGDialogPortal,
  OGDialogTitle,
} from '@librechat/client';
import {
  useGetAdminSensitiveInformationMessagesQuery,
  useGetAdminSensitiveInformationSummaryQuery,
} from '~/data-provider/Admin';
import { useAuthContext, useLocalize } from '~/hooks';
import AdminDateTimePicker from '../AdminDateTimePicker';
import AdminHelpButton from '../AdminHelpButton';
import AdminLayout from '../AdminLayout';
import formatAdminDateTime from '../formatAdminDateTime';

const sensitiveRuleOptions = [
  { value: '', labelKey: 'com_ui_all' },
  { value: 'chinese_name', labelKey: 'com_ui_admin_sensitive_rule_chinese_name' },
  { value: 'credit_card_number', labelKey: 'com_ui_admin_sensitive_rule_credit_card_number' },
  { value: 'tw_national_id', labelKey: 'com_ui_admin_sensitive_rule_tw_national_id' },
  { value: 'mobile_phone_number', labelKey: 'com_ui_admin_sensitive_rule_mobile_phone_number' },
  { value: 'landline_phone_number', labelKey: 'com_ui_admin_sensitive_rule_landline_phone_number' },
  { value: 'address', labelKey: 'com_ui_admin_sensitive_rule_address' },
  { value: 'email_address', labelKey: 'com_ui_admin_sensitive_rule_email_address' },
  { value: 'encrypted_file', labelKey: 'com_ui_admin_sensitive_rule_encrypted_file' },
] as const;

const limitOptions = [20, 50, 100, 200] as const;
const detailLimit = 25;

function getTodayDateInput() {
  const today = new Date();
  return [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-');
}

function getLocalDateBoundaryIso(value: string, boundary: 'start' | 'end') {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return value || undefined;
  }

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date =
    boundary === 'start'
      ? new Date(year, month, day, 0, 0, 0, 0)
      : new Date(year, month, day, 23, 59, 59, 999);
  return date.toISOString();
}

type DetailSelection = {
  userId: string;
  userLabel: string;
  ruleCode?: string;
  ruleLabel?: string;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return undefined;
}

function formatSensitiveUser(item: AdminSensitiveInformationSummaryItem) {
  const displayName = item.userName || item.username;

  if (displayName && item.userEmail) {
    return `${displayName} (${item.userEmail})`;
  }

  return displayName || item.userEmail || item.userId;
}

function formatSensitiveMessageUser(item: AdminSensitiveInformationMessage) {
  const displayName = item.userName || item.username;

  if (displayName && item.userEmail) {
    return `${displayName} (${item.userEmail})`;
  }

  return displayName || item.userEmail || item.userId;
}

function getMessagePreview(message: AdminSensitiveInformationMessage) {
  const text = message.text?.trim();
  return text && text.length > 0 ? text : '-';
}

function getRuleLabel(ruleCode: string) {
  return sensitiveRuleOptions.find((option) => option.value === ruleCode)?.labelKey;
}

function RuleSummaryList({
  summaries,
  onSelect,
}: {
  summaries: AdminSensitiveInformationRuleSummary[];
  onSelect: (summary: AdminSensitiveInformationRuleSummary) => void;
}) {
  const localize = useLocalize();

  if (summaries.length === 0) {
    return <span className="text-text-secondary">-</span>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {summaries.map((summary) => (
        <button
          key={summary.ruleCode}
          type="button"
          onClick={() => onSelect(summary)}
          className="inline-flex rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-800 dark:text-amber-200"
        >
          {summary.label}: {summary.count}
          {summary.blockedCount > 0
            ? ` (${localize('com_ui_admin_sensitive_blocked_count')}: ${summary.blockedCount})`
            : ''}
        </button>
      ))}
    </div>
  );
}

export default function AdminSensitiveInformationPage() {
  const localize = useLocalize();
  const { user } = useAuthContext();
  const defaultDate = useMemo(() => getTodayDateInput(), []);
  const defaultDateRange = useMemo(
    () => ({
      createdAfter: getLocalDateBoundaryIso(defaultDate, 'start'),
      createdBefore: getLocalDateBoundaryIso(defaultDate, 'end'),
    }),
    [defaultDate],
  );
  const [userId, setUserId] = useState('');
  const [ruleCode, setRuleCode] = useState('');
  const [createdAfter, setCreatedAfter] = useState(defaultDate);
  const [createdBefore, setCreatedBefore] = useState(defaultDate);
  const [limit, setLimit] = useState(50);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);
  const [detailSelection, setDetailSelection] = useState<DetailSelection | null>(null);
  const [detailCursor, setDetailCursor] = useState<string | undefined>(undefined);
  const [detailCursorHistory, setDetailCursorHistory] = useState<string[]>([]);
  const [submittedFilters, setSubmittedFilters] = useState<AdminSensitiveInformationSummaryParams>({
    limit: 50,
    ...defaultDateRange,
  });
  const canViewSensitiveInformation =
    user?.role === SystemRoles.ADMIN ||
    user?.role === SystemRoles.MANAGER ||
    user?.role === SystemRoles.AUDITOR;

  useEffect(() => {
    setSubmittedFilters((current) => ({
      ...current,
      limit,
      cursor: undefined,
    }));
    setCursor(undefined);
    setCursorHistory([]);
  }, [limit]);

  const summaryQuery = useGetAdminSensitiveInformationSummaryQuery(submittedFilters, {
    enabled: canViewSensitiveInformation,
  });
  const detailParams = useMemo<AdminSensitiveInformationMessagesParams>(
    () => ({
      limit: detailLimit,
      cursor: detailCursor,
      userId: detailSelection?.userId,
      ruleCode: detailSelection?.ruleCode,
      createdAfter: submittedFilters.createdAfter,
      createdBefore: submittedFilters.createdBefore,
    }),
    [
      detailCursor,
      detailSelection?.ruleCode,
      detailSelection?.userId,
      submittedFilters.createdAfter,
      submittedFilters.createdBefore,
    ],
  );
  const detailQuery = useGetAdminSensitiveInformationMessagesQuery(detailParams, {
    enabled: canViewSensitiveInformation && detailSelection != null,
  });
  const items = useMemo(() => summaryQuery.data?.items ?? [], [summaryQuery.data?.items]);
  const detailMessages = useMemo(
    () => detailQuery.data?.messages ?? [],
    [detailQuery.data?.messages],
  );
  const errorMessage = getErrorMessage(summaryQuery.error);
  const detailErrorMessage = getErrorMessage(detailQuery.error);
  const totalDetections = useMemo(
    () => items.reduce((sum, item) => sum + item.totalCount, 0),
    [items],
  );
  const totalMessages = useMemo(
    () => items.reduce((sum, item) => sum + item.messageCount, 0),
    [items],
  );

  const applyFilters = () => {
    setCursor(undefined);
    setCursorHistory([]);
    setDetailSelection(null);
    setDetailCursor(undefined);
    setDetailCursorHistory([]);
    setSubmittedFilters({
      limit,
      cursor: undefined,
      userId: userId.trim() || undefined,
      ruleCode: ruleCode || undefined,
      createdAfter: getLocalDateBoundaryIso(createdAfter, 'start'),
      createdBefore: getLocalDateBoundaryIso(createdBefore, 'end'),
    });
  };

  const openDetails = (selection: DetailSelection) => {
    setDetailSelection(selection);
    setDetailCursor(undefined);
    setDetailCursorHistory([]);
  };

  const goNextPage = () => {
    const nextCursor = summaryQuery.data?.nextCursor;
    if (!nextCursor) {
      return;
    }

    setCursorHistory((current) => [...current, cursor ?? '']);
    setCursor(nextCursor);
    setSubmittedFilters((current) => ({
      ...current,
      cursor: nextCursor,
    }));
  };

  const goPreviousPage = () => {
    setCursorHistory((current) => {
      const previous = current[current.length - 1];
      const nextHistory = current.slice(0, -1);
      const previousCursor = previous || undefined;
      setCursor(previousCursor);
      setSubmittedFilters((filters) => ({
        ...filters,
        cursor: previousCursor,
      }));
      return nextHistory;
    });
  };

  const goNextDetailPage = () => {
    const nextCursor = detailQuery.data?.nextCursor;
    if (!nextCursor) {
      return;
    }

    setDetailCursorHistory((current) => [...current, detailCursor ?? '']);
    setDetailCursor(nextCursor);
  };

  const goPreviousDetailPage = () => {
    setDetailCursorHistory((current) => {
      const previous = current[current.length - 1];
      const nextHistory = current.slice(0, -1);
      setDetailCursor(previous || undefined);
      return nextHistory;
    });
  };

  if (!canViewSensitiveInformation) {
    return <Navigate to="/d/admin/conversations" replace={true} />;
  }

  let listContent: JSX.Element;
  if (summaryQuery.isLoading) {
    listContent = (
      <div className="rounded-2xl border border-border-light bg-background p-6 text-sm text-text-secondary">
        {localize('com_ui_loading')}
      </div>
    );
  } else if (errorMessage) {
    listContent = (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-sm text-red-700 dark:text-red-300">
        {errorMessage}
      </div>
    );
  } else if (items.length === 0) {
    listContent = (
      <div className="rounded-2xl border border-border-light bg-background p-6 text-sm text-text-secondary">
        {localize('com_ui_no_results_found')}
      </div>
    );
  } else {
    listContent = (
      <div className="flex flex-col gap-3">
        {items.map((item) => (
          <div
            key={item.userId}
            className="grid gap-4 rounded-2xl border border-border-medium bg-background p-4 xl:grid-cols-[minmax(220px,1fr)_160px_160px_minmax(320px,2fr)] xl:items-center"
          >
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-wide text-text-secondary">
                {localize('com_ui_admin_sensitive_user')}
              </div>
              <div className="mt-1 break-all text-sm font-medium text-text-primary">
                {formatSensitiveUser(item)}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-text-secondary">
                {localize('com_ui_admin_sensitive_total_detections')}
              </div>
              <div className="mt-1 flex items-center gap-2 text-sm font-medium text-text-primary">
                <AlertTriangle className="h-4 w-4 text-amber-500" aria-hidden={true} />
                {item.totalCount}
              </div>
              <div className="mt-1 text-xs text-text-secondary">
                {localize('com_ui_admin_sensitive_submitted_count')}: {item.submittedCount} /{' '}
                {localize('com_ui_admin_sensitive_blocked_count')}: {item.blockedCount}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-text-secondary">
                {localize('com_ui_admin_sensitive_message_count')}
              </div>
              <div className="mt-1 text-sm font-medium text-text-primary">{item.messageCount}</div>
            </div>
            <div>
              <div className="mb-2 text-xs uppercase tracking-wide text-text-secondary">
                {localize('com_ui_admin_sensitive_rule_breakdown')}
              </div>
              <RuleSummaryList
                summaries={item.ruleSummaries}
                onSelect={(summary) =>
                  openDetails({
                    userId: item.userId,
                    userLabel: formatSensitiveUser(item),
                    ruleCode: summary.ruleCode,
                    ruleLabel: summary.label,
                  })
                }
              />
            </div>
            <div className="xl:col-span-4">
              <button
                type="button"
                className="admin-button-secondary inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm"
                onClick={() =>
                  openDetails({
                    userId: item.userId,
                    userLabel: formatSensitiveUser(item),
                  })
                }
              >
                <FileSearch className="h-4 w-4" aria-hidden={true} />
                {localize('com_ui_admin_sensitive_view_messages')}
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  }

  let detailContent: JSX.Element;
  if (detailQuery.isLoading) {
    detailContent = (
      <div className="rounded-2xl border border-border-light bg-background p-6 text-sm text-text-secondary">
        {localize('com_ui_loading')}
      </div>
    );
  } else if (detailErrorMessage) {
    detailContent = (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-sm text-red-700 dark:text-red-300">
        {detailErrorMessage}
      </div>
    );
  } else if (detailMessages.length === 0) {
    detailContent = (
      <div className="rounded-2xl border border-border-light bg-background p-6 text-sm text-text-secondary">
        {localize('com_ui_no_results_found')}
      </div>
    );
  } else {
    detailContent = (
      <div className="flex flex-col gap-3">
        {detailMessages.map((message) => (
          <article
            key={message.messageId}
            className="rounded-2xl border border-border-medium bg-background p-4"
          >
            <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={
                      message.outcome === 'blocked'
                        ? 'inline-flex rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-700 dark:text-red-200'
                        : 'inline-flex rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-800 dark:text-amber-200'
                    }
                  >
                    {message.outcome === 'blocked'
                      ? localize('com_ui_admin_sensitive_blocked_count')
                      : localize('com_ui_admin_sensitive_submitted_count')}
                  </span>
                  <span className="text-xs text-text-secondary">
                    {message.createdAt ? formatAdminDateTime(message.createdAt) : '-'}
                  </span>
                </div>
                <div className="mt-2 text-sm font-medium text-text-primary">
                  {formatSensitiveMessageUser(message)}
                </div>
                <div className="mt-1 text-xs text-text-secondary">
                  {message.conversationTitle || message.conversationId}
                  {message.model ? ` / ${message.model}` : ''}
                </div>
              </div>
              <div className="text-sm text-text-secondary">
                {localize('com_ui_admin_sensitive_total_detections')}:{' '}
                <span className="font-medium text-text-primary">{message.totalCount}</span>
              </div>
            </div>

            <div className="mt-4 whitespace-pre-wrap break-words rounded-xl border border-border-light bg-surface-primary px-3 py-3 text-sm leading-6 text-text-primary">
              {getMessagePreview(message)}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {message.ruleMatches.map((match) => (
                <span
                  key={`${message.messageId}-${match.ruleCode}`}
                  className="inline-flex rounded-full border border-border-medium px-2.5 py-1 text-xs text-text-secondary"
                >
                  {getRuleLabel(match.ruleCode)
                    ? localize(getRuleLabel(match.ruleCode) ?? 'com_ui_unknown')
                    : match.label}
                  : {match.count}
                </span>
              ))}
            </div>
          </article>
        ))}
      </div>
    );
  }

  return (
    <AdminLayout title={localize('com_ui_admin_sensitive_information')} hideHeader={true}>
      <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
        <section className="shrink-0 rounded-3xl border border-border-medium bg-surface-primary p-5">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-background text-text-primary">
                  <ShieldAlert className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-medium text-text-primary">
                    {localize('com_ui_admin_sensitive_information')}
                  </h1>
                  <AdminHelpButton
                    title="com_ui_admin_sensitive_information"
                    description="com_ui_admin_sensitive_information_description"
                  />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-border-light bg-background px-4 py-3">
                  <div className="text-xs text-text-secondary">
                    {localize('com_ui_admin_sensitive_total_detections')}
                  </div>
                  <div className="mt-1 text-lg font-medium text-text-primary">
                    {totalDetections}
                  </div>
                </div>
                <div className="rounded-2xl border border-border-light bg-background px-4 py-3">
                  <div className="text-xs text-text-secondary">
                    {localize('com_ui_admin_sensitive_message_count')}
                  </div>
                  <div className="mt-1 text-lg font-medium text-text-primary">{totalMessages}</div>
                </div>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <label className="flex flex-col gap-2 text-sm text-text-secondary xl:col-span-2">
                {localize('com_ui_admin_sensitive_user')}
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
                  <input
                    type="search"
                    value={userId}
                    onChange={(event) => setUserId(event.target.value)}
                    placeholder={localize('com_ui_admin_sensitive_user_search_placeholder')}
                    className="w-full rounded-xl border border-border-medium bg-background py-2 pl-9 pr-3 text-sm text-text-primary"
                  />
                </div>
              </label>
              <label className="flex flex-col gap-2 text-sm text-text-secondary">
                {localize('com_ui_admin_sensitive_rule')}
                <select
                  value={ruleCode}
                  onChange={(event) => setRuleCode(event.target.value)}
                  className="w-full rounded-xl border border-border-medium bg-background px-3 py-2 text-sm text-text-primary"
                >
                  {sensitiveRuleOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {localize(option.labelKey)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-2 text-sm text-text-secondary">
                {localize('com_ui_admin_created_after')}
                <AdminDateTimePicker
                  mode="date"
                  value={createdAfter}
                  onChange={setCreatedAfter}
                  ariaLabel={localize('com_ui_admin_created_after')}
                />
              </label>
              <label className="flex flex-col gap-2 text-sm text-text-secondary">
                {localize('com_ui_admin_created_before')}
                <AdminDateTimePicker
                  mode="date"
                  value={createdBefore}
                  onChange={setCreatedBefore}
                  ariaLabel={localize('com_ui_admin_created_before')}
                />
              </label>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <label className="flex w-full max-w-xs flex-col gap-2 text-sm text-text-secondary">
                {localize('com_ui_admin_sensitive_page_size')}
                <select
                  value={limit}
                  onChange={(event) => setLimit(Number(event.target.value))}
                  className="w-full rounded-xl border border-border-medium bg-background px-3 py-2 text-sm text-text-primary"
                >
                  {limitOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex gap-3">
                <button
                  type="button"
                  className="admin-button-secondary rounded-xl px-4 py-2 text-sm"
                  onClick={() => {
                    setUserId('');
                    setRuleCode('');
                    setCreatedAfter(defaultDate);
                    setCreatedBefore(defaultDate);
                    setCursor(undefined);
                    setCursorHistory([]);
                    setDetailSelection(null);
                    setDetailCursor(undefined);
                    setDetailCursorHistory([]);
                    setSubmittedFilters({
                      limit,
                      cursor: undefined,
                      ...defaultDateRange,
                    });
                  }}
                >
                  {localize('com_ui_reset')}
                </button>
                <button
                  type="button"
                  className="admin-button-primary rounded-xl px-4 py-2 text-sm"
                  onClick={applyFilters}
                >
                  {localize('com_ui_search')}
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-border-medium bg-surface-primary">
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-5">
            {listContent}
          </div>

          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border-light px-5 py-4">
            <div className="text-sm text-text-secondary">
              {summaryQuery.data?.startAt && summaryQuery.data?.endAt
                ? `${formatAdminDateTime(summaryQuery.data.startAt)} - ${formatAdminDateTime(
                    summaryQuery.data.endAt,
                  )}`
                : '-'}
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden text-sm text-text-secondary sm:block">
                {localize('com_ui_admin_cursor_page')}
              </div>
              <button
                type="button"
                disabled={cursorHistory.length === 0}
                className="admin-button-secondary rounded-xl px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                onClick={goPreviousPage}
              >
                {localize('com_ui_back')}
              </button>
              <button
                type="button"
                disabled={!summaryQuery.data?.nextCursor}
                className="admin-button-secondary rounded-xl px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                onClick={goNextPage}
              >
                {localize('com_ui_admin_next_page')}
              </button>
              <button
                type="button"
                className="admin-button-secondary rounded-xl px-4 py-2 text-sm"
                onClick={() => summaryQuery.refetch()}
              >
                {localize('com_ui_refresh')}
              </button>
            </div>
          </div>
        </section>

        <OGDialog
          open={detailSelection != null}
          onOpenChange={(open) => {
            if (!open) {
              setDetailSelection(null);
              setDetailCursor(undefined);
              setDetailCursorHistory([]);
            }
          }}
        >
          <OGDialogPortal>
            <OGDialogOverlay className="bg-black/50 backdrop-blur-sm" />
            <OGDialogContent
              className="admin-console fixed left-1/2 top-1/2 z-50 flex h-[min(760px,calc(100vh-2rem))] w-[min(1080px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-3xl border border-border-medium bg-surface-primary shadow-2xl focus:outline-none"
              showCloseButton={true}
            >
              <div className="shrink-0 border-b border-border-light px-6 py-5">
                <OGDialogTitle className="text-lg font-semibold text-text-primary">
                  {localize('com_ui_admin_sensitive_message_details')}
                </OGDialogTitle>
                <div className="mt-2 flex flex-wrap gap-2 text-sm text-text-secondary">
                  <span>{detailSelection?.userLabel}</span>
                  {detailSelection?.ruleLabel ? <span>/ {detailSelection.ruleLabel}</span> : null}
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{detailContent}</div>

              <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border-light px-6 py-4">
                <div className="text-sm text-text-secondary">
                  {localize('com_ui_admin_cursor_page')}
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    disabled={detailCursorHistory.length === 0}
                    className="admin-button-secondary rounded-xl px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={goPreviousDetailPage}
                  >
                    {localize('com_ui_back')}
                  </button>
                  <button
                    type="button"
                    disabled={!detailQuery.data?.nextCursor}
                    className="admin-button-secondary rounded-xl px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={goNextDetailPage}
                  >
                    {localize('com_ui_admin_next_page')}
                  </button>
                </div>
              </div>
            </OGDialogContent>
          </OGDialogPortal>
        </OGDialog>
      </div>
    </AdminLayout>
  );
}
