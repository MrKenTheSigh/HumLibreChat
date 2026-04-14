import type { TMessage } from 'librechat-data-provider';
import {
  HoverCard,
  HoverCardContent,
  HoverCardPortal,
  HoverCardTrigger,
  Spinner,
} from '@librechat/client';
import { useState } from 'react';
import { useGetMessageUsageDetail } from '~/data-provider';
import { useLocalize } from '~/hooks';
import { cn, formatCreditCompact, formatCreditExact } from '~/utils';

type MessageCreditUsageProps = {
  message: TMessage;
  conversationId?: string;
};

function isAssistantLikeMessage(message: TMessage): boolean {
  if (message.sender === 'User') {
    return false;
  }

  if (message.isCreatedByUser === true && message.sender == null) {
    return false;
  }

  return true;
}

export default function MessageCreditUsage(props: MessageCreditUsageProps) {
  const { message } = props;
  const localize = useLocalize();
  const [open, setOpen] = useState(false);

  const creditUsage = message.creditUsage;
  const resolvedConversationId = props.conversationId ?? message.conversationId ?? '';
  const shouldLoadDetail =
    open && resolvedConversationId.length > 0 && message.messageId.length > 0;
  const { data: usageDetail, isLoading: isLoadingUsageDetail } = useGetMessageUsageDetail(
    {
      conversationId: resolvedConversationId,
      messageId: message.messageId,
    },
    {
      enabled: shouldLoadDetail,
      staleTime: 5 * 60 * 1000,
    },
  );
  const spentLabel =
    typeof creditUsage?.spentCredits === 'number'
      ? creditUsage.status === 'estimated'
        ? localize('com_ui_credit_spent_estimated', {
            0: formatCreditCompact(creditUsage.spentCredits),
          })
        : localize('com_ui_credit_spent', {
            0: formatCreditCompact(creditUsage.spentCredits),
          })
      : localize('com_ui_credit_spent_placeholder');

  const badgeClassName =
    typeof creditUsage?.spentCredits === 'number'
      ? creditUsage.status === 'estimated'
        ? 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200'
        : 'border-sky-500/30 bg-sky-500/10 text-sky-800 dark:text-sky-200'
      : isAssistantLikeMessage(message)
        ? 'border-border-medium bg-surface-secondary text-text-secondary'
        : 'border-border-light bg-transparent text-text-tertiary';

  const hoverSpentCredits =
    typeof usageDetail?.spentCredits === 'number'
      ? usageDetail.spentCredits
      : typeof creditUsage?.spentCredits === 'number'
        ? creditUsage.spentCredits
        : null;

  const transactions = usageDetail?.transactions ?? [];

  return (
    <HoverCard openDelay={100} open={open} onOpenChange={setOpen}>
      <HoverCardTrigger asChild>
        <div
          className={cn(
            'inline-flex min-w-fit cursor-default items-center rounded-full border px-2 py-0.5 text-[11px] font-medium',
            badgeClassName,
          )}
          aria-label={spentLabel}
          title={spentLabel}
          data-testid="message-credit-usage"
        >
          {spentLabel}
        </div>
      </HoverCardTrigger>
      <HoverCardPortal>
        <HoverCardContent side="top" align="start" className="z-[999] w-80 p-3">
          <div className="flex flex-col gap-3 text-xs">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-semibold text-text-primary">
                {localize('com_ui_credit_usage_detail_title')}
              </span>
              <span className="font-medium text-text-secondary">
                {hoverSpentCredits == null ? '--' : formatCreditExact(hoverSpentCredits)}
              </span>
            </div>
            {isLoadingUsageDetail ? (
              <div className="flex items-center gap-2 text-text-secondary">
                <Spinner className="size-4" />
                <span>{localize('com_ui_credit_usage_loading')}</span>
              </div>
            ) : transactions.length > 0 ? (
              <div className="flex flex-col gap-2">
                {transactions.map((transaction, index) => {
                  const tokenCount =
                    transaction.inputTokens ?? transaction.writeTokens ?? transaction.readTokens;
                  const tokenLabel =
                    tokenCount == null ? null : new Intl.NumberFormat().format(tokenCount);
                  const modelOrContext = transaction.model ?? transaction.context ?? '--';

                  return (
                    <div
                      key={`${transaction.tokenType}-${transaction.createdAt ?? 'na'}-${index}`}
                      className="rounded-lg border border-border-light bg-surface-primary px-2.5 py-2"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium text-text-primary">
                          {localize(`com_ui_credit_usage_type_${transaction.tokenType}`)}
                        </span>
                        <span className="text-text-secondary">
                          {typeof transaction.tokenValue === 'number'
                            ? formatCreditExact(Math.abs(transaction.tokenValue))
                            : '--'}
                        </span>
                      </div>
                      {tokenLabel == null ? (
                        <div className="mt-1 text-text-secondary">
                          <span className="truncate">{modelOrContext}</span>
                        </div>
                      ) : (
                        <div className="mt-1 flex items-center justify-between gap-3 text-text-secondary">
                          <span className="truncate">{modelOrContext}</span>
                          <span>{localize('com_ui_credit_usage_tokens', { 0: tokenLabel })}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-text-secondary">
                {localize('com_ui_credit_usage_unavailable')}
              </div>
            )}
          </div>
        </HoverCardContent>
      </HoverCardPortal>
    </HoverCard>
  );
}
