import { memo, Suspense, useMemo } from 'react';
import { useRecoilValue } from 'recoil';
import { DelayedRender } from '@librechat/client';
import type { TMessage } from 'librechat-data-provider';
import type { TMessageContentProps, TDisplayProps } from '~/common';
import Error from '~/components/Messages/Content/Error';
import { useMessageContext } from '~/Providers';
import MarkdownLite from './MarkdownLite';
import EditMessage from './EditMessage';
import Thinking from './Parts/Thinking';
import { useLocalize } from '~/hooks';
import Container from './Container';
import Markdown from './Markdown';
import { cn } from '~/utils';
import store from '~/store';

const ERROR_CONNECTION_TEXT = 'Error connecting to server, try refreshing the page.';
const DELAYED_ERROR_TIMEOUT = 5500;
const UNFINISHED_DELAY = 250;

const parseThinkingContent = (text: string) => {
  const thinkingMatch = text.match(/:::thinking([\s\S]*?):::/);
  return {
    thinkingContent: thinkingMatch ? thinkingMatch[1].trim() : '',
    regularContent: thinkingMatch ? text.replace(/:::thinking[\s\S]*?:::/, '').trim() : text,
  };
};

const LoadingFallback = () => (
  <div className="text-message mb-[0.625rem] flex min-h-[20px] flex-col items-start gap-3 overflow-visible">
    <div className="markdown prose dark:prose-invert light w-full break-words dark:text-gray-100">
      <div className="absolute">
        <p className="submitting relative">
          <span className="result-thinking" />
        </p>
      </div>
    </div>
  </div>
);

