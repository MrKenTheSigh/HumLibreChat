import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ClipboardCheck, X } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { dataService } from 'librechat-data-provider';
import { useParams, useSearchParams } from 'react-router-dom';
import type {
  AdminManagerReviewBatch,
  AdminManagerReviewBatchStatus,
  AdminManagerReviewItemStatus,
  AdminManagerReviewRiskLevel,
} from 'librechat-data-provider';
import type { TranslationKeys } from '~/hooks/useLocalize';
import { useLocalize } from '~/hooks';

function formatNumber(value: number) {
  return new Intl.NumberFormat().format(value);
}

function formatDateTime(value: string | null) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function buildSummaryCards(batch: AdminManagerReviewBatch) {
  const cards: Array<[TranslationKeys, number]> = [
    ['com_ui_admin_review_items', batch.itemCount],
    ['com_ui_admin_usage_summary_transactions', batch.transactionCount],
    ['com_ui_admin_usage_summary_token_value', batch.totalTokenValue],
    ['com_ui_admin_usage_summary_raw_amount', batch.totalRawAmount],
  ];
  return cards;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
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

function getStatusLabelKey(status: AdminManagerReviewBatchStatus): TranslationKeys {
  const keys: Record<AdminManagerReviewBatchStatus, TranslationKeys> = {
    cancelled: 'com_ui_admin_review_status_cancelled',
    generated: 'com_ui_admin_review_status_generated',
    overdue: 'com_ui_admin_review_status_overdue',
    reviewed: 'com_ui_admin_review_status_reviewed',
    sent: 'com_ui_admin_review_status_sent',
  };
  return keys[status];
}

type OperationDialog = {
  message: string;
  title: string;
  variant: 'success' | 'error';
};

export default function ManagerReviewResponsePage() {
  const localize = useLocalize();
  const { batchId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [responseText, setResponseText] = useState('');
  const [itemCursorStack, setItemCursorStack] = useState<string[]>([]);
  const [itemCursor, setItemCursor] = useState<string | undefined>();
  const [submittedBatch, setSubmittedBatch] = useState<AdminManagerReviewBatch | null>(null);
  const [operationDialog, setOperationDialog] = useState<OperationDialog | null>(null);
  const canQuery = batchId.length > 0 && token.length > 0;

  const batchQuery = useQuery(
    ['managerReviewPublicBatch', batchId, token],
    () => dataService.getManagerReviewBatchByToken({ batchId, token }),
    {
      enabled: canQuery,
      retry: false,
      refetchOnWindowFocus: false,
    },
  );
  const batchItemsQuery = useQuery(
    ['managerReviewPublicBatchItems', batchId, token, itemCursor],
    () =>
      dataService.getManagerReviewBatchItemsByToken({
        batchId,
        token,
        cursor: itemCursor,
        limit: 20,
      }),
    {
      enabled: canQuery && batchQuery.isSuccess,
      retry: false,
      refetchOnWindowFocus: false,
    },
  );

  const submitMutation = useMutation(dataService.submitManagerReviewBatchResponseByToken);
  const batch = submittedBatch ?? batchQuery.data?.batch ?? null;
  const batchItems = batchItemsQuery.data?.items ?? [];
  const summaryCards = useMemo(() => (batch ? buildSummaryCards(batch) : []), [batch]);
  const isReviewed = batch?.status === 'reviewed';

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

  const submitResponse = async (responseStatus: 'ok' | 'not_ok') => {
    if (!canQuery || submitMutation.isLoading || isReviewed) {
      return;
    }

    try {
      const response = await submitMutation.mutateAsync({
        batchId,
        token,
        responseStatus,
        responseText,
      });
      setSubmittedBatch(response.batch);
      await batchItemsQuery.refetch();
      setOperationDialog({
        title: localize('com_ui_manager_review_submitted'),
        message: localize('com_ui_manager_review_submitted'),
        variant: 'success',
      });
    } catch (error) {
      setOperationDialog({
        title: localize('com_ui_error'),
        message: getErrorMessage(error, localize('com_ui_error')),
        variant: 'error',
      });
    }
  };

  return (
    <main className="min-h-screen bg-background px-4 py-8 text-text-primary">
      {operationDialog ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="manager-review-operation-dialog-title"
            className="w-full max-w-md rounded-2xl border border-border-medium bg-surface-primary p-5 text-text-primary shadow-2xl"
          >
            <div className="flex items-start gap-3">
              <div
                className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                  operationDialog.variant === 'success'
                    ? 'bg-green-500/15 text-green-600 dark:text-green-300'
                    : 'bg-red-500/15 text-red-600 dark:text-red-300'
                }`}
              >
                {operationDialog.variant === 'success' ? (
                  <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                ) : (
                  <AlertTriangle className="h-5 w-5" aria-hidden="true" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h2
                  id="manager-review-operation-dialog-title"
                  className="text-base font-medium"
                >
                  {operationDialog.title}
                </h2>
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
          </div>
        </div>
      ) : null}
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
        <header className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-surface-primary">
            <ClipboardCheck className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-lg font-medium">{localize('com_ui_manager_review_title')}</h1>
            <p className="mt-1 text-sm text-text-secondary">
              {localize('com_ui_manager_review_description')}
            </p>
          </div>
        </header>

        {!canQuery ? (
          <section className="rounded-2xl border border-red-400/40 bg-red-500/10 p-5 text-sm text-red-600">
            {localize('com_ui_manager_review_invalid_link')}
          </section>
        ) : batchQuery.isLoading ? (
          <section className="rounded-2xl border border-border-medium bg-surface-primary p-5 text-sm text-text-secondary">
            {localize('com_ui_loading')}
          </section>
        ) : batchQuery.isError ? (
          <section className="rounded-2xl border border-red-400/40 bg-red-500/10 p-5 text-sm text-red-600">
            {getErrorMessage(batchQuery.error, localize('com_ui_manager_review_invalid_link'))}
          </section>
        ) : batch ? (
          <>
            <section className="rounded-2xl border border-border-medium bg-surface-primary p-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="text-sm text-text-secondary">
                    {localize('com_ui_manager_review_period')}
                  </div>
                  <div className="mt-1 text-base font-medium">
                    {formatDateTime(batch.periodStart)} - {formatDateTime(batch.periodEnd)}
                  </div>
                </div>
                <div className="rounded-full border border-border-medium px-3 py-1 text-xs text-text-secondary">
                  {localize(getStatusLabelKey(batch.status))}
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {summaryCards.map(([labelKey, value]) => (
                  <div
                    key={labelKey}
                    className="rounded-xl border border-border-light bg-background px-3 py-2"
                  >
                    <div className="text-xs uppercase text-text-secondary">
                      {localize(labelKey)}
                    </div>
                    <div className="mt-1 text-sm font-medium">{formatNumber(value)}</div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-border-medium bg-surface-primary p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-medium">
                    {localize('com_ui_admin_review_item_details')}
                  </h2>
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
                        <td colSpan={9} className="px-3 py-5 text-text-secondary">
                          {localize('com_ui_loading')}
                        </td>
                      </tr>
                    ) : batchItems.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-3 py-5 text-text-secondary">
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
                              {formatDateTime(item.newestTransactionAt)}
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
            </section>

            <section className="rounded-2xl border border-border-medium bg-surface-primary p-5">
              <h2 className="text-base font-medium">
                {localize('com_ui_manager_review_response_title')}
              </h2>
              {isReviewed ? (
                <div className="mt-3 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-700 dark:text-green-300">
                  {localize('com_ui_manager_review_already_reviewed')}
                </div>
              ) : null}
              <textarea
                value={responseText}
                onChange={(event) => setResponseText(event.target.value)}
                placeholder={localize('com_ui_admin_review_response_note')}
                disabled={isReviewed || submitMutation.isLoading}
                className="mt-4 min-h-32 w-full rounded-xl border border-border-medium bg-background px-3 py-2 text-sm text-text-primary disabled:opacity-60"
              />
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  className="admin-button-primary rounded-xl px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isReviewed || submitMutation.isLoading}
                  onClick={() => submitResponse('ok')}
                >
                  {localize('com_ui_admin_review_response_ok')}
                </button>
                <button
                  type="button"
                  className="admin-button-secondary rounded-xl px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isReviewed || submitMutation.isLoading}
                  onClick={() => submitResponse('not_ok')}
                >
                  {localize('com_ui_admin_review_response_not_ok')}
                </button>
              </div>
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