const ErrorBox = ({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <div
    role="alert"
    aria-live="assertive"
    className={cn(
      'rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2 text-sm text-gray-600 dark:text-gray-200',
      className,
    )}
  >
    {children}
  </div>
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function isSensitivePolicyBlockedMessage(message?: TMessage) {
  const policy = isRecord(message?.metadata)
    ? message.metadata.sensitiveInformationPolicy
    : undefined;
  const blockedByMetadata = isRecord(policy) && policy.blocked === true;
  return message?.finish_reason === 'sensitive_information_policy_blocked' || blockedByMetadata;
}

function isSensitivePolicyWarnedMessage(message?: TMessage) {
  const policy = isRecord(message?.metadata)
    ? message.metadata.sensitiveInformationPolicy
    : undefined;
  return isRecord(policy) && policy.warned === true;
}

function getSensitivePolicyRemainingToBlock(message?: TMessage) {
  const policy = isRecord(message?.metadata)
    ? message.metadata.sensitiveInformationPolicy
    : undefined;
  const decisions = isRecord(policy) && Array.isArray(policy.decisions) ? policy.decisions : [];
  const remainingCounts = decisions
    .map((decision) =>
      isRecord(decision) && typeof decision.remainingToBlock === 'number'
        ? decision.remainingToBlock
        : null,
    )
    .filter((count): count is number => count != null && Number.isFinite(count) && count > 0);

  return remainingCounts.length > 0 ? Math.min(...remainingCounts) : null;
}

const ConnectionError = ({ message }: { message?: TMessage }) => {
  const localize = useLocalize();

  return (
    <Suspense fallback={<LoadingFallback />}>
      <DelayedRender delay={DELAYED_ERROR_TIMEOUT}>
        <Container message={message}>
          <div className="mt-2 rounded-xl border border-red-500/20 bg-red-50/50 px-4 py-3 text-sm text-red-700 shadow-sm transition-all dark:bg-red-950/30 dark:text-red-100">
            {localize('com_ui_error_connection')}
          </div>
        </Container>
      </DelayedRender>
    </Suspense>
  );
};

export const ErrorMessage = ({
  text,
  message,
  className = '',
}: Pick<TDisplayProps, 'text' | 'className'> & { message?: TMessage }) => {
  if (text === ERROR_CONNECTION_TEXT) {
    return <ConnectionError message={message} />;
  }

  return (
    <Container message={message}>
      <ErrorBox className={className}>
        <Error text={text} />
      </ErrorBox>
    </Container>
  );
};

const DisplayMessage = ({ text, isCreatedByUser, message, showCursor }: TDisplayProps) => {
  const { isSubmitting = false, isLatestMessage = false } = useMessageContext();
  const enableUserMsgMarkdown = useRecoilValue(store.enableUserMsgMarkdown);
  const localize = useLocalize();
  const isSensitiveBlocked = isSensitivePolicyBlockedMessage(message);
  const isSensitiveWarned = isSensitivePolicyWarnedMessage(message);
  const sensitiveRemainingToBlock = getSensitivePolicyRemainingToBlock(message);

  const showCursorState = useMemo(
    () => showCursor === true && isSubmitting,
    [showCursor, isSubmitting],
  );

  const content = useMemo(() => {
    if (!isCreatedByUser) {
      return <Markdown content={text} isLatestMessage={isLatestMessage} />;
    }
    if (enableUserMsgMarkdown) {
      return <MarkdownLite content={text} />;
    }
    return <>{text}</>;
  }, [isCreatedByUser, enableUserMsgMarkdown, text, isLatestMessage]);

  return (
    <Container message={message}>
      {isSensitiveBlocked ? (
        <div className="mb-2 inline-flex rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs font-medium text-red-700 dark:text-red-200">
          {localize('com_error_sensitive_policy_blocked')}
        </div>
      ) : null}
      {!isSensitiveBlocked && isSensitiveWarned ? (
        <div className="mb-2 inline-flex rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-800 dark:text-amber-200">
          {sensitiveRemainingToBlock != null
            ? localize('com_error_sensitive_policy_warning_remaining', {
                0: sensitiveRemainingToBlock,
              })
            : localize('com_error_sensitive_policy_warning')}
        </div>
      ) : null}
      <div
        className={cn(
          'markdown prose message-content dark:prose-invert light w-full break-words',
          isSubmitting && 'submitting',
          showCursorState && text.length > 0 && 'result-streaming',
          isCreatedByUser && !enableUserMsgMarkdown && 'whitespace-pre-wrap',
          isCreatedByUser ? 'dark:text-gray-20' : 'dark:text-gray-100',
        )}
      >
        {content}
      </div>
    </Container>
  );
};

export const UnfinishedMessage = ({ message }: { message: TMessage }) => (
  <ErrorMessage
    message={message}
    text="The response is incomplete; it's either still processing, was cancelled, or censored. Refresh or try a different prompt."
  />
);

const MessageContent = ({
  text,
  edit,
  error,
  unfinished,
  isSubmitting,
  isLast,
  ...props
}: TMessageContentProps) => {
  const { message } = props;
  const { messageId } = message;
  const isSensitiveBlocked = isSensitivePolicyBlockedMessage(message);

  const { thinkingContent, regularContent } = useMemo(() => parseThinkingContent(text), [text]);
  const showRegularCursor = useMemo(() => isLast && isSubmitting, [isLast, isSubmitting]);

  const unfinishedMessage = useMemo(
    () =>
      !isSubmitting && unfinished ? (
        <Suspense>
          <DelayedRender delay={UNFINISHED_DELAY}>
            <UnfinishedMessage message={message} />
          </DelayedRender>
        </Suspense>
      ) : null,
    [isSubmitting, unfinished, message],
  );

  if (error && !isSensitiveBlocked) {
    return <ErrorMessage message={message} text={text} />;
  }

  if (edit) {
    return <EditMessage text={text} isSubmitting={isSubmitting} {...props} />;
  }

  return (
    <>
      {thinkingContent.length > 0 && (
        <Thinking key={`thinking-${messageId}`}>{thinkingContent}</Thinking>
      )}
      <DisplayMessage
        key={`display-${messageId}`}
        showCursor={showRegularCursor}
        text={regularContent}
        {...props}
      />
      {unfinishedMessage}
    </>
  );
};

const MemoizedMessageContent = memo(MessageContent);
MemoizedMessageContent.displayName = 'MessageContent';

export default MemoizedMessageContent;
